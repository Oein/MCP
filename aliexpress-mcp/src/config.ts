import os from "node:os";
import path from "node:path";

/** 세션/설정 파일이 저장되는 디렉터리. ALIEXPRESS_MCP_HOME 으로 덮어쓸 수 있다. */
export const DATA_DIR =
  process.env.ALIEXPRESS_MCP_HOME ??
  path.join(os.homedir(), ".claude", "mcp", "aliexpress");

/** Playwright storageState (쿠키 + localStorage) 저장 위치 */
export const STATE_FILE = path.join(DATA_DIR, "state.json");

/** 로그인 시 사용하는 persistent 브라우저 프로필 (봇 감지 회피에 유리) */
export const PROFILE_DIR = path.join(DATA_DIR, "profile");

/**
 * 사용할 AliExpress 도메인. 지역에 따라 ko.aliexpress.com / www.aliexpress.com 등.
 * 상품 가격/통화가 이 도메인 설정을 따라간다.
 */
export const BASE_URL = (
  process.env.ALIEXPRESS_BASE_URL ?? "https://ko.aliexpress.com"
).replace(/\/$/, "");

/** 검색/상세 페이지 로딩 타임아웃 (ms) */
export const NAV_TIMEOUT = Number(process.env.ALIEXPRESS_NAV_TIMEOUT ?? 45_000);

/** 로그인 툴이 사용자를 기다리는 최대 시간 (ms) */
export const LOGIN_TIMEOUT = Number(
  process.env.ALIEXPRESS_LOGIN_TIMEOUT ?? 300_000,
);

/** 유휴 브라우저를 자동 종료하기까지의 시간 (ms) */
export const IDLE_SHUTDOWN_MS = Number(
  process.env.ALIEXPRESS_IDLE_SHUTDOWN ?? 180_000,
);

export const USER_AGENT =
  process.env.ALIEXPRESS_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const LOCALE = process.env.ALIEXPRESS_LOCALE ?? "ko-KR";
export const TIMEZONE = process.env.ALIEXPRESS_TIMEZONE ?? "Asia/Seoul";
