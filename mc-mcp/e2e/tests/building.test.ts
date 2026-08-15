import { mcTest, assert, waitFor } from "@mc-mcp/client/testing";

mcTest("places a block by hand and mines it back", async ({ mc, arena }) => {
  // Right next to where prepare() leaves the player. Reach is validated by the
  // server, and a target 7 blocks away sits close enough to the limit that the
  // same placement succeeds or fails depending on timing -- which reads as a
  // flaky test rather than as the reach rule it actually is.
  const half = Math.floor(arena.size / 2);
  const floor = arena.at(half + 1, -1, half);
  const target = arena.at(half + 1, 0, half);

  await mc.command("/gamemode creative");
  await mc.command(`/give @s minecraft:oak_planks 64`, 1000);
  // /give is applied server-side; holding before the client sees it fails.
  await waitFor(
    () => mc.inventory(),
    (inv) => inv.items.some((i) => i.id === "minecraft:oak_planks"),
    { description: "the planks to arrive", timeoutMs: 10_000 },
  );
  await mc.hold("minecraft:oak_planks");

  // Place against the top of the floor block, which is where the new block lands.
  await mc.lookAt(target);
  await mc.useOnBlock(floor, { face: "up" });
  await arena.expectBlock(target, "minecraft:oak_planks");

  await mc.breakBlock(target);
  await arena.expectAir(target);
});

mcTest("builds a wall and verifies it block by block", async ({ mc, arena }) => {
  const y = arena.origin.y;
  const from = arena.at(1, 0, 1);
  const to = arena.at(5, 2, 1);

  await mc.command(
    `/fill ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} minecraft:stone_bricks`,
    1500,
  );

  await arena.expectBlock(arena.at(1, 0, 1), "minecraft:stone_bricks");
  await arena.expectBlock(arena.at(5, 2, 1), "minecraft:stone_bricks");

  const scan = await mc.scan(from, to);
  assert.equal(
    scan.counts["minecraft:stone_bricks"],
    5 * 3,
    `expected a 5x3 wall, got ${JSON.stringify(scan.counts)}`,
  );
  assert.equal(scan.blocks.every((b) => b.y >= y && b.y <= y + 2), true);
});

mcTest("scan_blocks reports air only when asked", async ({ mc, arena }) => {
  const from = arena.at(0, 0, 0);
  const to = arena.at(2, 0, 2);

  const withoutAir = await mc.scan(from, to);
  assert.equal(withoutAir.blocks.length, 0, "a freshly reset arena should be empty");
  assert.equal(withoutAir.counts["minecraft:air"], 9, "air should still be counted");

  const withAir = await mc.scan(from, to, { includeAir: true });
  assert.equal(withAir.blocks.length, 9);
});

mcTest("rejects a region that is too large", { noArena: true }, async ({ mc }) => {
  await assert.rejects(
    () => mc.scan({ x: 0, y: 0, z: 0 }, { x: 200, y: 200, z: 200 }),
    /too large/i,
    "an 8M-block scan should be refused rather than freezing the client",
  );
});
