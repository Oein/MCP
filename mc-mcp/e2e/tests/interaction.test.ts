import { mcTest, assert, waitFor } from "@mc-mcp/client/testing";

mcTest("a chest can be opened and its slots clicked", async ({ mc, arena }) => {
  const half = Math.floor(arena.size / 2);
  const chest = arena.at(half + 1, 0, half);

  await mc.command(`/setblock ${chest.x} ${chest.y} ${chest.z} minecraft:chest`, 1000);
  await arena.expectBlock(chest, "minecraft:chest");
  await mc.command(
    `/item replace block ${chest.x} ${chest.y} ${chest.z} container.0 with minecraft:diamond 5`,
    1000,
  );

  await mc.command("/clear @s", 800);
  await mc.useOnBlock(chest, { face: "up" });

  const screen = await waitFor(
    () => mc.screen(),
    (s) => s.open === true && /Container|Chest/i.test(s.class ?? ""),
    { description: "the chest screen to open", timeoutMs: 10_000 },
  );
  assert.match(screen.class!, /Container|Chest/i);

  try {
    const inv = await mc.inventory();
    assert.ok(inv.openContainer, "the open chest should be reported as a container");
    const slot = inv.openContainer!.slots.find((s) => s.id === "minecraft:diamond");
    assert.ok(slot, `the diamonds should be visible; got ${JSON.stringify(inv.openContainer!.slots)}`);

    // Shift-click: the standard "move this stack to my inventory" gesture.
    await mc.clickSlot(slot!.slot, { type: "QUICK_MOVE" });

    const after = await waitFor(
      () => mc.inventory(),
      (i) => i.items.some((it) => it.id === "minecraft:diamond"),
      { description: "the diamonds to reach the player's inventory", timeoutMs: 10_000 },
    );
    const moved = after.items.find((i) => i.id === "minecraft:diamond")!;
    assert.equal(moved.count, 5, "the whole stack should move");
  } finally {
    await mc.closeScreen();
    await mc.command(`/setblock ${chest.x} ${chest.y} ${chest.z} air`, 800);
  }
});

mcTest("using an item has an effect in the world", async ({ mc }) => {
  await mc.command("/clear @s", 800);
  await mc.command("/give @s minecraft:snowball 4", 800);
  await waitFor(
    () => mc.inventory(),
    (i) => i.items.some((it) => it.id === "minecraft:snowball"),
    { description: "snowballs to arrive", timeoutMs: 10_000 },
  );
  await mc.hold("minecraft:snowball");
  await mc.look({ pitch: -20 });

  const result = await mc.useItem();
  assert.equal(result.consumed, true, `throwing a snowball should be consumed: ${JSON.stringify(result)}`);

  // The projectile is the observable effect, and it lives well under a second
  // in a small arena, so poll fast rather than reading once.
  await waitFor(
    () => mc.entities({ radius: 24 }),
    (list) => list.some((e) => e.type === "minecraft:snowball"),
    { description: "the thrown snowball", timeoutMs: 3_000, intervalMs: 50 },
  );
});

mcTest("pick-block puts the targeted block in hand", async ({ mc, arena }) => {
  const half = Math.floor(arena.size / 2);
  const target = arena.at(half + 1, 0, half);

  await mc.command("/clear @s", 800);
  await mc.command(`/setblock ${target.x} ${target.y} ${target.z} minecraft:bookshelf`, 1000);
  await arena.expectBlock(target, "minecraft:bookshelf");

  await mc.pickBlock(target);

  const inv = await waitFor(
    () => mc.inventory(),
    (i) => i.selectedItem.id === "minecraft:bookshelf",
    { description: "the bookshelf to end up in hand", timeoutMs: 10_000 },
  );
  assert.equal(inv.selectedItem.id, "minecraft:bookshelf");

  await mc.command(`/setblock ${target.x} ${target.y} ${target.z} air`, 800);
});

