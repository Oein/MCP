#!/usr/bin/env node
/**
 * Our World in Data MCP 서버 (stdio).
 *
 * OWID의 공개 API를 MCP 도구로 노출한다. 인증 키가 필요 없다.
 * 데이터는 CC BY 4.0 — 사용 시 출처를 표기해야 한다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  OwidError,
  getChartCsv,
  getChartMetadata,
  getChartReadme,
  getIndicatorMetadata,
  getIndicatorRows,
  searchCharts,
  searchIndicators,
  searchPages,
} from "./api.js";

const server = new McpServer(
  { name: "our-world-in-data", version: "0.1.0" },
  {
    instructions:
      "Our World in Data(OWID)의 공개 데이터에 접근한다. 일반적인 흐름: " +
      "owid_search_charts로 차트 slug를 찾고 → owid_get_chart_data로 CSV를 받고 → " +
      "필요하면 owid_get_chart_metadata로 정의·출처를 확인한다. " +
      "차트가 없는 세부 지표는 owid_search_indicators(시맨틱 검색) → owid_get_indicator_data를 쓴다. " +
      "모든 데이터는 CC BY 4.0이며 결과를 인용할 때 출처를 표기할 것.",
  },
);

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function text(value: unknown): ToolResult {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: body }] };
}

/** 도구 핸들러 공통 에러 처리 — 예외 대신 isError 결과로 모델에 되돌려준다. */
function guard<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      const msg =
        err instanceof OwidError
          ? err.message
          : err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err);
      return { content: [{ type: "text", text: `오류: ${msg}` }], isError: true };
    }
  };
}

/** CSV를 maxRows 행으로 자르고, 잘렸으면 안내 문구를 덧붙인다. */
function truncateCsv(csv: string, maxRows: number): string {
  const lines = csv.trimEnd().split("\n");
  const header = lines[0] ?? "";
  const body = lines.slice(1);
  if (body.length <= maxRows) return csv.trimEnd();
  return [
    header,
    ...body.slice(0, maxRows),
    `... (전체 ${body.length}행 중 ${maxRows}행만 표시. countries/time으로 범위를 좁히거나 max_rows를 늘리세요)`,
  ].join("\n");
}

const countriesSchema = z
  .array(z.string())
  .optional()
  .describe("국가/지역 목록. ISO3 코드(KOR, USA) 또는 OWID 엔티티명(South Korea, World, Asia)");

/* ------------------------------------------------------------------ 검색 */

server.registerTool(
  "owid_search_charts",
  {
    title: "OWID 차트 검색",
    description:
      "Our World in Data의 차트를 키워드로 검색한다. 반환된 slug를 owid_get_chart_data에 넣어 실제 데이터를 받는다.",
    inputSchema: {
      query: z.string().describe("검색어 (영어 권장, 예: 'life expectancy', 'co2 emissions')"),
      countries: countriesSchema.describe("이 국가들의 데이터를 가진 차트로 제한 (엔티티명 사용)"),
      topics: z.string().optional().describe("주제 필터 (예: 'Health', 'Energy')"),
      require_all_countries: z.boolean().optional().describe("지정한 모든 국가를 포함하는 차트만"),
      limit: z.number().int().min(1).max(100).default(10).describe("결과 개수"),
      page: z.number().int().min(0).optional().describe("0부터 시작하는 페이지 번호"),
    },
  },
  guard(async (args) => {
    const res = await searchCharts({
      query: args.query,
      countries: args.countries,
      topics: args.topics,
      requireAllCountries: args.require_all_countries,
      hitsPerPage: args.limit,
      page: args.page,
    });
    // availableEntities는 수천 개라 통째로 넣으면 컨텍스트를 잡아먹는다. 개수만 남긴다.
    return text({
      total_hits: res.nbHits,
      page: res.page,
      total_pages: res.nbPages,
      results: (res.results ?? []).map((r) => ({
        title: r.title,
        slug: r.slug,
        variant: r.variantName,
        subtitle: r.subtitle,
        url: `https://ourworldindata.org/grapher/${r.slug}`,
        entity_count: r.availableEntities?.length,
        tags: r.tags,
      })),
    });
  }),
);

