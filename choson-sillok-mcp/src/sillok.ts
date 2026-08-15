/**
 * 국사편찬위원회 조선왕조실록(sillok.history.go.kr) 접근 계층.
 *
 * 공개 API가 없으므로 웹 페이지를 요청해 HTML을 파싱한다.
 * 사이트 마크업이 바뀌면 이 파일의 선택자만 손보면 된다.
 */
import * as cheerio from "cheerio";

const BASE = "https://sillok.history.go.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/** 왕대 코드 → 실록 이름. /search/inspectionList.do 트리에서 추출한 고정 목록. */
export const KINGS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "kaa", name: "태조실록" },
  { code: "kba", name: "정종실록" },
  { code: "kca", name: "태종실록" },
  { code: "kda", name: "세종실록" },
  { code: "kea", name: "문종실록" },
  { code: "kfa", name: "단종실록" },
  { code: "kga", name: "세조실록" },
  { code: "kha", name: "예종실록" },
  { code: "kia", name: "성종실록" },
  { code: "kja", name: "연산군일기" },
  { code: "kka", name: "중종실록" },
  { code: "kla", name: "인종실록" },
  { code: "kma", name: "명종실록" },
  { code: "kna", name: "선조실록" },
  { code: "knb", name: "선조수정실록" },
  { code: "koa", name: "광해군일기(중초본)" },
  { code: "kob", name: "광해군일기(정초본)" },
  { code: "kpa", name: "인조실록" },
  { code: "kqa", name: "효종실록" },
  { code: "kra", name: "현종실록" },
  { code: "krb", name: "현종개수실록" },
  { code: "ksa", name: "숙종실록" },
  { code: "ksb", name: "숙종실록보궐정오" },
  { code: "kta", name: "경종실록" },
  { code: "ktb", name: "경종수정실록" },
  { code: "kua", name: "영조실록" },
  { code: "kva", name: "정조실록" },
  { code: "kwa", name: "순조실록" },
  { code: "kxa", name: "헌종실록" },
  { code: "kya", name: "철종실록" },
  { code: "kza", name: "고종실록" },
  { code: "kzb", name: "순종실록" },
  { code: "kzc", name: "순종실록부록" },
];

export class SillokError extends Error {}

async function request(
  path: string,
  init?: { method?: "GET" | "POST"; body?: URLSearchParams; cookie?: string },
): Promise<string> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9",
      ...(init?.cookie ? { Cookie: init.cookie } : {}),
      ...(init?.body
        ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }
        : {}),
    },
    body: init?.body,
  });
  if (!res.ok) {
    throw new SillokError(`실록 사이트 요청 실패: ${res.status} ${url}`);
  }
  return res.text();
}

/** 연속 공백을 한 칸으로 줄이고 앞뒤를 정리한다. */
function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "2,059" 같은 자릿수 구분 기호가 섞인 수를 숫자로. */
function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/* ------------------------------------------------------------------ 검색 */

export interface SearchHit {
  id: string;
  /** "세종실록 102권, 세종 25년 12월 30일 경술 2번째기사" 부분 */
  citation: string;
  title: string;
  /** 검색어 주변 발췌문 */
  snippet: string;
  url: string;
}

export interface SearchResult {
  query: string;
  /** 국역/원문 각각의 전체 적중 건수 */
  totalTranslation: number | null;
  totalOriginal: number | null;
  page: number;
  perPage: number;
  /** 왕대별 적중 건수 */
  byKing: Array<{ name: string; count: number }>;
  hits: SearchHit[];
}

export interface SearchOptions {
  query: string;
  /** k=국역, w=원문(한문) */
  target?: "translation" | "original";
  /** "세종실록"처럼 실록 이름으로 좁히기 */
  king?: string;
  page?: number;
  /** 사이트가 허용하는 값은 10·50·100 뿐이다. */
  perPage?: 10 | 50 | 100;
  sort?: "period" | "accuracy";
}

const SEARCH_PATH = "/search/searchResultList.do";

/**
 * 검색은 두 번의 요청으로 이뤄진다.
 *
 * 검색 폼은 왕대 필터·페이지 이동 시 직전 결과의 hidden 필드(전체 건수, 국역/원문
 * 건수 등)를 그대로 되돌려 보낸다. 이 값들이 빠지면 서버가 0건을 돌려주므로,
 * 1차 요청으로 폼 상태를 받아 온 뒤 필요한 값만 바꿔 2차 요청을 보낸다.
 * 페이지당 건수는 폼 필드가 아니라 쿠키로 전달된다.
 */
