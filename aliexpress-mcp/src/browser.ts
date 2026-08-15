import fs from "node:fs/promises";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { BrowserContext, Page } from "playwright";
import {
  DATA_DIR,
  IDLE_SHUTDOWN_MS,
  LOCALE,
  NAV_TIMEOUT,
  PROFILE_DIR,
  STATE_FILE,
  TIMEZONE,
  USER_AGENT,
} from "./config.js";

// stealth 플러그인이 navigator.webdriver, plugins, WebGL 벤더 등 헤드리스 지문을
// 덮어써 준다. 이게 없으면 AliExpress 가 곧바로 캡차(punish) 페이지로 보낸다.
chromium.use(StealthPlugin());

/**
 * AliExpress 는 로그인·캡차 통과 여부를 모두 쿠키로 판단하므로 조회와 로그인이
 * 같은 브라우저 프로필을 공유해야 한다. persistent context 는 프로필 디렉터리를
 * 배타적으로 잠그기 때문에 이 모듈이 단일 인스턴스를 소유하고 재사용한다.
 */
let context: BrowserContext | null = null;
let opening: Promise<BrowserContext> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function launch(headless: boolean): Promise<BrowserContext> {
  await ensureDataDir();
  const ctx = (await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    userAgent: USER_AGENT,
    locale: LOCALE,
    timezoneId: TIMEZONE,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  })) as BrowserContext;
  ctx.setDefaultNavigationTimeout(NAV_TIMEOUT);
  ctx.setDefaultTimeout(NAV_TIMEOUT);
  return ctx;
}

/**
 * 브라우저 컨텍스트를 반환한다. 이미 떠 있으면 재사용한다.
 * @param headless 새로 띄울 때의 표시 여부. 이미 열려 있으면 무시된다.
 */
export async function getContext(headless = true): Promise<BrowserContext> {
  if (context) {
    touchIdle();
    return context;
  }
  if (opening) return opening;

  opening = launch(headless)
    .then((ctx) => {
      context = ctx;
      ctx.on("close", () => {
        if (context === ctx) context = null;
      });
      touchIdle();
      return ctx;
    })
    .finally(() => {
      opening = null;
    });

  return opening;
}

/** 헤드리스로 떠 있던 창을 닫고, 사용자에게 보이는 창으로 다시 연다. */
export async function getVisibleContext(): Promise<BrowserContext> {
  await closeBrowser();
  return getContext(false);
}

/** 페이지를 하나 열어 콜백을 실행하고 반드시 닫는다. */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  // 이미지/폰트/미디어는 파싱에 불필요하므로 차단해 로딩을 앞당긴다.
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      return route.abort();
    }
    return route.continue();
  });
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * 프로필의 쿠키/스토리지를 state.json 으로 내보낸다.
 * 프로필 디렉터리가 primary 저장소이고 이 파일은 백업 겸 외부 도구용이다.
 */
export async function persistState(ctx: BrowserContext): Promise<void> {
  await ensureDataDir();
  await ctx.storageState({ path: STATE_FILE });
}

/** 저장된 로그인 흔적을 모두 지운다. */
export async function clearState(): Promise<void> {
  await closeBrowser();
  await fs.rm(STATE_FILE, { force: true });
  await fs.rm(PROFILE_DIR, { recursive: true, force: true });
}

export async function closeBrowser(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const ctx = context;
  context = null;
  await ctx?.close().catch(() => {});
}

function touchIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void closeBrowser();
  }, IDLE_SHUTDOWN_MS);
  idleTimer.unref?.();
}

/** 캡차(punish) 페이지로 튕겼는지 판별한다. */
export function isBlocked(url: string): boolean {
  return /_____tmd_____|punish|x5secdata|captcha/i.test(url);
}

export const BLOCKED_MESSAGE =
  "AliExpress 봇 인증(캡차)에 막혔습니다. `aliexpress_login` 툴을 실행해 브라우저 창에서 인증/로그인을 마치면 이후 요청에 그 세션이 재사용됩니다.";