server.registerTool(
  "owid_search_articles",
  {
    title: "OWID 글/데이터 인사이트 검색",
    description:
      "OWID의 아티클, 데이터 인사이트, 주제 페이지를 검색한다. 데이터가 아닌 서술형 분석·해설을 찾을 때 쓴다.",
    inputSchema: {
      query: z.string().describe("검색어"),
      page_types: z
        .string()
        .optional()
        .describe("쉼표로 구분한 타입 필터 (article, data-insight, topic-page, about-page)"),
      limit: z.number().int().min(1).max(100).default(10).describe("결과 개수"),
      page: z.number().int().min(0).optional().describe("0부터 시작하는 페이지 번호"),
    },
  },
  guard(async (args) => {
    const res = await searchPages({
      query: args.query,
      pageTypes: args.page_types,
      hitsPerPage: args.limit,
      page: args.page,
    });
    return text({
      total_hits: res.nbHits,
      results: (res.results ?? []).map((r) => ({
        title: r.title,
        type: r.type,
        url: `https://ourworldindata.org/${r.slug}`,
        authors: r.authors,
        date: r.date,
        excerpt: (r.excerpt ?? r.content ?? "").slice(0, 500),
      })),
    });
  }),
);

server.registerTool(
  "owid_search_indicators",
  {
    title: "OWID 지표 시맨틱 검색",
    description:
      "자연어로 OWID 지표(indicator/변수)를 의미 기반 검색한다. 차트로 만들어지지 않은 세부 지표까지 찾을 수 있다. " +
      "반환된 indicator_id를 owid_get_indicator_data에 넣어 데이터를 받는다.",
    inputSchema: {
      query: z.string().describe("자연어 질의 (예: 'share of population with electricity access')"),
      limit: z.number().int().min(1).max(50).default(10).describe("결과 개수"),
      min_popularity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("인기도 하한(0~1). 널리 쓰이는 지표만 보려면 0.5 정도"),
    },
  },
  guard(async (args) => {
    const res = await searchIndicators({
      query: args.query,
      limit: args.limit,
      minPopularity: args.min_popularity,
    });
    return text({
      total_results: res.total_results,
      results: (res.results ?? []).map((r) => ({
        indicator_id: r.indicator_id,
        title: r.title,
        score: Number(r.score?.toFixed(3)),
        unit: r.metadata?.unit,
        chart_count: r.n_charts,
        catalog_path: r.catalog_path ?? r.metadata?.catalog_path,
        description: (r.description ?? r.snippet ?? "").slice(0, 300),
      })),
    });
  }),
);

/* -------------------------------------------------------------- 차트 데이터 */

server.registerTool(
  "owid_get_chart_data",
  {
    title: "OWID 차트 데이터(CSV)",
    description:
      "차트 slug의 실제 데이터를 CSV로 가져온다. countries/time으로 범위를 좁히는 것을 권장한다 " +
      "(전체 데이터는 수만 행이 될 수 있다). 각 행은 (엔티티, 연도, 값) 관측치다.",
    inputSchema: {
      slug: z
        .string()
        .describe("차트 slug (예: 'life-expectancy'). ourworldindata.org/grapher/<slug>의 마지막 부분"),
      countries: countriesSchema,
      time: z
        .string()
        .optional()
        .describe("기간. '2000..2020', '2020', 'latest', 'earliest..latest' 형식"),
      full: z
        .boolean()
        .default(false)
        .describe("true면 필터를 무시하고 차트의 전체 데이터셋을 받는다"),
      short_column_names: z
        .boolean()
        .default(true)
        .describe("컬럼명을 기계 친화적인 short name으로 (false면 사람이 읽는 긴 제목)"),
      max_rows: z.number().int().min(1).max(20000).default(500).describe("반환할 최대 행 수"),
    },
  },
  guard(async (args) => {
    const { url, csv } = await getChartCsv({
      slug: args.slug,
      countries: args.countries,
      time: args.time,
      csvType: args.full ? "full" : "filtered",
      useColumnShortNames: args.short_column_names,
    });
    return text(
      `# source: ${url}\n# 라이선스: CC BY 4.0 (Our World in Data)\n\n${truncateCsv(csv, args.max_rows)}`,
    );
  }),
);