export async function search(opts: SearchOptions): Promise<SearchResult> {
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 10;
  const cookie = `sillok_op_search_pageUnit=${perPage}`;
  const type = opts.target === "original" ? "w" : "k";

  const firstHtml = await request(SEARCH_PATH, {
    method: "POST",
    cookie,
    body: new URLSearchParams({
      topSearchWord: opts.query,
      type,
      sillokType: "S",
      pageIndex: "1",
      initPageUnit: "0",
      synType: "none",
    }),
  });

  let html = firstHtml;
  const needsSecondPass = page > 1 || !!opts.king || opts.sort === "accuracy";
  if (needsSecondPass) {
    const $first = cheerio.load(firstHtml);
    const form = new URLSearchParams();
    $first("#searchForm input").each((_, el) => {
      const name = $first(el).attr("name");
      if (name) form.set(name, $first(el).attr("value") ?? "");
    });
    form.set("type", type);
    form.set("pageIndex", String(page));
    form.set("pageUnit", String(perPage));
    form.set("sort", opts.sort === "accuracy" ? "correct" : "period");
    if (opts.king) {
      form.set("kingHg", opts.king);
      form.set("silloknameHg", opts.king);
      form.set("searchType", "category");
    }
    html = await request(SEARCH_PATH, { method: "POST", cookie, body: form });
  }

  const $ = cheerio.load(html);

  const hits: SearchHit[] = [];
  $(".result-list .result-box").each((_, el) => {
    const $a = $(el).find("a.subject").first();
    const id = /goView\('([^']+)'/.exec($a.attr("href") ?? "")?.[1];
    if (!id) return;
    // 제목은 "3. 세종실록 114권, ... 3번째기사 / 실제 제목" 형태
    const label = tidy($a.text()).replace(/^\d+\.\s*/, "");
    const slash = label.indexOf(" / ");
    hits.push({
      id,
      citation: slash >= 0 ? label.slice(0, slash) : label,
      title: slash >= 0 ? label.slice(slash + 3) : "",
      snippet: tidy($(el).find("p.text").first().text()),
      url: `${BASE}/id/${id}`,
    });
  });

  // "국역(11)" / "원문(10)" 탭에서 전체 건수를 읽는다.
  let totalTranslation: number | null = null;
  let totalOriginal: number | null = null;
  $(".result-cate01 a").each((_, el) => {
    const t = tidy($(el).text());
    const n = /\(([\d,]+)\)/.exec(t);
    if (!n) return;
    if (t.startsWith("국역")) totalTranslation = toNumber(n[1]);
    else if (t.startsWith("원문")) totalOriginal = toNumber(n[1]);
  });

  const byKing: Array<{ name: string; count: number }> = [];
  $(".result-cate02 a.cate-item").each((_, el) => {
    const t = tidy($(el).text());
    const m = /^(.+?)\s*\(([\d,]+)\)$/.exec(t);
    if (m && m[1] !== "전체") byKing.push({ name: m[1], count: toNumber(m[2]) });
  });

  return {
    query: opts.query,
    totalTranslation,
    totalOriginal,
    page,
    perPage,
    byKing,
    hits,
  };
}

/* ------------------------------------------------------------------ 기사 */

export interface Article {
  id: string;
  /** "태조실록1권, 태조 1년 7월 17일 병신 1/2 기사 / 1392년 명 홍무(洪武) 25년" */
  citation: string;
  title: string;
  /** 국역문 (문단 배열) */
  translation: string[];
  /** 한문 원문 (문단 배열) */
  original: string[];
  /** 각주 */
  footnotes: string[];
  /** 【분류】 왕실-의식(儀式) 처럼 기사에 붙은 분류·색인 정보 */
  classifications: string[];
  url: string;
}

