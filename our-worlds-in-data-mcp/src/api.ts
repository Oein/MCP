/**
 * Our World in Data 공개 API 클라이언트.
 *
 * 사용하는 엔드포인트
 *  - https://ourworldindata.org/api/search        차트/문서 검색
 *  - https://ourworldindata.org/grapher/{slug}.*  차트 데이터(csv), 메타데이터, readme
 *  - https://search.owid.io/indicators            지표 시맨틱 검색
 *  - https://api.ourworldindata.org/v1/indicators 지표 단위 데이터/메타데이터
 */

const SITE = "https://ourworldindata.org";
const SEMANTIC = "https://search.owid.io";
const INDICATORS = "https://api.ourworldindata.org/v1/indicators";

const USER_AGENT = "owid-mcp/0.1 (+https://ourworldindata.org)";
const TIMEOUT_MS = 30_000;

export class OwidError extends Error {}

async function request(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { accept, "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 403) {
      throw new OwidError(
        `403: 이 데이터는 재배포가 제한된(nonRedistributable) 출처입니다. 원 출처에서 직접 받아야 합니다. (${url})`,
      );
    }
    if (res.status === 404) {
      throw new OwidError(`404: 리소스를 찾을 수 없습니다. slug/id를 확인하세요. (${url})`);
    }
    throw new OwidError(`OWID 요청 실패 ${res.status} ${res.statusText}: ${body} (${url})`);
  }
  return res;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await request(url, "application/json");
  return (await res.json()) as T;
}

async function getText(url: string): Promise<string> {
  const res = await request(url, "text/plain,*/*");
  return await res.text();
}

/** 국가 목록을 grapher가 쓰는 `~` 구분 형식으로. ISO3 코드와 국가명 모두 허용된다. */
function joinEntities(entities?: string[]): string | undefined {
  if (!entities || entities.length === 0) return undefined;
  return entities.join("~");
}

