import { readFileSync } from "node:fs";
import { ACCESS_TOKEN, AUTH_FILE, SESSION_ID } from "./config.js";

export interface Credentials {
  bearer: string;
  sessionId?: string;
  /** 만료 시각 (unix seconds). 파일에 있을 때만 채워진다. */
  expiresAt?: number;
  source: "env" | "file";
}

export class MillieAuthError extends Error {
  constructor(message: string) {
    super(
      `${message}\n` +
        "검색·자동완성은 인증 없이 되지만 상세 조회는 토큰이 필요하다. " +
        "MILLIE_ACCESS_TOKEN(+MILLIE_SESSION_ID) 을 넘기거나, " +
        `access_token/session_id 를 담은 JSON 을 MILLIE_AUTH_FILE(현재: ${AUTH_FILE}) 에 두면 된다.`,
    );
    this.name = "MillieAuthError";
  }
}

function normalizeBearer(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

/**
 * 자격증명을 찾는다. 환경변수가 파일보다 우선한다.
 *
 * 토큰 갱신은 하지 않는다 — refresh 흐름은 PKCE 로그인까지 필요해서
 * 이 서버의 범위를 벗어난다. 만료되면 발급해 준 쪽에서 다시 넣어야 한다.
 */
export function loadCredentials(): Credentials {
  if (ACCESS_TOKEN) {
    return {
      bearer: normalizeBearer(ACCESS_TOKEN),
      sessionId: SESSION_ID || undefined,
      source: "env",
    };
  }

  let raw: string;
  try {
    raw = readFileSync(AUTH_FILE, "utf-8");
  } catch {
    throw new MillieAuthError("자격증명을 찾지 못했다.");
  }

  let data: { access_token?: string; session_id?: string; access_token_expires_at?: number };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new MillieAuthError(`${AUTH_FILE} 이 올바른 JSON 이 아니다.`);
  }
  if (!data.access_token) {
    throw new MillieAuthError(`${AUTH_FILE} 에 access_token 이 없다.`);
  }

  return {
    bearer: normalizeBearer(data.access_token),
    sessionId: data.session_id || SESSION_ID || undefined,
    expiresAt: data.access_token_expires_at,
    source: "file",
  };
}

/** 인증이 필요한 요청에 붙일 헤더. */
export function authHeaders(cred: Credentials): Record<string, string> {
  const headers: Record<string, string> = { Authorization: cred.bearer };
  if (cred.sessionId) headers["session-id"] = cred.sessionId;
  return headers;
}

/**
 * 만료 여부. 참고용이다 — 밀리는 `access_token_expires_at` 이 지난 토큰도
 * 한동안 받아주므로, 이 값으로 요청을 미리 끊지 않는다. 인증 실패했을 때
 * 원인을 짚어 주는 데만 쓴다.
 */
export function isExpired(cred: Credentials): boolean {
  if (cred.expiresAt === undefined) return false;
  return cred.expiresAt <= Math.floor(Date.now() / 1000);
}

/** 인증 계열 에러에 만료 힌트를 덧붙인다. */
export function explainAuthFailure(cred: Credentials, err: unknown): Error {
  const base = err instanceof Error ? err.message : String(err);
  if (!isExpired(cred)) return err instanceof Error ? err : new Error(base);
  const at = new Date((cred.expiresAt ?? 0) * 1000).toISOString();
  return new MillieAuthError(`${base} (토큰 만료 시각이 이미 지났다: ${at})`);
}

/** 도구로 노출할 진단 정보. 토큰 자체는 절대 돌려주지 않는다. */
export function authStatus(): Record<string, unknown> {
  try {
    const cred = loadCredentials();
    const expired = cred.expiresAt !== undefined ? isExpired(cred) : null;
    return {
      // 만료 시각이 지나도 실제로는 통하는 경우가 있어 토큰 존재 여부로 판단한다.
      authenticated: true,
      source: cred.source === "env" ? "환경변수 MILLIE_ACCESS_TOKEN" : AUTH_FILE,
      hasSessionId: Boolean(cred.sessionId),
      expiresAt:
        cred.expiresAt !== undefined ? new Date(cred.expiresAt * 1000).toISOString() : null,
      expired,
      note:
        "검색·자동완성은 인증 없이 동작한다. millie_book_detail 만 토큰을 쓴다. " +
        "expired 가 true 여도 밀리가 한동안은 받아주므로 일단 시도해 볼 값어치가 있다.",
    };
  } catch (e) {
    return {
      authenticated: false,
      reason: (e as Error).message,
    };
  }
}
