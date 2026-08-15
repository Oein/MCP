import { mcTest, assert, registerShutdown } from "@mc-mcp/client/testing";

registerShutdown();

/** Every test here builds this pack, so each one starts by clearing it. */
const PACK = "mcmcp_e2e";

async function freshPack(mc: {
  deleteDatapack(p: string): Promise<unknown>;
  createDatapack(p: string, o?: { description?: string }): Promise<{ created: boolean }>;
}) {
  await mc.deleteDatapack(PACK).catch(() => {
    // nothing there yet on the first run, which is fine
  });
  return mc.createDatapack(PACK, { description: "mc-mcp e2e fixture" });
}

mcTest("paths report the pack format this build actually wants", { noArena: true }, async ({ mc }) => {
  const paths = await mc.paths();

  assert.ok(paths.gameDir.length > 0);
  assert.match(paths.resourcePacksDir, /resourcepacks$/);
  assert.ok(
    paths.currentWorld.datapacksDir,
    "a singleplayer world should report where its datapacks go",
  );

  // The whole reason this tool exists: 26.2 wants a major/minor pair, and a
  // number recalled from an older version produces a pack the game ignores.
  assert.ok(paths.packFormats.data.major > 0, "data pack_format major must be reported");
  assert.ok(paths.packFormats.resource.major > 0, "resource pack_format major must be reported");
  assert.equal(paths.packFormats.data.directory, "data");
  assert.equal(paths.packFormats.resource.directory, "assets");
});

mcTest("a generated datapack loads and its function runs", { timeoutMs: 180_000 }, async ({ mc, arena }) => {
  const created = await freshPack(mc);
  assert.equal(created.created, true);

  // A function that leaves evidence in the world, so "did it load" is answered
  // by the block state rather than by a chat message that might just be an echo.
  const target = arena.at(2, 0, 2);
  await mc.writeDatapackFile(
    PACK,
    "data/mcmcp/function/mark.mcfunction",
    `setblock ${target.x} ${target.y} ${target.z} minecraft:diamond_block\n`,
  );

  const files = await mc.datapackFiles(PACK);
  assert.ok(files.includes("pack.mcmeta"), `pack.mcmeta missing, got ${files.join(", ")}`);

  await mc.reloadDatapacks();
  await mc.command("function mcmcp:mark", 3000);
  await arena.expectBlock(target, "minecraft:diamond_block");
});

mcTest("a written datapack shows up as enabled", { timeoutMs: 180_000 }, async ({ mc }) => {
  await freshPack(mc);

  await mc.writeDatapackFile(
    PACK,
    "data/mcmcp/dialog/greet.json",
    JSON.stringify({
      type: "minecraft:notice",
      title: "e2e",
      body: [{ type: "minecraft:plain_message", contents: "from a datapack" }],
      action: { label: "ok" },
    }),
  );

  await mc.reloadDatapacks();

  // /datapack list is the authority on whether the game took the pack, and it
  // names packs from the folder as "file/<name>".
  const listed = await mc.command("datapack list", 3000);
  const text = listed.messages.map((m) => m.text).join(" ");
  assert.match(
    text,
    new RegExp(`file/${PACK}`),
    `expected file/${PACK} among the enabled packs, got: ${text}`,
  );

  // Deliberately not asserted here: that mcmcp:greet appears in the client's
  // minecraft:dialog registry. Dialogs live in a *dynamic* registry, which the
  // server sends during login, and a mid-session /reload was observed not to
  // resend it -- so the id is only resolvable after rejoining the world.
});

mcTest("malformed JSON is rejected before it reaches the game", { noArena: true }, async ({ mc }) => {
  await freshPack(mc);

  // Catching this at write time is the point: the same content reaching /reload
  // produces an error that names a resource id rather than the file.
  await assert.rejects(
    () => mc.writeDatapackFile(PACK, "data/mcmcp/dialog/broken.json", "{ not json"),
    (err: Error) => /not valid JSON/i.test(err.message),
    "invalid JSON must be refused at write time",
  );

  const files = await mc.datapackFiles(PACK);
  assert.equal(
    files.includes("data/mcmcp/dialog/broken.json"),
    false,
    "a rejected write must not leave a file behind",
  );
});

mcTest("datapack writes cannot escape the pack folder", { noArena: true }, async ({ mc }) => {
  await freshPack(mc);

  await assert.rejects(
    () => mc.writeDatapackFile(PACK, "../../../../escaped.txt", "nope"),
    (err: Error) => /escapes/i.test(err.message),
    "a traversing path must be refused",
  );
});

mcTest("registry reads answer 'what may I write here'", { noArena: true }, async ({ mc }) => {
  const blocks = await mc.registry("block", { filter: "diamond" });
  assert.ok(blocks.entries.includes("minecraft:diamond_block"));
  assert.ok(blocks.total > 0);

  await assert.rejects(
    () => mc.registry("minecraft:definitely_not_a_registry"),
    (err: Error) => /no registry/i.test(err.message),
  );
});

mcTest("a resource pack can be installed from a path and applied", { timeoutMs: 180_000 }, async ({ mc }) => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  // Built somewhere outside the game directory on purpose: the point of taking
  // a path is that the pack does not have to be in resourcepacks already.
  const dir = await mkdtemp(join(tmpdir(), "mcmcp-pack-"));
  const paths = await mc.paths();
  const fmt = paths.packFormats.resource;
  await writeFile(
    join(dir, "pack.mcmeta"),
    JSON.stringify({
      pack: {
        description: "mc-mcp e2e pack",
        min_format: [fmt.major, fmt.minor],
        max_format: [fmt.major, fmt.minor],
      },
    }),
  );
  await mkdir(join(dir, "assets/minecraft/lang"), { recursive: true });
  await writeFile(
    join(dir, "assets/minecraft/lang/en_us.json"),
    JSON.stringify({ "menu.singleplayer": "MC-MCP PACK ACTIVE" }),
  );

  const before = await mc.resourcePacks();
  const applied = await mc.setResourcePack({ path: dir });

  assert.ok(applied.applied, "the pack should report as applied");
  assert.ok(
    applied.selected.includes(applied.applied!),
    `the pack must survive the resource reload; selected: ${applied.selected.join(", ")}`,
  );

  const after = await mc.resourcePacks();
  assert.ok(
    after.selected.length >= before.selected.length,
    "applying a pack should not drop the built-ins",
  );

  // Put it back, so the suite leaves the instance as it found it.
  await mc.setResourcePack({ ids: [] });
  const restored = await mc.resourcePacks();
  assert.equal(
    restored.selected.includes(applied.applied!),
    false,
    "clearing with ids:[] should deselect the pack again",
  );
});
