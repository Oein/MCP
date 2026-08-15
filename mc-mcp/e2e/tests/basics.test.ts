import { mcTest, assert, registerShutdown } from "@mc-mcp/client/testing";

registerShutdown();

mcTest("the bridge answers and reports a sane world state", { noArena: true }, async ({ mc }) => {
  const actions = await mc.listActions();
  assert.ok(actions.includes("get_state"), "get_state should be registered");
  assert.ok(actions.length > 20, `expected a full action set, got ${actions.length}`);

  const state = await mc.state();
  assert.equal(state.inWorld, true);
  assert.ok(state.player, "a player should exist in a world");
  assert.ok(state.player!.maxHealth > 0);
  assert.match(state.world!.dimension, /^minecraft:/);
});

mcTest("the session is an offline account", { noArena: true }, async ({ mc }) => {
  const session = await mc.session();
  assert.equal(
    session.account.offline,
    true,
    "e2e runs must use an offline account; the bridge refuses to join otherwise",
  );
});

mcTest("connecting to a public host is refused", { noArena: true }, async ({ mc }) => {
  // The gate that keeps an agent off real servers. If this ever passes silently,
  // the safety model is broken, so assert on the refusal itself.
  await assert.rejects(
    () => mc.connect("mc.hypixel.net"),
    (err: Error) => /refused/i.test(err.message),
    "a public address must be refused",
  );

  // ...and the client must still be on the test server afterwards.
  const state = await mc.state();
  assert.equal(state.inWorld, true, "a refused connect must not disturb the current session");
});

mcTest("screenshots come back as real PNGs", { noArena: true }, async ({ mc }) => {
  const shot = await mc.screenshot();
  assert.equal(shot.format, "png");
  assert.ok(shot.width > 0 && shot.height > 0);

  const bytes = Buffer.from(shot.data, "base64");
  // PNG magic number; a truncated or empty capture fails here rather than
  // silently producing a useless artifact.
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "the payload should start with the PNG signature",
  );
});

mcTest("command syntax comes from the live server", { noArena: true }, async ({ mc }) => {
  const all = await mc.commandSyntax();
  assert.ok(all.commands && all.commands.length > 0);

  const time = await mc.commandSyntax("time");
  assert.ok(time.usage && time.usage.length > 0, "/time should have usage lines");
  assert.ok(
    time.usage!.every((line) => line.startsWith("/time")),
    "usage lines should be fully qualified",
  );

  await assert.rejects(
    () => mc.commandSyntax("definitely_not_a_command"),
    /no command named/i,
  );
});
