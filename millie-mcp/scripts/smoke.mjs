import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(
  // StdioClientTransport 는 기본적으로 안전한 최소 env 만 넘기므로,
  // MILLIE_AUTH_FILE 같은 설정을 서버까지 전달하려면 명시해야 한다.
  new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: { ...process.env },
  }),
);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const txt = r.content.map((c) => c.text).join("\n");
  console.log(`\n### ${name} (isError=${!!r.isError})\n${txt.slice(0, 700)}`);
}

await call("millie_autocomplete", { keyword: "파이" });
await call("millie_search", { keyword: "파이썬", count: 2 });
await call("millie_search", { keyword: "이태준", count: 3, availableOnly: true });
await call("millie_search", { keyword: "소설", count: 2, page: 40 });
await call("millie_search_sections", { keyword: "김유정", limit: 2 });
await call("millie_auth_status", {});
await call("millie_book_detail", { book: "https://www.millie.co.kr/v3/detail/3c966d5d20f8428a" });
await call("millie_search", { keyword: "존재하지않을검색어zzqq", count: 5 });

await client.close();
