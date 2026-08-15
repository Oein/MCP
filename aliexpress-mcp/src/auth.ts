import fs from "node:fs/promises";
import type { BrowserContext } from "playwright";
import { BASE_URL, LOGIN_TIMEOUT, STATE_FILE } from "./config.js";
import {
  closeBrowser,
  getContext,
  getVisibleContext,
  persistState,
} from "./browser.js";
import type { AuthStatus } from "./types.js";

/** 로그인해야만 볼 수 있는 페이지. 미로그인이면 로그인 화면으로 리다이렉트된다. */
const GUARDED_URL = "https://www.aliexpress.com/p/order/index.html";
const LOGIN_URL = `https://login.aliexpress.com/?return_url=${encodeURIComponent(BASE_URL + "/")}`;

function isLoginPage(url: string): boolean {
  return /login\.aliexpress\.com|ug-login-page|\/login\.html/i.test(url);
}

/**
 * 보호된 페이지 접근이 리다이렉트되는지로 로그인 여부를 판정한다.
 * 쿠키 이름은 지역·실험군마다 달라서 신뢰할 수 없다.
 */
export async function checkLoggedIn(ctx: BrowserContext): Promise<{
  loggedIn: boolean;
  account?: string;
}> {
  const page = await ctx.newPage();
  try {
    await page.goto(GUARDED_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2500);
    if (isLoginPage(page.url())) return { loggedIn: false };

    const account = await page
      .evaluate(() => {
        const el = document.querySelector(
          '[class*="user-name"], [class*="account-name"], [class*="nickname"]',
        );
        const text = el?.textContent?.trim();
        return text && text.length < 60 ? text : undefined;
      })
      .catch(() => undefined);

    return { loggedIn: true, account: account ?? undefined };
  } catch {
    return { loggedIn: false };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function authStatus(): Promise<AuthStatus> {
  let hasSavedSession = false;
  let savedAt: string | undefined;
  let cookieCount: number | undefined;

  try {
    const stat = await fs.stat(STATE_FILE);
    hasSavedSession = true;
    savedAt = stat.mtime.toISOString();
    const raw = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    cookieCount = Array.isArray(raw?.cookies) ? raw.cookies.length : undefined;
  } catch {
    /* 저장된 세션 없음 */
  }

  const ctx = await getContext();
  const { loggedIn, account } = await checkLoggedIn(ctx);
  if (loggedIn) await persistState(ctx);

  return { loggedIn, account, hasSavedSession, savedAt, cookieCount };
}

export interface LoginResult {
  loggedIn: boolean;
  account?: string;
  /** 아직 로그인 대기 중이며 브라우저 창이 열려 있는 상태 */
  pending: boolean;
  message: string;
  savedTo?: string;
}

/**
 * 화면에 보이는 브라우저 창을 띄워 사용자가 직접 로그인하게 한다.
 * 로그인이 확인되면 세션을 프로필과 state.json 양쪽에 저장한다.
 *
 * @param waitMs 이 호출이 로그인 완료를 기다릴 최대 시간. 넘기면 창은 열어 둔 채
 *               백그라운드 감시로 넘어가고 툴은 pending 으로 반환한다.
 */
export async function login(waitMs = 120_000): Promise<LoginResult> {
  const ctx = await getVisibleContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  // 이미 로그인돼 있으면 창만 정리하고 끝낸다.
  const already = await checkLoggedIn(ctx);
  if (already.loggedIn) {
    await persistState(ctx);
    await closeBrowser();
    return {
      loggedIn: true,
      account: already.account,
      pending: false,
      message: "이미 로그인된 세션이 있습니다. 세션을 갱신했습니다.",
      savedTo: STATE_FILE,
    };
  }

  await page
    .goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 })
    .catch(() => {});
  await page.bringToFront().catch(() => {});

  const result = await waitForLogin(ctx, page, waitMs);
  if (result.loggedIn) {
    await persistState(ctx);
    await closeBrowser();
    return {
      ...result,
      pending: false,
      message:
        "로그인 완료. 세션을 저장했으며 이후 검색/상세 조회에 자동으로 사용됩니다.",
      savedTo: STATE_FILE,
    };
  }

  // 아직이면 창을 남겨 두고 백그라운드에서 계속 지켜본다.
  void backgroundWatch(ctx, page);
  return {
    loggedIn: false,
    pending: true,
    message:
      "브라우저 창을 열어 두었습니다. 창에서 로그인을 마친 뒤 `aliexpress_auth_status` 를 호출하면 세션이 저장됩니다.",
  };
}

/** 로그인 페이지를 벗어나는 순간을 신호로 삼아 실제 로그인 여부를 확인한다. */
async function waitForLogin(
  ctx: BrowserContext,
  page: import("playwright").Page,
  waitMs: number,
): Promise<{ loggedIn: boolean; account?: string }> {
  const deadline = Date.now() + waitMs;
  // 확인용 탭이 열렸다 닫히는 게 눈에 띄므로 확인 빈도를 제한한다.
  const MIN_CHECK_GAP = 8_000;
  let lastCheck = 0;

  while (Date.now() < deadline) {
    if (page.isClosed()) break;

    const url = page.url();
    const leftLoginPage = !isLoginPage(url) && !url.startsWith("about:");
    const gapPassed = Date.now() - lastCheck >= MIN_CHECK_GAP;

    // 로그인 화면을 벗어난 직후를 우선 확인하되, 그 신호를 놓쳤을 때를 대비해
    // 일정 간격으로도 확인한다.
    if (gapPassed && (leftLoginPage || Date.now() - lastCheck >= 20_000)) {
      lastCheck = Date.now();
      const check = await checkLoggedIn(ctx);
      if (check.loggedIn) return check;
    }

    await page.waitForTimeout(2000).catch(() => {});
  }
  return { loggedIn: false };
}

/** 툴 호출이 끝난 뒤에도 로그인 완료를 감지해 세션을 저장한다. */
async function backgroundWatch(
  ctx: BrowserContext,
  page: import("playwright").Page,
): Promise<void> {
  try {
    const result = await waitForLogin(ctx, page, LOGIN_TIMEOUT);
    if (result.loggedIn) {
      await persistState(ctx);
      await closeBrowser();
    }
  } catch {
    /* 사용자가 창을 닫았을 수 있다 */
  }
}