server.registerTool(
  "owid_get_chart_metadata",
  {
    title: "OWID 차트 메타데이터",
    description:
      "차트의 제목, 인용 문구, 각 컬럼의 정의·단위·원자료 출처를 가져온다. 수치를 해석하거나 인용하기 전에 확인할 것.",
    inputSchema: {
      slug: z.string().describe("차트 slug"),
      countries: countriesSchema,
      time: z.string().optional().describe("기간 필터 (메타데이터의 originalChartUrl에 반영된다)"),
    },
  },
  guard(async (args) => {
    const { url, metadata } = await getChartMetadata({
      slug: args.slug,
      countries: args.countries,
      time: args.time,
    });
    return text({ source: url, ...metadata });
  }),
);

server.registerTool(
  "owid_get_chart_readme",
  {
    title: "OWID 차트 README",
    description:
      "차트 데이터 패키지의 README(마크다운). CSV 구조 설명, 출처, 권장 인용 문구가 들어 있다.",
    inputSchema: { slug: z.string().describe("차트 slug") },
  },
  guard(async (args) => {
    const { url, readme } = await getChartReadme(args.slug);
    return text(`# source: ${url}\n\n${readme}`);
  }),
);

/* ------------------------------------------------------------------- 지표 */

server.registerTool(
  "owid_get_indicator_data",
  {
    title: "OWID 지표 데이터",
    description:
      "indicator_id로 지표의 long-format 데이터(엔티티, 코드, 연도, 값)를 가져온다. " +
      "owid_search_indicators로 id를 먼저 찾는다.",
    inputSchema: {
      indicator_id: z.number().int().describe("지표 ID"),
      countries: countriesSchema,
      year_from: z.number().int().optional().describe("시작 연도(포함)"),
      year_to: z.number().int().optional().describe("종료 연도(포함)"),
      max_rows: z.number().int().min(1).max(20000).default(500).describe("반환할 최대 행 수"),
    },
  },
  guard(async (args) => {
    const { metadata, rows, totalRows } = await getIndicatorRows(args.indicator_id, {
      entities: args.countries,
      yearFrom: args.year_from,
      yearTo: args.year_to,
    });
    return text({
      indicator: {
        id: metadata.id,
        name: metadata.name,
        unit: metadata.unit,
        timespan: metadata.timespan,
        dataset: metadata.datasetName,
      },
      total_matching_rows: totalRows,
      returned_rows: Math.min(totalRows, args.max_rows),
      rows: rows.slice(0, args.max_rows),
      license: "CC BY 4.0 (Our World in Data)",
    });
  }),
);

server.registerTool(
  "owid_get_indicator_metadata",
  {
    title: "OWID 지표 메타데이터",
    description:
      "지표의 정의, 단위, 처리 방식, 원자료 출처(origins), 포함된 엔티티/연도 범위를 가져온다.",
    inputSchema: {
      indicator_id: z.number().int().describe("지표 ID"),
      include_dimensions: z
        .boolean()
        .default(false)
        .describe("true면 엔티티/연도 전체 목록까지 포함 (매우 길 수 있음)"),
    },
  },
  guard(async (args) => {
    const md = await getIndicatorMetadata(args.indicator_id);
    if (args.include_dimensions) return text(md);
    const { dimensions, ...rest } = md;
    return text({
      ...rest,
      dimension_summary: {
        entity_count: dimensions?.entities?.values?.length ?? 0,
        year_count: dimensions?.years?.values?.length ?? 0,
        sample_entities: (dimensions?.entities?.values ?? []).slice(0, 10).map((e) => e.name),
      },
    });
  }),
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // stdout은 MCP 프로토콜 전용이므로 로그는 반드시 stderr로.
  console.error("our-world-in-data MCP server running on stdio");
}

main().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});
