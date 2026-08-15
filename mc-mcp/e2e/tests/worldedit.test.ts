import { mcTest, assert } from "@mc-mcp/client/testing";

/** Skips the file cleanly when WorldEdit is not staged in this instance. */
async function requireWorldEdit(mc: { mods(): Promise<{ hasWorldEdit: boolean }> }) {
  const mods = await mc.mods();
  if (!mods.hasWorldEdit) {
    throw new Error("WorldEdit is not installed in this instance; run scripts/setup.sh");
  }
}

mcTest("//set fills the selection", { timeoutMs: 120_000 }, async ({ mc, arena }) => {
  await requireWorldEdit(mc);

  const a = arena.at(1, 0, 1);
  const b = arena.at(4, 2, 4);

  // WorldEdit's positions take coordinates directly, which avoids having to
  // walk the player to each corner.
  await mc.worldedit(`//pos1 ${a.x},${a.y},${a.z}`);
  await mc.worldedit(`//pos2 ${b.x},${b.y},${b.z}`);
  const result = await mc.worldedit("//set minecraft:glass", 5000);

  const rejected = result.messages.some((m) => /permission|unknown command/i.test(m.text));
  assert.equal(
    rejected,
    false,
    `WorldEdit refused the operation: ${result.messages.map((m) => m.text).join(" | ")}`,
  );

  await arena.expectBlock(a, "minecraft:glass");
  await arena.expectBlock(b, "minecraft:glass");

  const scan = await mc.scan(a, b);
  assert.equal(scan.counts["minecraft:glass"], 4 * 3 * 4);
});

mcTest("//undo reverts the last operation", { timeoutMs: 120_000 }, async ({ mc, arena }) => {
  await requireWorldEdit(mc);

  const a = arena.at(1, 0, 1);
  const b = arena.at(3, 0, 3);

  await mc.worldedit(`//pos1 ${a.x},${a.y},${a.z}`);
  await mc.worldedit(`//pos2 ${b.x},${b.y},${b.z}`);
  await mc.worldedit("//set minecraft:gold_block", 5000);
  await arena.expectBlock(a, "minecraft:gold_block");

  await mc.worldedit("//undo", 5000);
  await arena.expectAir(a);
});
