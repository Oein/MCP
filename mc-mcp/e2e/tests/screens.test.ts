import { mcTest, assert } from "@mc-mcp/client/testing";

mcTest("the inventory screen enumerates as widgets", { noArena: true }, async ({ mc }) => {
  await mc.openInventory();
  const screen = await mc.screen();

  assert.equal(screen.open, true);
  assert.match(screen.class ?? "", /Inventory/i);

  await mc.closeScreen();
  const after = await mc.screen();
  assert.equal(after.open, false, "the screen should close");
});

mcTest("a server dialog can be read and answered", { noArena: true }, async ({ mc }) => {
  // /dialog is 26.x-only, and this is the flow an agent has to survive: a
  // server puts up a dialog and the client must answer it to carry on.
  const inline = JSON.stringify({
    type: "minecraft:notice",
    title: "mc-mcp e2e",
    body: [{ type: "minecraft:plain_message", contents: "answer me" }],
    action: { label: "Acknowledge" },
  });

  const shown = await mc.command(`/dialog show @s ${inline}`, 1500);
  const failed = shown.messages.some((m) => /error|unknown|incorrect|expected/i.test(m.text));
  assert.equal(
    failed,
    false,
    `/dialog was rejected: ${shown.messages.map((m) => m.text).join(" | ")}`,
  );

  const screen = await mc.screen();
  assert.equal(screen.open, true, "a dialog should have opened a screen");
  assert.equal(screen.isDialog, true, "the bridge should recognise it as a dialog");

  const buttons = (screen.widgets ?? []).filter((w) => w.kind === "button");
  assert.ok(buttons.length > 0, `expected a button, got ${JSON.stringify(screen.widgets)}`);

  await mc.clickWidget({ index: buttons[0]!.index });

  const after = await mc.screen();
  assert.notEqual(
    after.class,
    screen.class,
    "clicking the dialog's button should dismiss or advance it",
  );
});

mcTest("unknown widget labels fail with a useful message", { noArena: true }, async ({ mc }) => {
  await mc.openInventory();
  try {
    await assert.rejects(
      () => mc.clickWidget({ label: "definitely-not-here" }),
      // The message must name the screen and what was available, or debugging a
      // failed flow means guessing.
      (err: Error) => /no widget labelled/i.test(err.message) && /on \w+/.test(err.message),
    );
  } finally {
    await mc.closeScreen();
  }
});
