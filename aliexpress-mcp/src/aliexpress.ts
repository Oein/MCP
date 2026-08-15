import type { Page } from "playwright";
import { BASE_URL, NAV_TIMEOUT } from "./config.js";
import { BLOCKED_MESSAGE, isBlocked, withPage } from "./browser.js";
import {
  extractSearchItems,
  normalizeDetail,
  normalizeReviews,
  normalizeSearchItem,
  unwrapMtop,
} from "./parse.js";
import type { ProductDetail, ReviewItem, SearchResult } from "./types.js";

/** MCP 에 노출하는 정렬 키 → AliExpress SortType 파라미터 */
export const SORT_MAP: Record<string, string> = {
  best_match: "default",
  orders: "total_tranpro_desc",
  newest: "create_desc",
  price_asc: "price_asc",
  price_desc: "price_desc",
};

export interface SearchOptions {
  keyword: string;
  page?: number;
  sort?: keyof typeof SORT_MAP;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}

function buildSearchUrl(o: SearchOptions): string {
  const slug = encodeURIComponent(o.keyword.trim().replace(/\s+/g, "-"));
  const params = new URLSearchParams({
    page: String(o.page ?? 1),
    SortType: SORT_MAP[o.sort ?? "best_match"] ?? "default",
  });
  if (o.minPrice != null) params.set("minPrice", String(o.minPrice));
  if (o.maxPrice != null) params.set("maxPrice", String(o.maxPrice));
  return `${BASE_URL}/w/wholesale-${slug}.html?${params}`;
}

/** 지연 로딩되는 카드까지 채우기 위해 페이지를 훑어 내린다. */
async function autoScroll(page: Page, rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(700);
  }
}

export async function search(o: SearchOptions): Promise<SearchResult> {
  const url = buildSearchUrl(o);
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    if (isBlocked(page.url())) throw new Error(BLOCKED_MESSAGE);

    // 검색 결과는 SSR 로 주입되지만, 스크립트가 실행돼야 전역에 붙는다.
    await page
      .waitForFunction(
        () => !!(window as any)._dida_config_?._init_data_,
        undefined,
        { timeout: 20_000 },
      )
      .catch(() => {});
    await autoScroll(page);

    const init = await page.evaluate(() => {
      try {
        return JSON.parse(
          JSON.stringify((window as any)._dida_config_?._init_data_ ?? null),
        );
      } catch {
        return null;
      }
    });

    if (!init) {
      if (isBlocked(page.url())) throw new Error(BLOCKED_MESSAGE);
      throw new Error(
        "검색 결과 데이터를 찾지 못했습니다. AliExpress 페이지 구조가 바뀌었거나 차단되었을 수 있습니다.",
      );
    }

    const items = extractSearchItems(init)
      .map(normalizeSearchItem)
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, o.limit ?? 20);

    return {
      keyword: o.keyword,
      page: o.page ?? 1,
      sort: o.sort ?? "best_match",
      count: items.length,
      items,
    };
  });
}

/** URL 또는 숫자 ID 에서 상품 ID 를 뽑아낸다. */
export function resolveProductId(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m =
    trimmed.match(/\/item\/(?:[^/]*?_)?(\d{6,})\.html/) ??
    trimmed.match(/productIds?=(\d{6,})/) ??
    trimmed.match(/(\d{10,})/);
  if (!m) throw new Error(`상품 ID 를 찾을 수 없습니다: ${input}`);
  return m[1];
}

const PDP_API = "mtop.aliexpress.pdp.pc.query";
const REVIEW_API = "mtop.aliexpress.review.pc.list";

/**
 * 상세 데이터는 페이지가 서명된 mtop 요청으로 가져온다. 서명을 직접 만들기보다
 * 페이지를 열고 그 응답을 가로채는 편이 훨씬 안정적이다.
 */
export async function getProductDetail(
  input: string,
  opts: { withReviews?: boolean; reviewLimit?: number } = {},
): Promise<ProductDetail & { reviews?: ReviewItem[] }> {
  const productId = resolveProductId(input);
  const url = `${BASE_URL}/item/${productId}.html`;

  return withPage(async (page) => {
    let pdpBody: string | null = null;
    let reviewBody: string | null = null;

    page.on("response", async (res) => {
      const u = res.url();
      try {
        if (!pdpBody && u.includes(PDP_API)) pdpBody = await res.text();
        else if (!reviewBody && u.includes(REVIEW_API)) reviewBody = await res.text();
      } catch {
        /* 페이지가 먼저 닫히면 본문을 못 읽을 수 있다 */
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    if (isBlocked(page.url())) throw new Error(BLOCKED_MESSAGE);

    await page
      .waitForResponse((r) => r.url().includes(PDP_API), { timeout: 25_000 })
      .catch(() => {});
    // 리스너가 본문을 다 읽을 시간을 잠깐 준다.
    for (let i = 0; i < 20 && !pdpBody; i++) await page.waitForTimeout(500);

    if (!pdpBody) {
      throw new Error(
        `상품 상세 데이터를 받지 못했습니다 (productId=${productId}). 상품이 내려갔거나 지역 제한일 수 있습니다.`,
      );
    }

    const signedIn = await page
      .evaluate(
        () => (window as any)._d_c_?.DCData?.extParams?.signedIn === "true",
      )
      .catch(() => undefined);

    const payload = unwrapMtop(pdpBody);
    const result = payload?.data?.result;
    if (!result) {
      const ret = payload?.ret?.[0] ?? "알 수 없는 응답";
      throw new Error(`상세 API 가 데이터를 반환하지 않았습니다: ${ret}`);
    }

    // 국가 제한·판매 중지 상품은 GLOBAL_DATA 만 담긴 껍데기 응답이 온다.
    const globalData = result.GLOBAL_DATA?.globalData ?? {};
    if (globalData.errorCode || globalData.bigBossBan) {
      throw new Error(
        `상품을 조회할 수 없습니다 (productId=${productId}): ${
          globalData.bigBossBanTip ?? globalData.errorCode
        }`,
      );
    }

    const detail = normalizeDetail(result, productId, signedIn);

    if (opts.withReviews) {
      if (!reviewBody) {
        // 리뷰 영역은 스크롤해야 요청이 나가는 경우가 있다.
        await autoScroll(page, 6);
        await page
          .waitForResponse((r) => r.url().includes(REVIEW_API), { timeout: 15_000 })
          .catch(() => {});
        for (let i = 0; i < 10 && !reviewBody; i++) await page.waitForTimeout(500);
      }
      if (reviewBody) {
        try {
          const reviews = normalizeReviews(unwrapMtop(reviewBody)).slice(
            0,
            opts.reviewLimit ?? 10,
          );
          return { ...detail, reviews };
        } catch {
          /* 리뷰 파싱 실패는 상세 조회 전체를 실패시키지 않는다 */
        }
      }
      return { ...detail, reviews: [] };
    }

    return detail;
  });
}
