import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getClient, config, waitFor } from "@mc-mcp/client/testing";
import type { McClient } from "@mc-mcp/client";

/**
 * The multiplayer path: joining a real server, and leaving it again.
 *
 * <p>Every other file runs against a singleplayer save, which never exercises
 * {@code connect_server}, the offline-account gate on a live handshake, or
 * getting back out. Those are the parts that break a user's first session.
 *
 * <p>Opt-in because it needs a second process. Start one with
 * {@code scripts/test-server.sh} and run with {@code MCMCP_SERVER_TEST=1}.
 * Skipping is announced rather than silent: a suite that quietly never tests
 * multiplayer looks the same as one that does.
 */
const enabled = process.env.MCMCP_SERVER_TEST === "1";

describe("joining a server", { skip: enabled ? false : "set MCMCP_SERVER_TEST=1 and run scripts/test-server.sh", timeout: 300_000 }, () => {
  let mc: McClient;
  /** The singleplayer world we were in, so the rest of the suite gets it back. */
  let previousWorld: string | null = null;

  before(async () => {
    mc = await getClient();
    previousWorld = config.world;
    if ((await mc.state()).inWorld) await mc.disconnect();
  });

  after(async () => {
    // Leave the client the way the other files expect to find it.
    if ((await mc.state()).inWorld) await mc.disconnect().catch(() => {});
    if (previousWorld) {
      await mc.openWorld(previousWorld, { confirm: true }).catch(() => {});
      await mc.waitUntilInWorld(120_000).catch(() => {});
    }
  });

  it("joins the local test server", async () => {
    await mc.connect(config.server, { name: "mc-mcp e2e" });
    const state = await mc.waitUntilInWorld(120_000);

    assert.equal(state.inWorld, true);
    assert.ok(state.player, "the player should exist on the server");
    assert.match(state.world!.dimension, /^minecraft:/);
  });

  it("reports the connection in the session", async () => {
    const session = await mc.session();
    assert.equal(session.connected, true);
    assert.equal(session.inWorld, true);
    assert.equal(
      session.account.offline,
      true,
      "only an offline account can join an offline-mode server",
    );
  });

  it("reads the server's own command tree", async () => {
    const syntax = await mc.commandSyntax("help");
    assert.ok(syntax.usage!.length > 0, "the server should have sent a command tree");
  });

  it("still refuses a public host while connected", async () => {
    await assert.rejects(
      () => mc.connect("mc.hypixel.net"),
      /refused/i,
      "the host gate must apply on a live session too, not just from the menu",
    );
    assert.equal((await mc.state()).inWorld, true, "a refusal must not drop the session");
  });

  it("sends and receives chat on the server", async () => {
    const marker = `mcmcp-server-${Date.now()}`;
    const before = await mc.readChat({ limit: 1 });
    await mc.chat(marker, 1500);

    const after = await mc.readChat({ since: before.cursor, limit: 50, waitMs: 4000 });
    assert.ok(
      after.messages.some((m) => m.text.includes(marker)),
      `the message should come back; got ${after.messages.map((m) => m.text).join(" | ")}`,
    );
  });

  it("walks on the server with real movement packets", async () => {
    const start = await mc.position();
    await mc.moveFor({ forward: true }, 400);
    await mc.moveFor({ forward: true }, 1500);
    const end = await mc.position();

    const travelled = Math.hypot(end.x - start.x, end.z - start.z);
    assert.ok(travelled > 3, `expected real movement, moved ${travelled.toFixed(2)}`);
  });

  it("leaves the server cleanly", async () => {
    await mc.disconnect();

    const state = await waitFor(
      () => mc.state(),
      (s) => s.inWorld === false,
      { description: "the client to leave the server", timeoutMs: 60_000 },
    );
    assert.equal(state.inWorld, false);
    // The stranded-on-a-blank-screen failure mode: there must be a way back.
    assert.equal(state.screen.open, true, "a screen with controls should be showing");
  });
});
