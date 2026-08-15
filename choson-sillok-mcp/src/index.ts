#!/usr/bin/env node
/**
 * 조선왕조실록 MCP 서버 (stdio).
 *
 * 국사편찬위원회 조선왕조실록(https://sillok.history.go.kr)의 검색·열람 기능을
 * MCP 도구로 노출한다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  KINGS,
  SillokError,
  getArticle,
  listDay,
  listMonths,
  search,
} from "./sillok.js";

const server = new McpServer({
  name: "choson-sillok",
  version: "0.1.0",
});

/** 도구 결과를 MCP 콘텐츠로 감싼다. 실패는 isError로 돌려준다. */
async function run(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(data, null, 2) },
      ],
    };
  } catch (err) {
    const msg =
      err instanceof SillokError
        ? err.message
        : `조선왕조실록 조회 중 오류가 발생했습니다: ${String(err)}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}

server.registerTool(
  "search_sillok",
  {
    title: "실록 검색",
    description:
      "조선왕조실록 전문을 키워드로 검색한다. 기본은 국역문 검색이며 target을 " +
      "'original'로 주면 한문 원문을 검색한다. 결과에는 기사 ID, 출처 표기, " +
      "제목, 발췌문이 담기고 왕대별 적중 건수도 함께 준다. 기사 전문은 " +
      "get_sillok_article에 기사 ID를 넘겨 받는다.",
    inputSchema: {
      query: z.string().min(1).max(100).describe("검색어 (한글 또는 한자)"),
      target: z
        .enum(["translation", "original"])
        .optional()
        .describe("translation=국역문(기본), original=한문 원문"),
      king: z
        .string()
        .optional()
        .describe("'세종실록'처럼 실록 이름으로 결과를 좁힌다"),
      page: z.number().int().min(1).optional().describe("페이지 번호 (기본 1)"),
      perPage: z
        .union([z.literal(10), z.literal(50), z.literal(100)])
        .optional()
        .describe("페이지당 결과 수. 사이트가 허용하는 10·50·100만 가능 (기본 10)"),
      sort: z
        .enum(["period", "accuracy"])
        .optional()
        .describe("period=시대순(기본), accuracy=정확도순"),
    },
  },
  async (args) => run(() => search(args)),
);

server.registerTool(
  "get_sillok_article",
  {
    title: "실록 기사 전문",
    description:
      "기사 ID로 실록 기사 한 건의 국역문·한문 원문·각주·분류를 가져온다. " +
      "기사 ID는 'kda_12512030_002' 형태이며 search_sillok 결과에서 얻는다.",
    inputSchema: {
      id: z
        .string()
        .describe("기사 ID (예: kda_12512030_002 — 세종 25년 12월 30일 2번째 기사)"),
    },
  },
  async ({ id }) => run(() => getArticle(id)),
);

server.registerTool(
  "list_sillok_kings",
  {
    title: "왕대 목록",
    description:
      "실록 33종(태조실록~순종실록부록)의 왕대 코드와 이름을 나열한다. " +
      "여기서 얻은 코드를 list_sillok_months에 넘겨 연·월을 탐색한다.",
    inputSchema: {},
  },
  async () => run(async () => KINGS),
);

server.registerTool(
  "list_sillok_months",
  {
    title: "왕대별 연·월 목록",
    description:
      "한 왕대의 재위 연도와 각 연도에 실린 월 목록을 준다(윤달 포함). " +
      "각 월의 id를 list_sillok_day에 넘기면 그 달의 일자별 기사 목록을 볼 수 있다.",
    inputSchema: {
      kingCode: z
        .string()
        .regex(/^[a-z]{3}$/)
        .describe("왕대 코드 (예: kaa=태조실록, kda=세종실록)"),
    },
  },
  async ({ kingCode }) => run(() => listMonths(kingCode)),
);

server.registerTool(
  "list_sillok_day",
  {
    title: "일자별 기사 목록",
    description:
      "특정 월(예: kaa_101070) 또는 특정 일자(예: kaa_10107017)의 기사 제목 목록과 " +
      "그 달에 기사가 있는 날짜들을 준다. 월 id를 주면 그 달의 기사 전체가 나온다.",
    inputSchema: {
      id: z
        .string()
        .describe("월 id(kaa_101070) 또는 일자 id(kaa_10107017)"),
    },
  },
  async ({ id }) => run(() => listDay(id)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
