import { mcTest, assert, waitFor } from "@mc-mcp/client/testing";

/** Summons a mob in the arena and returns it, once the client can see it. */
async function summon(
  mc: any,
  arena: any,
  type: string,
  offset: { dx: number; dz: number } = { dx: 2, dz: 0 },
) {
  const half = Math.floor(arena.size / 2);
  const at = arena.at(half + offset.dx, 0, half + offset.dz);
  // NoAI so the mob stays where it was put: a wandering target turns "did the
  // attack land" into "was it still in reach", which is not what is being tested.
  await mc.command(
    `/summon ${type} ${at.x} ${at.y} ${at.z} {NoAI:1b,PersistenceRequired:1b,Silent:1b}`,
    1000,
  );

  // Match on position, not just type: a world can already contain a wandering
  // pig, and picking the first one of the right type finds that one instead of
  // the one this test just placed.
  const near = (e: any) =>
    e.type === `minecraft:${type}` &&
    Math.abs(e.position.x - (at.x + 0.5)) < 2 &&
    Math.abs(e.position.z - (at.z + 0.5)) < 2;

  const found = await waitFor(
    () => mc.entities({ radius: 16 }),
    (list: any[]) => list.some(near),
    { description: `a ${type} at ${at.x},${at.z}`, timeoutMs: 15_000 },
  );
  return found.find(near)!;
}

mcTest("nearby entities are listed with usable ids", async ({ mc, arena }) => {
  const pig = await summon(mc, arena, "pig");

  assert.equal(typeof pig.id, "number");
  assert.match(pig.uuid, /^[0-9a-f-]{36}$/);
  assert.ok(pig.health! > 0, "a living entity should report health");
  assert.ok(pig.distance! < 8, `expected the summoned pig within reach, was ${pig.distance}`);

  await mc.command("/kill @e[type=pig,distance=..16]", 800);
});

mcTest("attacking an entity damages it", async ({ mc, arena }) => {
  await mc.command("/gamemode survival", 500);
  try {
    const pig = await summon(mc, arena, "pig");
    const before = pig.health!;

    await mc.attackEntity(pig.id);

    // Damage is applied server-side and arrives a tick or two later.
    const after = await waitFor(
      () => mc.entities({ radius: 12 }),
      (list: any[]) => {
        const now = list.find((e) => e.id === pig.id);
        // Gone entirely counts: one hit can finish an already-hurt mob.
        return !now || now.health! < before;
      },
      { description: "the pig to take damage", timeoutMs: 10_000 },
    );

    const now = after.find((e: any) => e.id === pig.id);
    if (now) {
      assert.ok(now.health! < before, `health should drop from ${before}, got ${now.health}`);
    }
  } finally {
    await mc.command("/kill @e[type=pig,distance=..16]", 800);
    await mc.command("/gamemode creative", 500);
  }
});

mcTest("right-clicking an entity interacts with it", async ({ mc, arena }) => {
  const sheep = await summon(mc, arena, "sheep");
  try {
    await mc.command("/give @s minecraft:shears", 800);
    await waitFor(
      () => mc.inventory(),
      (inv: any) => inv.items.some((i: any) => i.id === "minecraft:shears"),
      { description: "shears to arrive", timeoutMs: 10_000 },
    );
    await mc.hold("minecraft:shears");
    const result = await mc.interactEntity(sheep.id);

    // consumesAction is the game's own answer to "did that do anything";
    // asserting on it keeps the test honest without guessing at wool drops.
    assert.equal(
      result.consumed,
      true,
      `shearing a sheep should be consumed, got ${JSON.stringify(result)}`,
    );
  } finally {
    await mc.command("/kill @e[type=sheep,distance=..16]", 800);
    await mc.command("/kill @e[type=item,distance=..16]", 800);
  }
});

mcTest("an entity that is not loaded is reported clearly", { noArena: true }, async ({ mc }) => {
  await assert.rejects(
    () => mc.attackEntity(999_999),
    /no entity with id/i,
    "a bad id should say so rather than silently doing nothing",
  );
});
