import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getClient, config } from "@mc-mcp/client/testing";
import { projectRoot } from "@mc-mcp/client";

/**
 * The MCP surface, driven the way an agent drives it.
 *
 * <p>Every other test file talks to the bridge directly. That leaves the layer
 * an agent actually uses -- tool names, argument names, schema validation, the
 * shape of what comes back -- covered by nothing, and a wrapper that renames an
 * argument fails only there. These tests speak real MCP over stdio to the real
 * server binary.
 */
describe("mcp server", { timeout: 300_000 }, () => {
  let mcp: Client;
  let toolSource = "";

  before(async () => {
    // Ensures the game is up and in a world, so the tools have something to talk to.
    await getClient();

    toolSource = await readFile(join(projectRoot(), "mcp-server", "src", "tools.ts"), "utf8");

    mcp = new Client({ name: "mc-mcp-e2e", version: "0.1.0" });
    await mcp.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(projectRoot(), "mcp-server", "dist", "index.js")],
        env: { ...process.env } as Record<string, string>,
      }),
    );
  });

  after(async () => {
    await mcp?.close();
  });

  /** True when some tool's implementation calls this bridge action. */
  function usedByAnyTool(action: string): boolean {
    return toolSource.includes(`"${action}"`);
  }

  /** Calls a tool and fails loudly if it reports an error. */
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result: any = await mcp.callTool({ name, arguments: args });
    const text = (result.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    assert.equal(result.isError, undefined, `${name} failed: ${text}`);
    return { result, text };
  }

  it("exposes every tool with a schema", async () => {
    const { tools } = await mcp.listTools();
    assert.ok(tools.length >= 30, `expected the full tool set, got ${tools.length}`);
    for (const tool of tools) {
      assert.ok(tool.description, `${tool.name} has no description`);
      assert.equal(tool.inputSchema.type, "object", `${tool.name} has no object schema`);
    }
    // Spot-check the ones an agent reaches for first.
    const names = tools.map((t) => t.name);
    for (const expected of ["mc_state", "mc_goto", "mc_screenshot", "mc_command", "mc_screen"]) {
      assert.ok(names.includes(expected), `${expected} is missing`);
    }
  });

  it("mc_state reports a world through the tool layer", async () => {
    const { text } = await call("mc_state");
    const state = JSON.parse(text);
    assert.equal(state.inWorld, true);
    assert.ok(state.player?.position, "the tool should surface the player's position");
  });

  it("mc_screenshot returns an image content block", async () => {
    const { result } = await call("mc_screenshot");
    const image = (result.content ?? []).find((c: any) => c.type === "image");
    assert.ok(image, "an image block is what makes this usable by a model");
    assert.equal(image.mimeType, "image/png");
    assert.ok(image.data.length > 1000, "the image should not be empty");
  });

  it("mc_command runs a command and returns its output", async () => {
    const { text } = await call("mc_command", { command: "/time query time" });
    const out = JSON.parse(text);
    assert.ok(Array.isArray(out.messages), "command output should come back as messages");
  });

  it("mc_command_syntax answers from the live server", async () => {
    const { text } = await call("mc_command_syntax", { command: "dialog" });
    const syntax = JSON.parse(text);
    assert.ok(syntax.usage?.length > 0, "there should be usage lines for /dialog");
    assert.ok(syntax.usage.every((u: string) => u.startsWith("/dialog")));
  });

  it("mc_get_block and mc_scan_blocks agree with each other", async () => {
    const { text: stateText } = await call("mc_state");
    const pos = JSON.parse(stateText).player.blockPosition;
    const target = { x: pos.x, y: pos.y - 1, z: pos.z };

    const { text: blockText } = await call("mc_get_block", target);
    const block = JSON.parse(blockText).block;

    const { text: scanText } = await call("mc_scan_blocks", {
      x1: target.x, y1: target.y, z1: target.z,
      x2: target.x, y2: target.y, z2: target.z,
      includeAir: true,
    });
    const scan = JSON.parse(scanText);
    assert.equal(scan.blocks[0].block, block, "the two reads should describe the same block");
  });

  it("every bridge action is reachable, by a tool or deliberately by mc_raw", async () => {
    const { text } = await call("mc_raw", { action: "list_actions" });
    const actions: string[] = JSON.parse(text).actions;

    const { tools } = await mcp.listTools();
    const toolNames = new Set(tools.map((t) => t.name));

    // Actions with no dedicated tool are fine only if that is on purpose. An
    // action that quietly has no route to it is a feature an agent cannot use.
    const rawOnly = new Set(["list_actions", "place_block", "swing"]);
    const unreachable = actions.filter(
      (a) => !rawOnly.has(a) && !toolNames.has(`mc_${a}`) && !usedByAnyTool(a),
    );
    assert.deepEqual(
      unreachable,
      [],
      `these bridge actions have no tool and are not marked raw-only: ${unreachable.join(", ")}`,
    );
  });

  it("mc_inventory reads through the tool layer", async () => {
    const { text } = await call("mc_inventory");
    const inv = JSON.parse(text);
    assert.equal(typeof inv.selectedSlot, "number");
    assert.ok(Array.isArray(inv.items));
  });

  it("mc_session reports the offline account and the host policy", async () => {
    const { text } = await call("mc_session");
    const session = JSON.parse(text);
    assert.equal(session.account.offline, true);
    assert.equal(typeof session.policy.requireOfflineAccount, "boolean");
  });

  it("mc_connect refuses a public host through the tool layer", async () => {
    const result: any = await mcp.callTool({
      name: "mc_connect",
      arguments: { address: "mc.hypixel.net" },
    });
    const text = (result.content ?? []).map((c: any) => c.text).join("\n");
    assert.match(text, /refused/i, `expected a refusal, got: ${text}`);
  });

  // Protocol-level problems come back as a result carrying isError, not as a
  // thrown rejection, so a caller sees the reason instead of a dead connection.
  async function expectToolError(
    name: string,
    args: Record<string, unknown>,
    pattern: RegExp,
  ): Promise<void> {
    const result: any = await mcp.callTool({ name, arguments: args });
    const text = (result.content ?? []).map((c: any) => c.text ?? "").join("\n");
    assert.equal(result.isError, true, `${name} should have reported an error, got: ${text}`);
    assert.match(text, pattern);
  }

  it("rejects arguments that do not match the schema", async () => {
    await expectToolError(
      "mc_get_block",
      { x: "not a number", y: 0, z: 0 },
      /expected number, received string/i,
    );
  });

  it("reports unknown tools rather than hanging", async () => {
    await expectToolError("mc_does_not_exist", {}, /not found/i);
  });
});
