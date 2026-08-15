import { mcTest, assert, waitFor } from "@mc-mcp/client/testing";

mcTest("holding a movement key actually moves the player", async ({ mc }) => {
  // The first step after arriving in a freshly loaded arena is partly eaten by
  // the server reconciling the teleport, so measuring from a standing start
  // there understates the speed. Walk briefly first, then measure from motion.
  await mc.moveFor({ forward: true }, 400);

  const before = await mc.position();
  await mc.moveFor({ forward: true }, 1500);
  const after = await mc.position();

  // Vanilla walking is 4.317 blocks/s, so 1.5s should cover about 6.
  const travelled = Math.hypot(after.x - before.x, after.z - before.z);
  assert.ok(
    travelled > 4,
    `expected the player to walk at least 4 blocks in 1.5s, moved ${travelled.toFixed(2)}`,
  );
});

mcTest("inputs are released when the duration expires", async ({ mc }) => {
  await mc.moveFor({ forward: true }, 400);

  const settled = await mc.position();
  // Give the client longer than the hold lasted; if the key were stuck the
  // player would keep drifting.
  await new Promise((r) => setTimeout(r, 1200));
  const later = await mc.position();

  const drift = Math.hypot(later.x - settled.x, later.z - settled.z);
  assert.ok(drift < 1, `the player should have stopped, drifted ${drift.toFixed(2)}`);
});

mcTest("look_at points the camera at a target", async ({ mc, arena }) => {
  const target = arena.at(8, 0, 8);
  await mc.lookAt(target, 1);

  // The turn is spread over ticks, so wait for it rather than reading instantly.
  await waitFor(
    () => mc.state(),
    (s) => s.crosshair?.type === "block" || Math.abs(s.player!.pitch) > 1,
    { description: "the camera to finish turning", timeoutMs: 5000 },
  );

  const player = await mc.player();
  assert.ok(Number.isFinite(player.yaw) && Number.isFinite(player.pitch));
});

mcTest(
  "baritone walks to a destination and confirms arrival",
  // A big arena so the walk happens entirely on ground this test carved itself.
  // Walking "40 blocks that way" from wherever the player happens to be depends
  // on the terrain there: at arena height the surroundings are usually solid
  // rock, and whether Baritone can get through is luck, not a property of the
  // code under test.
  { timeoutMs: 420_000, arenaSize: 48 },
  async ({ mc, arena }) => {
    const mods = await mc.mods();
    if (!mods.hasBaritone) {
      // Reported rather than silently passing: a green suite that never exercised
      // pathfinding would be actively misleading.
      throw new Error(
        "Baritone is not installed in this instance; run scripts/setup.sh to stage it",
      );
    }

    const destination = arena.at(4, 0, 4);

    const result = await mc.goto({
      x: destination.x,
      z: destination.z,
      goal: "xz",
      wait: true,
      timeoutMs: 240_000,
    });
    assert.equal(
      result.completion?.atGoal,
      true,
      `baritone should report arrival, got ${JSON.stringify(result.completion)}`,
    );

    const end = await mc.position();
    const distance = Math.hypot(end.x - destination.x, end.z - destination.z);
    assert.ok(
      distance < 3,
      `expected to end within 3 blocks of the goal, ended ${distance.toFixed(1)} away`,
    );
  },
);

mcTest("baritone reports failure instead of a false arrival", { timeoutMs: 120_000 }, async ({ mc }) => {
  const mods = await mc.mods();
  if (!mods.hasBaritone) throw new Error("Baritone is not installed; run scripts/setup.sh");

  const start = await mc.position();
  // Far enough that it cannot possibly finish in the time allowed.
  const unreachable = { x: Math.round(start.x) + 5000, z: Math.round(start.z) + 5000 };

  await assert.rejects(
    () => mc.goto({ ...unreachable, goal: "xz", wait: true, timeoutMs: 8000 }),
    /still pathing|did not|without reaching/i,
    "an unfinished path must surface as an error, never as success",
  );

  await mc.baritoneStop();
  const status = await mc.baritoneStatus();
  assert.equal(status.busy, false, "baritone should be idle after a stop");
});

mcTest("baritone's chat command channel works both ways", async ({ mc }) => {
  const mods = await mc.mods();
  if (!mods.hasBaritone) throw new Error("Baritone is not installed; run scripts/setup.sh");

  // Baritone's own commands go through its '#' chat prefix rather than its Java
  // API, and its replies never reach the client's message events -- it writes
  // through a Consumer held in its settings, which the bridge wraps. Assert on
  // both halves: the reply coming back, and the command taking effect.
  const read = await mc.baritoneCommand("set allowSprint", 3000);
  assert.ok(
    read.messages.some((m) => /allowSprint/i.test(m.text)),
    `baritone's reply should be readable; got ${read.messages.map((m) => m.text).join(" | ")}`,
  );

  const bogus = await mc.baritoneCommand("thiscommanddoesnotexist", 3000);
  assert.ok(
    bogus.messages.some((m) => /not found/i.test(m.text)),
    `an unknown command should report itself; got ${bogus.messages.map((m) => m.text).join(" | ")}`,
  );

  const start = await mc.position();
  const destination = { x: Math.round(start.x) + 12, z: Math.round(start.z) + 12 };
  await mc.baritoneCommand(`goto ${destination.x} ${destination.z}`, 500);

  const status = await waitFor(
    () => mc.baritoneStatus(),
    (s) => s.busy === true || !!s.goal,
    { description: "baritone to accept the chat command", timeoutMs: 10_000 },
  );
  assert.ok(
    status.goal?.includes(String(destination.x)),
    `the goal should match what was asked for; got ${JSON.stringify(status)}`,
  );

  await mc.baritoneStop();
  assert.equal((await mc.baritoneStatus()).busy, false, "stop should end it");
});
