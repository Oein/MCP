import { API_BASE, REQUEST_TIMEOUT, USER_AGENT } from "./config.js";

/** 번개장터 API 가 에러 바디를 200/4xx 양쪽으로 돌려주므로 한 곳에서 처리한다. */
export class BunjangApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "BunjangApiError";
  }
}

type Params = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, params: Params): string {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function apiGet<T>(path: string, params: Params = {}): Promise<T> {
  const url = buildUrl(path, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9",
        Referer: "https://m.bunjang.co.kr/",
        Origin: "https://m.bunjang.co.kr",
      },
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new BunjangApiError(`요청 시간 초과 (${REQUEST_TIMEOUT}ms)`, 0, path);
    }
    throw new BunjangApiError(`네트워크 오류: ${(e as Error).message}`, 0, path);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BunjangApiError(
      `JSON 이 아닌 응답 (HTTP ${res.status}): ${text.slice(0, 200)}`,
      res.status,
      path,
    );
  }

  const err = body as { errorCode?: string; reason?: string; error?: string; status?: number };
  if (!res.ok || err.errorCode) {
    const message = err.reason ?? err.error ?? `HTTP ${res.status}`;
    throw new BunjangApiError(message, err.status ?? res.status, path);
  }
  return body as T;
}
