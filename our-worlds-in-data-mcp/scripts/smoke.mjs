import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({ command: "node", args: ["dist/index.js"], cwd: process.cwd() }),
);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const txt = r.content.map((c) => c.text).join("\n");
  console.log(`\n### ${name} (isError=${!!r.isError})\n${txt.slice(0, 600)}`);
}

await call("owid_search_charts", { query: "life expectancy", limit: 2 });
await call("owid_get_chart_data", { slug: "life-expectancy", countries: ["KOR", "JPN"], time: "2000..2003" });
await call("owid_get_chart_metadata", { slug: "life-expectancy", countries: ["KOR"] });
await call("owid_get_chart_readme", { slug: "life-expectancy" });
await call("owid_search_articles", { query: "malaria", limit: 2 });
await call("owid_search_indicators", { query: "share of population with electricity access", limit: 2 });
await call("owid_get_indicator_data", { indicator_id: 900790, countries: ["Asia"], year_from: 2020, max_rows: 5 });
await call("owid_get_indicator_metadata", { indicator_id: 900790 });
await call("owid_get_chart_data", { slug: "this-slug-does-not-exist-xyz" });
await call("owid_get_chart_data", { slug: "population", max_rows: 3 });

await client.close();
