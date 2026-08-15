import { mcTest, assert, waitFor } from "@mc-mcp/client/testing";

/** Gives the player an item and waits for the client to see it. */
async function give(mc: any, id: string, count = 1) {
  await mc.command(`/give @s ${id} ${count}`, 800);
  await waitFor(
    () => mc.inventory(),
    (inv: any) => inv.items.some((i: any) => i.id === id),
    { description: `${id} to arrive in the inventory`, timeoutMs: 10_000 },
  );
}

mcTest("holding an item by id puts it in the hand", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await give(mc, "minecraft:diamond_pickaxe");

  const result = await mc.hold("minecraft:diamond_pickaxe");
  assert.equal(result.selectedItem.id, "minecraft:diamond_pickaxe");

  const inv = await mc.inventory();
  assert.equal(inv.selectedItem.id, "minecraft:diamond_pickaxe");
  assert.ok(inv.selectedSlot >= 0 && inv.selectedSlot <= 8, "it should end up on the hotbar");
});

mcTest("an item the player does not have is reported clearly", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await assert.rejects(
    () => mc.hold("minecraft:netherite_hoe"),
    /no .* in inventory/i,
    "a missing item should say so rather than leaving the hand unchanged silently",
  );
});

mcTest("selecting a hotbar slot changes the held item", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await mc.command("/item replace entity @s hotbar.0 with minecraft:stone 5", 800);
  await mc.command("/item replace entity @s hotbar.1 with minecraft:dirt 5", 800);
  await waitFor(
    () => mc.inventory(),
    (inv: any) => inv.items.some((i: any) => i.id === "minecraft:dirt"),
    { description: "the hotbar to be filled", timeoutMs: 10_000 },
  );

  await mc.selectSlot(0);
  assert.equal((await mc.inventory()).selectedItem.id, "minecraft:stone");

  await mc.selectSlot(1);
  assert.equal((await mc.inventory()).selectedItem.id, "minecraft:dirt");

  await assert.rejects(() => mc.selectSlot(9), /hotbar slot must be/i);
});

mcTest("swapping to the offhand moves the item across", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await give(mc, "minecraft:torch", 4);
  await mc.hold("minecraft:torch");

  // Assert the precondition: without this, a failed setup and a broken swap
  // produce the same message.
  assert.equal(
    (await mc.inventory()).selectedItem.id,
    "minecraft:torch",
    "the torch should be in hand before swapping",
  );

  const result = await mc.swapOffhand();
  assert.equal(result.offhand.id, "minecraft:torch", "the torch should be in the offhand now");

  const inv = await mc.inventory();
  assert.equal(inv.offhand.id, "minecraft:torch");
});

mcTest("dropping the held item removes it from the hand", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await give(mc, "minecraft:apple", 3);
  await mc.hold("minecraft:apple");

  await mc.dropItem(true);

  const inv = await waitFor(
    () => mc.inventory(),
    (i: any) => i.selectedItem.empty === true,
    { description: "the hand to empty", timeoutMs: 10_000 },
  );
  assert.equal(inv.selectedItem.empty, true);

  await mc.command("/kill @e[type=item,distance=..16]", 800);
});

mcTest("the inventory screen exposes slots that can be clicked", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await give(mc, "minecraft:emerald", 7);

  await mc.openInventory();
  try {
    const inv = await mc.inventory();
    // The player's own inventory menu is always open behind the screen, so the
    // slot indices a caller would click are addressable here.
    const emerald = inv.items.find((i) => i.id === "minecraft:emerald");
    assert.ok(emerald, "the emerald should be visible in the inventory");
    assert.equal(emerald!.count, 7);

    const screen = await mc.screen();
    assert.match(screen.class ?? "", /Inventory/i);
  } finally {
    await mc.closeScreen();
  }
});