function buildUrl(base: string, params: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/* ------------------------------------------------------------------ 검색 */

export interface ChartHit {
  title: string;
  slug: string;
  variantName?: string;
  subtitle?: string;
  type?: string;
  availableEntities?: string[];
  tags?: string[];
}

export interface ChartSearchResult {
  query: string;
  nbHits: number;
  page: number;
  nbPages: number;
  results: ChartHit[];
}

export async function searchCharts(opts: {
  query: string;
  countries?: string[];
  topics?: string;
  requireAllCountries?: boolean;
  page?: number;
  hitsPerPage?: number;
}): Promise<ChartSearchResult> {
  const url = buildUrl(`${SITE}/api/search`, {
    q: opts.query,
    type: "charts",
    countries: joinEntities(opts.countries),
    topics: opts.topics,
    requireAllCountries: opts.requireAllCountries,
    page: opts.page,
    hitsPerPage: opts.hitsPerPage,
  });
  return await getJson<ChartSearchResult>(url);
}

export interface PageHit {
  type?: string;
  slug: string;
  title: string;
  content?: string;
  excerpt?: string;
  date?: string;
  modifiedDate?: string;
  authors?: string[];
  tags?: string[];
}

export interface PageSearchResult {
  query: string;
  nbHits: number;
  results: PageHit[];
}

export async function searchPages(opts: {
  query: string;
  pageTypes?: string;
  page?: number;
  hitsPerPage?: number;
}): Promise<PageSearchResult> {
  const url = buildUrl(`${SITE}/api/search`, {
    q: opts.query,
    type: "pages",
    pageTypes: opts.pageTypes,
    page: opts.page,
    hitsPerPage: opts.hitsPerPage,
  });
  return await getJson<PageSearchResult>(url);
}

export interface IndicatorHit {
  title: string;
  indicator_id: number;
  score: number;
  description?: string;
  snippet?: string;
  n_charts?: number;
  popularity?: number;
  catalog_path?: string;
  metadata?: {
    unit?: string;
    column?: string;
    catalog_path?: string;
    parquet_url?: string;
    run_sql_template?: string;
  };
}

export async function searchIndicators(opts: {
  query: string;
  limit?: number;
  minPopularity?: number;
}): Promise<{ query: string; total_results: number; results: IndicatorHit[] }> {
  const url = buildUrl(`${SEMANTIC}/indicators`, {
    q: opts.query,
    limit: opts.limit,
    min_popularity: opts.minPopularity,
  });
  return await getJson(url);
}

/* -------------------------------------------------------------- 차트 데이터 */

export interface ChartDataOptions {
  slug: string;
  countries?: string[];
  /** "2000..2020", "latest", "1990" 등 grapher time 문법 */
  time?: string;
  /** true면 컬럼명이 기계 친화적인 short name으로 나온다 */
  useColumnShortNames?: boolean;
  /** filtered(선택한 국가/기간만) 또는 full(전체) */
  csvType?: "filtered" | "full";
  tab?: string;
}

function chartUrl(slug: string, suffix: string, opts: ChartDataOptions): string {
  return buildUrl(`${SITE}/grapher/${encodeURIComponent(slug)}${suffix}`, {
    csvType: opts.csvType ?? "filtered",
    country: joinEntities(opts.countries),
    time: opts.time,
    tab: opts.tab,
    useColumnShortNames: opts.useColumnShortNames,
  });
}

export async function getChartCsv(opts: ChartDataOptions): Promise<{ url: string; csv: string }> {
  const url = chartUrl(opts.slug, ".csv", opts);
  return { url, csv: await getText(url) };
}

export interface ChartMetadata {
  chart?: {
    title?: string;
    subtitle?: string;
    citation?: string;
    originalChartUrl?: string;
    selection?: string[];
  };
  columns?: Record<string, Record<string, unknown>>;
  dateDownloaded?: string;
}

export async function getChartMetadata(opts: ChartDataOptions): Promise<{ url: string; metadata: ChartMetadata }> {
  const url = chartUrl(opts.slug, ".metadata.json", opts);
  return { url, metadata: await getJson<ChartMetadata>(url) };
}

export async function getChartReadme(slug: string): Promise<{ url: string; readme: string }> {
  const url = `${SITE}/grapher/${encodeURIComponent(slug)}.readme.md`;
  return { url, readme: await getText(url) };
}

/* ------------------------------------------------------------------- 지표 */

export interface IndicatorMetadata {
  id: number;
  name: string;
  unit?: string;
  shortUnit?: string;
  timespan?: string;
  catalogPath?: string;
  datasetName?: string;
  descriptionShort?: string;
  display?: Record<string, unknown>;
  origins?: Array<Record<string, unknown>>;
  presentation?: Record<string, unknown>;
  dimensions?: {
    years?: { values: Array<{ id: number }> };
    entities?: { values: Array<{ id: number; name: string; code: string | null }> };
  };
}

export async function getIndicatorMetadata(id: number): Promise<IndicatorMetadata> {
  return await getJson<IndicatorMetadata>(`${INDICATORS}/${id}.metadata.json`);
}

export interface IndicatorRow {
  entity: string;
  code: string | null;
  year: number;
  value: number | string;
}

/** 지표의 long-format 데이터. values/years/entities 병렬 배열을 행 단위로 합친다. */
export async function getIndicatorRows(
  id: number,
  filter: { entities?: string[]; yearFrom?: number; yearTo?: number },
): Promise<{ metadata: IndicatorMetadata; rows: IndicatorRow[]; totalRows: number }> {
  const [metadata, data] = await Promise.all([
    getIndicatorMetadata(id),
    getJson<{ values: Array<number | string>; years: number[]; entities: number[] }>(
      `${INDICATORS}/${id}.data.json`,
    ),
  ]);

  const byId = new Map<number, { name: string; code: string | null }>();
  for (const e of metadata.dimensions?.entities?.values ?? []) {
    byId.set(e.id, { name: e.name, code: e.code });
  }

  const wanted = filter.entities?.length
    ? new Set(filter.entities.map((e) => e.toLowerCase()))
    : undefined;

  const rows: IndicatorRow[] = [];
  for (let i = 0; i < data.values.length; i++) {
    const year = data.years[i];
    if (filter.yearFrom !== undefined && year < filter.yearFrom) continue;
    if (filter.yearTo !== undefined && year > filter.yearTo) continue;

    const entity = byId.get(data.entities[i]);
    const name = entity?.name ?? String(data.entities[i]);
    const code = entity?.code ?? null;
    if (wanted && !wanted.has(name.toLowerCase()) && !(code && wanted.has(code.toLowerCase()))) {
      continue;
    }
    rows.push({ entity: name, code, year, value: data.values[i] });
  }

  return { metadata, rows, totalRows: rows.length };
}