export async function getArticle(id: string): Promise<Article> {
  if (!/^[a-z]{3}_[0-9a-z_]+$/.test(id)) {
    throw new SillokError(`기사 ID 형식이 올바르지 않습니다: ${id}`);
  }
  const html = await request(`/id/${encodeURIComponent(id)}`);
  const $ = cheerio.load(html);
  const $view = $(".detail-view").first();
  if ($view.length === 0) {
    throw new SillokError(`기사를 찾을 수 없습니다: ${id}`);
  }

  const paragraphs = (sel: string): string[] => {
    const $box = $view.find(sel).find(".view-text").first();
    const out: string[] = [];
    $box.find("p").each((_, p) => {
      // 각주 위첨자(001) 등은 본문에서 걷어낸다.
      const $p = $(p).clone();
      $p.find("sup").remove();
      const t = tidy($p.text());
      if (t) out.push(t);
    });
    if (out.length === 0) {
      const t = tidy($box.text());
      if (t) out.push(t);
    }
    return out;
  };

  const footnotes: string[] = [];
  $view.find("ul.ins_footnote li").each((_, el) => {
    const t = tidy($(el).text());
    if (t) footnotes.push(t);
  });

  const classifications: string[] = [];
  $view.find("li.view_font02").each((_, el) => {
    const t = tidy($(el).text());
    if (t && !classifications.includes(t)) classifications.push(t);
  });

  return {
    id,
    citation: tidy($view.find(".title-head .date").first().text()),
    title: tidy($view.find(".title-head h3").first().text()),
    translation: paragraphs(".view-item.left"),
    original: paragraphs(".view-item.right"),
    footnotes,
    classifications,
    url: `${BASE}/id/${id}`,
  };
}

/* ------------------------------------------------------- 연·월 / 일자 목록 */

export interface YearEntry {
  /** "태조 1년(太祖 元年)" */
  year: string;
  /** "1392년 (임신)" */
  westernYear: string;
  months: Array<{ id: string; label: string }>;
}

/** 한 왕대의 연도별 월 목록. 각 월 id는 일자 목록 조회에 쓴다. */
export async function listMonths(kingCode: string): Promise<YearEntry[]> {
  if (!/^[a-z]{3}$/.test(kingCode)) {
    throw new SillokError(`왕대 코드 형식이 올바르지 않습니다: ${kingCode}`);
  }
  const html = await request(
    `/search/inspectionMonthList.do?id=${encodeURIComponent(kingCode)}`,
  );
  const $ = cheerio.load(html);
  const years: YearEntry[] = [];
  $(".month-wrap .month-box").each((_, box) => {
    const $box = $(box);
    const year = tidy($box.find(".month-title h4").first().text());
    if (!year) return;
    const months: Array<{ id: string; label: string }> = [];
    $box.find(".month-list a").each((_, a) => {
      const id = /search\('([^']+)'/.exec($(a).attr("href") ?? "")?.[1];
      if (id) months.push({ id, label: tidy($(a).text()) });
    });
    years.push({
      year,
      westernYear: tidy($box.find(".month-title span").first().text()),
      months,
    });
  });
  return years;
}

export interface DayList {
  /** "태조실록1권, 태조 1년 7월 17일 병신" */
  heading: string;
  /** 해당 월에 기사가 있는 날짜들 */
  days: Array<{ id: string; label: string }>;
  articles: Array<{ id: string; title: string; url: string }>;
}

/**
 * 특정 월(kaa_101070) 또는 특정 일자(kaa_10107017)의 기사 목록.
 * 월 id를 주면 그 달의 기사 전체가, 일자 id를 주면 그날의 기사만 나온다.
 */
export async function listDay(id: string): Promise<DayList> {
  if (!/^[a-z]{3}_[0-9a-z]+$/.test(id)) {
    throw new SillokError(`ID 형식이 올바르지 않습니다: ${id}`);
  }
  const html = await request(
    `/search/inspectionDayList.do?id=${encodeURIComponent(id)}`,
  );
  const $ = cheerio.load(html);

  const days: Array<{ id: string; label: string }> = [];
  $("button[onclick^='searchDay(']").each((_, el) => {
    const dayId = /searchDay\('([^']+)'/.exec($(el).attr("onclick") ?? "")?.[1];
    if (dayId) days.push({ id: dayId, label: tidy($(el).text()) });
  });

  const articles: Array<{ id: string; title: string; url: string }> = [];
  $(".day-cont .current-cont .list a").each((_, el) => {
    const aid = /searchView\('([^']+)'/.exec($(el).attr("href") ?? "")?.[1];
    if (aid) {
      articles.push({ id: aid, title: tidy($(el).text()), url: `${BASE}/id/${aid}` });
    }
  });

  return {
    heading: tidy($(".day-cont .current-cont .title").first().text()),
    days,
    articles,
  };
}
