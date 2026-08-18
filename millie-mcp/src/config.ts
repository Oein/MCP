import { homedir } from "node:os";
import { join } from "node:path";

/** 검색·자동완성 API. 인증이 필요 없다. */
export const LIVE_API_BASE = (
  process.env.MILLIE_LIVE_API_BASE ?? "https://live-api.millie.co.kr"
).replace(/\/$/, "");

/** 콘텐츠 상세·서재 API. Bearer 토큰이 필요하다. */
export const API_BASE = (
  process.env.MILLIE_API_BASE ?? "https://apis.millie.co.kr"
).replace(/\/$/, "");

/** 사용자에게 보여줄 웹 페이지 베이스 (도서 링크 생성용). */
export const WEB_BASE = (
  process.env.MILLIE_WEB_BASE ?? "https://www.millie.co.kr"
).replace(/\/$/, "");

export const REQUEST_TIMEOUT = Number(process.env.MILLIE_TIMEOUT ?? 15_000);

/**
 * 밀리 앱(Flutter)이 보내는 User-Agent. 웹 브라우저 UA 로 바꾸면 일부 응답이
 * 비어서 돌아오므로 그대로 둔다.
 */
export const USER_AGENT = process.env.MILLIE_USER_AGENT ?? "Dart/3.9 (dart:io)";

/** 성인 콘텐츠 노출 여부. 헤더로 전달되며 검색 결과에서 걸러진다. */
export const SHOW_ADULT = process.env.MILLIE_SHOW_ADULT === "1" ? "Y" : "N";

/** 인증이 필요한 도구용 자격증명. 둘 다 없으면 검색 계열만 동작한다. */
export const ACCESS_TOKEN = process.env.MILLIE_ACCESS_TOKEN ?? "";
export const SESSION_ID = process.env.MILLIE_SESSION_ID ?? "";

/**
 * 토큰을 담은 JSON 파일 경로. `access_token`/`session_id` 키를 읽는다.
 * millie 툴킷의 `auth.json` 형식과 같다.
 */
export const AUTH_FILE =
  process.env.MILLIE_AUTH_FILE ?? join(homedir(), ".millie", "auth.json");
