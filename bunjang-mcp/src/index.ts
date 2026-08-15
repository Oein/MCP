#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  categories,
  getProductDetail,
  priceStats,
  search,
  type SearchOptions,
} from "./bunjang.js";
import { API_BASE } from "./config.js";

const server = new McpServer({
  name: "bunjang-mcp",
  version: "0.1.0",
});

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

/** 검색·시세 툴이 공유하는 필터 스키마. */
const filterSchema = {
  keyword: z.string().min(1).optional().describe("검색 키워드. 카테고리/판매자만으로 조회할 땐 생략 가능."),
  categoryId: z
    .string()
    .optional()
    .describe("카테고리 ID. bunjang_categories 로 찾을 수 있다 (예: 600100001 = 노트북/넷북)."),
  condition: z
    .enum(["any", "used", "new"])
    .optional()
    .describe("상품 상태: any(기본) | used(중고) | new(새상품/미개봉)"),
  minPrice: z.number().int().min(0).optional().describe("최저 가격 (원)"),
  maxPrice: z.number().int().min(0).optional().describe("최고 가격 (원)"),
  onSaleOnly: z
    .boolean()
    .optional()
    .describe("예약중·판매완료를 빼고 바로 구매 가능한 상품만 (기본 false)"),
  includeAds: z.boolean().optional().describe("광고 상품 포함 여부 (기본 false)"),
  freeShippingOnly: z.boolean().optional().describe("무료배송 상품만 (기본 false)"),
};

server.registerTool(
  "bunjang_search",
  {
    title: "번개장터 상품 검색",
    description:
      "번개장터에서 중고/새 상품을 검색한다. 키워드·카테고리·판매자·가격대·상품상태로 필터링하고 정렬할 수 있다. 결과의 productId 를 bunjang_product_detail 에 넘기면 설명·판매자 정보까지 볼 수 있다.",
    inputSchema: {
      ...filterSchema,
      sellerId: z.string().optional().describe("판매자 UID. 특정 상점의 상품만 볼 때 사용."),
      sort: z
        .enum(["score", "date", "price_asc", "price_desc"])
        .optional()
        .describe("정렬: score(관련도, 기본) | date(최신순) | price_asc(저가순) | price_desc(고가순)"),
      limit: z.number().int().min(1).max(300).optional().describe("반환할 최대 상품 수 (기본 20)"),
    },
  },
  async (args) => {
    try {
      return ok(await search(args as SearchOptions));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "bunjang_product_detail",
  {
    title: "번개장터 상품 상세 조회",
    description:
      "상품 ID 또는 상품 URL 로 상세 정보를 가져온다. 본문 설명, 가격, 상태, 거래 방식, 조회수·찜·채팅수, 이미지, 판매자 평점/거래건수까지 포함한다.",
    inputSchema: {
      product: z.string().min(1).describe("상품 ID(숫자) 또는 상품 페이지 URL"),
    },
  },
  async ({ product }) => {
    try {
      return ok(await getProductDetail(product));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "bunjang_seller_products",
  {
    title: "번개장터 판매자 상품 목록",
    description:
      "특정 판매자(상점)가 올린 상품 목록을 가져온다. 판매자 UID 는 bunjang_product_detail 의 seller.sellerId 또는 검색 결과의 sellerId 에서 얻는다.",
    inputSchema: {
      sellerId: z.string().min(1).describe("판매자 UID (숫자)"),
      sort: z
        .enum(["score", "date", "price_asc", "price_desc"])
        .optional()
        .describe("정렬: date(최신순, 기본) | score | price_asc | price_desc"),
      limit: z.number().int().min(1).max(300).optional().describe("반환할 최대 상품 수 (기본 30)"),
      onSaleOnly: z
        .boolean()
        .optional()
        .describe("예약중·판매완료를 빼고 판매중인 상품만 (기본 false)"),
    },
  },
  async ({ sellerId, sort, limit, onSaleOnly }) => {
    try {
      return ok(
        await search({
          sellerId,
          sort: sort ?? "date",
          limit: limit ?? 30,
          onSaleOnly,
          includeAds: true, // 상점 목록에서는 광고 플래그가 자기 상품에도 붙는다.
        }),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "bunjang_price_stats",
  {
    title: "번개장터 중고 시세 통계",
    description:
      "검색 결과를 표본으로 삼아 해당 상품의 중고 시세를 요약한다. 최저/최고/평균/중앙값과 사분위 범위(정상 거래대 추정), 가장 싼 매물 5건을 함께 반환한다. '얼마에 팔면 되냐', '이 가격 적당하냐' 같은 질문에 쓴다.",
    inputSchema: {
      ...filterSchema,
      sampleSize: z
        .number()
        .int()
        .min(10)
        .max(300)
        .optional()
        .describe("통계에 사용할 표본 수 (기본 100). 클수록 정확하지만 느리다."),
      includeWantedAds: z
        .boolean()
        .optional()
        .describe(
          "'삽니다/매입' 같은 구매 희망 글도 표본에 포함할지 (기본 false). 기본값이면 시세 왜곡을 막기 위해 제외한다.",
        ),
    },
  },
  async (args) => {
    try {
      return ok(await priceStats(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "bunjang_categories",
  {
    title: "번개장터 카테고리 조회",
    description:
      "카테고리 트리를 탐색한다. query 로 이름 검색, parentId 로 하위 목록 조회, 둘 다 없으면 최상위 목록을 반환한다. 여기서 얻은 id 를 bunjang_search 의 categoryId 에 넘긴다.",
    inputSchema: {
      query: z.string().optional().describe("카테고리 이름 검색어 (예: '노트북')"),
      parentId: z.string().optional().describe("이 카테고리의 바로 아래 단계를 나열한다."),
      limit: z.number().int().min(1).max(200).optional().describe("검색 결과 최대 개수 (기본 50)"),
    },
  },
  async (args) => {
    try {
      return ok(await categories(args));
    } catch (e) {
      return fail(e);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout 은 MCP 프로토콜 전용이므로 로그는 stderr 로만 보낸다.
  console.error(`bunjang-mcp 시작됨 (api=${API_BASE})`);
}

main().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});
