import { REQUEST_TIMEOUT, SHOW_ADULT, USER_AGENT } from "./config.js";
import type { MillieEnvelope } from "./types.js";

export class MillieApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "MillieApiError";
  }
}

type Params = Record<string, string | number | boolean | undefined>;

function buildUrl(base: string, path: string, params: Params): string {
  const url = new URL(path, `${base}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** 밀리 앱이 붙이는 최소 헤더. `x-millie-api-version` 이 없으면 구버전 응답이 온다. */
function baseHeaders(): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    "x-millie-api-version": "v2",
    "show-adult-content": SHOW_ADULT,
    accept: "application/json",
  };
}

async function request(
  base: string,
  path: string,
  params: Params,
  extraHeaders: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const url = buildUrl(base, path, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...baseHeaders(), ...extraHeaders },
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new MillieApiError(`요청 시간 초과 (${REQUEST_TIMEOUT}ms)`, 0, path);
    }
    throw new MillieApiError(`네트워크 오류: ${(e as Error).message}`, 0, path);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MillieApiError(
      `JSON 이 아닌 응답 (HTTP ${res.status}): ${text.slice(0, 200)}`,
      res.status,
      path,
    );
  }
  return { status: res.status, body };
}

/** 에러 바디는 HTTP 상태와 무관하게 `errors` 키로 오기도 한다. */
function throwIfError(body: unknown, status: number, path: string): void {
  const err = body as { errors?: { code?: number; message?: string } };
  if (err?.errors) {
    const { code, message } = err.errors;
    throw new MillieApiError(message ?? `에러 코드 ${code}`, status, path);
  }
  if (status >= 400) {
    throw new MillieApiError(`HTTP ${status}`, status, path);
  }
}

/** `RESP_CD`/`RESP_DATA` 봉투를 벗겨서 돌려준다 (검색·자동완성). */
export async function apiGetEnveloped<T>(
  base: string,
  path: string,
  params: Params = {},
  headers: Record<string, string> = {},
): Promise<T> {
  const { status, body } = await request(base, path, params, headers);
  throwIfError(body, status, path);

  const env = body as MillieEnvelope<T>;
  if (env.RESP_CD !== undefined && env.RESP_CD !== 200) {
    throw new MillieApiError(env.RESP_MSG ?? `RESP_CD ${env.RESP_CD}`, status, path);
  }
  if (env.RESP_DATA === undefined) {
    throw new MillieApiError("응답에 RESP_DATA 가 없다", status, path);
  }
  return env.RESP_DATA;
}

/** 봉투 없이 평평한 JSON 을 돌려주는 엔드포인트용 (콘텐츠 상세). */
export async function apiGetFlat<T>(
  base: string,
  path: string,
  params: Params = {},
  headers: Record<string, string> = {},
): Promise<T> {
  const { status, body } = await request(base, path, params, headers);
  throwIfError(body, status, path);
  return body as T;
}