mcTest("escape closes an open screen", { noArena: true }, async ({ mc }) => {
  await mc.openInventory();
  assert.equal((await mc.screen()).open, true);

  const result = await mc.pressKey("escape");
  assert.equal(result.handled, true, "the screen should handle escape");

  const after = await waitFor(
    () => mc.screen(),
    (s) => s.open === false,
    { description: "the screen to close", timeoutMs: 5_000 },
  );
  assert.equal(after.open, false);
});

mcTest("chat messages are sent and read back", { noArena: true }, async ({ mc }) => {
  const marker = `mcmcp-e2e-${Date.now()}`;
  const before = await mc.readChat({ limit: 1 });

  await mc.chat(marker, 1500);

  const after = await mc.readChat({ since: before.cursor, limit: 50, waitMs: 3000 });
  assert.ok(
    after.messages.some((m) => m.text.includes(marker)),
    `the message should come back in chat; got ${after.messages.map((m) => m.text).join(" | ")}`,
  );
  assert.ok(after.cursor > before.cursor, "the cursor should advance");
});

mcTest("a dialog's text input can be filled and submitted", async ({ mc, arena }) => {
  // Covers the whole 26.x dialog loop: read the widgets, type into one, press
  // the button, and confirm the server actually ran what the dialog described.
  //
  // The command deliberately is not /say: a dialog refuses to run anything that
  // would send chat as the player, offering only "Copy to Chat Screen", so a
  // chat command would look like a broken dialog rather than a refused one.
  const half = Math.floor(arena.size / 2);
  const target = arena.at(half + 2, 0, half + 2);

  const dialog = JSON.stringify({
    type: "minecraft:multi_action",
    title: "mc-mcp input probe",
    body: { type: "minecraft:plain_message", contents: "type a block id" },
    inputs: [{ type: "minecraft:text", key: "block", label: "block", width: 200 }],
    actions: [
      {
        label: "Place",
        action: {
          type: "minecraft:dynamic/run_command",
          template: `setblock ${target.x} ${target.y} ${target.z} $(block)`,
        },
      },
    ],
  });

  const shown = await mc.command(`/dialog show @s ${dialog}`, 2000);
  const rejected = shown.messages.find((m) => /error|incorrect|expected|unknown/i.test(m.text));
  assert.equal(rejected, undefined, `/dialog was rejected: ${rejected?.text}`);

  const screen = await mc.screen();
  assert.equal(screen.isDialog, true, `expected a dialog, got ${screen.class}`);

  const input = (screen.widgets ?? []).find((w) => w.kind === "input");
  assert.ok(input, `the dialog should expose a text input; got ${JSON.stringify(screen.widgets)}`);

  await mc.setWidgetText("gold_block", { index: input!.index });
  const refreshed = await mc.screen();
  assert.equal(
    refreshed.widgets?.find((w) => w.index === input!.index)?.value,
    "gold_block",
    "the typed value should stick",
  );

  await mc.clickWidget({ label: "Place" });

  // Running a command from a dialog goes through a vanilla confirmation. Its
  // labels are translated and have changed between versions, so pick the button
  // that is not a way out rather than hard-coding the wording.
  const confirm = await mc.screen();
  if (confirm.open && /confirm/i.test(confirm.class ?? "")) {
    const proceed = (confirm.widgets ?? []).find(
      (w) => w.kind === "button" && !/cancel|back|copy|no\b/i.test(w.label ?? ""),
    );
    assert.ok(
      proceed,
      `no way to proceed on ${confirm.class}: ${JSON.stringify(
        (confirm.widgets ?? []).filter((w) => w.kind === "button").map((w) => w.label),
      )}`,
    );
    await mc.clickWidget({ index: proceed!.index });
  }

  // The block is the proof that the typed value reached the server.
  await arena.expectBlock(target, "minecraft:gold_block");

  await mc.closeScreen().catch(() => {});
  await mc.command(`/setblock ${target.x} ${target.y} ${target.z} air`, 800);
});
