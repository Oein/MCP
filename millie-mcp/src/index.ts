#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authStatus } from "./auth.js";
import { LIVE_API_BASE } from "./config.js";
import { autocomplete, bookDetail, search, searchSections } from "./millie.js";

const server = new McpServer({
  name: "millie-mcp",
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

server.registerTool(
  "millie_search",
  {
    title: "밀리의 서재 도서 검색",
    description:
      "밀리의 서재에서 전자책·오디오북을 검색한다. 제목·저자·출판사·ISBN 모두 키워드로 잡힌다. " +
      "정렬은 지원되지 않고 항상 관련도 순이며, page 로 끝까지 넘길 수 있다. " +
      "결과의 bookId 를 millie_book_detail 에 넘기면 페이지 수·파일 형식까지 볼 수 있다.",
    inputSchema: {
      keyword: z.string().min(1).describe("검색 키워드 (도서명·저자명·출판사·ISBN)"),
      page: z.number().int().min(1).optional().describe("페이지 번호 (기본 1)"),
      count: z.number().int().min(1).max(100).optional().describe("페이지당 결과 수 (기본 20)"),
      availableOnly: z
        .boolean()
        .optional()
        .describe("지금 바로 볼 수 있는 책만 (공개 예정작·서비스 종료작 제외). 기본 false"),
      audiobookOnly: z.boolean().optional().describe("오디오북만 (기본 false)"),
      raw: z
        .boolean()
        .optional()
        .describe("정규화하지 않은 밀리 원본 필드를 그대로 반환 (기본 false)"),
    },
  },
  async (args) => {
    try {
      return ok(await search(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "millie_autocomplete",
  {
    title: "밀리의 서재 검색어 자동완성",
    description:
      "부분 키워드로 밀리의 실제 검색어 제안을 받는다. 제목이 가물가물하거나 표기가 불확실할 때 " +
      "millie_search 전에 써서 검색어를 확정한다. 관련 카테고리도 함께 돌려준다.",
    inputSchema: {
      keyword: z.string().min(1).describe("검색어의 일부 또는 전체"),
      limit: z.number().int().min(1).max(20).optional().describe("제안 개수 (기본 10)"),
    },
  },
  async ({ keyword, limit }) => {
    try {
      return ok(await autocomplete(keyword, limit));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "millie_search_sections",
  {
    title: "밀리의 서재 도서 외 검색",
    description:
      "같은 키워드로 사용자 서재(library), 독서 포스트/리뷰(post), 밀리로드 큐레이션(millie_road) 을 검색한다. " +
      "책 자체가 아니라 '사람들이 이 책·주제를 어떻게 읽었는지'가 필요할 때 쓴다.",
    inputSchema: {
      keyword: z.string().min(1).describe("검색 키워드"),
      sections: z
        .array(z.enum(["library", "post", "millie_road"]))
        .optional()
        .describe("조회할 섹션 (기본: 전부)"),
      limit: z.number().int().min(1).max(50).optional().describe("섹션당 결과 수 (기본 10)"),
    },
  },
  async (args) => {
    try {
      return ok(await searchSections(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "millie_book_detail",
  {
    title: "밀리의 서재 도서 상세 조회",
    description:
      "도서 ID 또는 상세 페이지 URL 로 메타데이터를 가져온다. 페이지 수, 파일 형식(epub/pdf/comic), " +
      "파일 크기, TTS 지원 여부, 대여 가능 여부, 오디오북 재생 시간이 포함된다. " +
      "이 도구만 밀리 계정 토큰이 필요하다 — millie_auth_status 로 설정 상태를 확인할 수 있다.",
    inputSchema: {
      book: z.string().min(1).describe("도서 ID (예: 3c966d5d20f8428a) 또는 상세 페이지 URL"),
      raw: z.boolean().optional().describe("밀리 원본 응답을 그대로 반환 (기본 false)"),
    },
  },
  async ({ book, raw }) => {
    try {
      return ok(await bookDetail(book, raw));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "millie_auth_status",
  {
    title: "밀리 자격증명 상태 확인",
    description:
      "토큰을 어디서 읽었는지, 만료됐는지 확인한다. millie_book_detail 이 인증 오류를 낼 때 먼저 호출한다. " +
      "토큰 값 자체는 반환하지 않는다.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(authStatus());
    } catch (e) {
      return fail(e);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout 은 MCP 프로토콜 전용이므로 로그는 stderr 로만 보낸다.
  console.error(`millie-mcp 시작됨 (api=${LIVE_API_BASE})`);
}

main().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});
