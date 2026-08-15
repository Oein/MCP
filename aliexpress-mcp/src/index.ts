#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getProductDetail, search, SORT_MAP } from "./aliexpress.js";
import { authStatus, login } from "./auth.js";
import { clearState, closeBrowser } from "./browser.js";
import { BASE_URL, STATE_FILE } from "./config.js";

const server = new McpServer({
  name: "aliexpress-mcp",
  version: "0.1.0",
});

/** 모든 툴이 같은 형태로 결과를 돌려주도록 감싼다. */
function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "aliexpress_login",
  {
    title: "AliExpress 로그인",
    description:
      "브라우저 창을 띄워 사용자가 직접 AliExpress 에 로그인하게 한다. 로그인이 확인되면 세션(쿠키)을 저장해 이후 모든 검색·상세 조회에 재사용한다. 봇 인증(캡차)에 막혔을 때도 이 툴로 창을 열어 인증을 통과시키면 된다.",
    inputSchema: {
      waitSeconds: z
        .number()
        .int()
        .min(10)
        .max(600)
        .optional()
        .describe(
          "로그인 완료를 기다릴 최대 시간(초). 기본 120. 초과하면 창은 열어 둔 채 pending 으로 반환한다.",
        ),
    },
  },
  async ({ waitSeconds }) => {
    try {
      return ok(await login((waitSeconds ?? 120) * 1000));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "aliexpress_auth_status",
  {
    title: "AliExpress 로그인 상태 확인",
    description:
      "현재 저장된 세션으로 실제 로그인되어 있는지 확인한다. 로그인 상태면 세션 파일을 최신으로 갱신한다.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await authStatus());
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "aliexpress_logout",
  {
    title: "AliExpress 로그아웃",
    description:
      "저장된 세션 쿠키와 브라우저 프로필을 모두 삭제한다. 다른 계정으로 다시 로그인할 때 사용한다.",
    inputSchema: {},
  },
  async () => {
    try {
      await clearState();
      return ok({ cleared: true, stateFile: STATE_FILE });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "aliexpress_search",
  {
    title: "AliExpress 상품 검색",
    description:
      "키워드로 AliExpress 상품을 검색해 제목·가격·할인율·평점·판매량·상품ID 를 반환한다. 상세 정보가 필요하면 반환된 productId 를 aliexpress_product_detail 에 넘긴다.",
    inputSchema: {
      keyword: z.string().min(1).describe("검색 키워드"),
      page: z.number().int().min(1).max(60).optional().describe("페이지 번호 (기본 1)"),
      sort: z
        .enum(Object.keys(SORT_MAP) as [string, ...string[]])
        .optional()
        .describe(
          "정렬 기준: best_match(기본) | orders(주문 많은 순) | newest | price_asc | price_desc",
        ),
      minPrice: z.number().min(0).optional().describe("최저 가격 (사이트 통화 기준)"),
      maxPrice: z.number().min(0).optional().describe("최고 가격 (사이트 통화 기준)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe("반환할 최대 상품 수 (기본 20)"),
    },
  },
  async (args) => {
    try {
      return ok(await search(args as Parameters<typeof search>[0]));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "aliexpress_product_detail",
  {
    title: "AliExpress 상품 상세 조회",
    description:
      "상품 ID 또는 상품 URL 로 상세 정보를 가져온다. 가격·SKU 별 옵션과 재고·이미지·사양·판매자 정보·평점을 포함하며, 옵션으로 최근 리뷰도 함께 받을 수 있다.",
    inputSchema: {
      product: z
        .string()
        .min(1)
        .describe("상품 ID(숫자) 또는 상품 페이지 URL"),
      withReviews: z
        .boolean()
        .optional()
        .describe("최근 리뷰를 함께 가져올지 여부 (기본 false)"),
      reviewLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("가져올 리뷰 수 (기본 10)"),
    },
  },
  async ({ product, withReviews, reviewLimit }) => {
    try {
      return ok(await getProductDetail(product, { withReviews, reviewLimit }));
    } catch (e) {
      return fail(e);
    }
  },
);

async function main(): Promise<void> {
  const shutdown = async () => {
    await closeBrowser().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout 은 MCP 프로토콜 전용이므로 로그는 stderr 로만 보낸다.
  console.error(`aliexpress-mcp 시작됨 (base=${BASE_URL})`);
}

main().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});
