/** 번개장터 내부 API 베이스. */
export const API_BASE = (
  process.env.BUNJANG_API_BASE ?? "https://api.bunjang.co.kr"
).replace(/\/$/, "");

/** 사용자에게 보여줄 웹 페이지 베이스 (상품/상점 링크 생성용). */
export const WEB_BASE = (
  process.env.BUNJANG_WEB_BASE ?? "https://m.bunjang.co.kr"
).replace(/\/$/, "");

/** API 요청 타임아웃 (ms) */
export const REQUEST_TIMEOUT = Number(process.env.BUNJANG_TIMEOUT ?? 15_000);

export const USER_AGENT =
  process.env.BUNJANG_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** 카테고리 트리를 메모리에 캐시해 두는 시간 (ms). 기본 6시간. */
export const CATEGORY_TTL = Number(process.env.BUNJANG_CATEGORY_TTL ?? 6 * 60 * 60 * 1000);
