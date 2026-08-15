import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McClient } from "./client.js";
import { launchGame, projectRoot, stopRunningGame, type GameHandle } from "./launch.js";
import { sleep, waitFor } from "./wait.js";
import type { Vec3 } from "./types.js";

export { assert };
export * from "./types.js";
export { McClient } from "./client.js";
export { waitFor, retry, sleep, WaitTimeoutError } from "./wait.js";

export interface HarnessConfig {
  /** Start the client hidden. Default true: tests should not steal the screen. */
  headless: boolean;
  /** Server to join when the client is not already in a world. */
  server: string;
  /**
   * Singleplayer save to open instead of joining a server. Takes precedence
   * over {@link server}, and needs no second process.
   */
  world: string | null;
  /** Skip joining a server; the test provides its own world. */
  noServer: boolean;
  /** Where the arena is carved. Chosen well away from spawn structures. */
  arenaOrigin: Vec3;
  /** Repeat every test this many times. */
  repeat: number;
  /** Directory for failure screenshots. */
  artifactDir: string;
  launchTimeoutMs: number;
}

function defaultArtifactDir(): string {
  try {
    return join(projectRoot(), "e2e", "artifacts");
  } catch {
    return join(process.cwd(), "artifacts");
  }
}

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export const config: HarnessConfig = {
  headless: envFlag("MCMCP_HEADLESS", true),
  server: process.env.MCMCP_SERVER ?? "localhost",
  world: process.env.MCMCP_WORLD ?? null,
  noServer: envFlag("MCMCP_NO_SERVER", false),
  arenaOrigin: {
    x: Number(process.env.MCMCP_ARENA_X ?? 512),
    y: Number(process.env.MCMCP_ARENA_Y ?? 80),
    z: Number(process.env.MCMCP_ARENA_Z ?? 512),
  },
  repeat: Number(process.env.MCMCP_REPEAT ?? 1),
  // Resolved defensively: failing to locate the checkout should surface when a
  // test tries to launch the game, not as an import-time crash in every file.
  artifactDir: process.env.MCMCP_ARTIFACTS ?? defaultArtifactDir(),
  launchTimeoutMs: Number(process.env.MCMCP_LAUNCH_TIMEOUT_MS ?? 240_000),
};

// One game for the whole run, shared by every test.
//
// node:test isolates each file in its own process, so "one per process" would
// mean one cold start per file -- most of a minute each. Instead the game is
// launched detached: the first process to need it starts it, every later one
// attaches over the handshake, and none of them hold a handle that would keep
// Node alive after the tests finish. Stopping it is a separate, explicit step.
let sharedGame: GameHandle | null = null;
let sharedClient: McClient | null = null;
let bootstrap: Promise<McClient> | null = null;

async function ensureWorld(mc: McClient): Promise<void> {
  const state = await mc.state();
  if (state.inWorld) return;
  if (config.noServer) {
    throw new Error(
      "the client is not in a world and MCMCP_NO_SERVER is set; " +
        "load a world first, or unset it so the harness can join a test server",
    );
  }

  // A singleplayer save needs no second process, so prefer it when one is named.
  if (config.world) {
    try {
      await mc.openWorld(config.world);
    } catch (err: any) {
      const available = await mc
        .worlds()
        .then((r) => r.worlds.map((w) => w.id).join(", "))
        .catch(() => "(could not list saves)");
      throw new Error(
        `could not open world '${config.world}': ${err?.message ?? err}\n` +
          `Available saves: ${available}`,
      );
    }
    await mc.waitUntilInWorld(120_000);
    return;
  }

  const session = await mc.session();
  if (!session.account.offline) {
    throw new Error(
      "the client is signed in with an authenticated account; the bridge only joins " +
        "test servers from an offline account",
    );
  }

  try {
    await mc.connect(config.server, { name: "mc-mcp e2e" });
  } catch (err: any) {
    throw new Error(
      `could not join '${config.server}': ${err?.message ?? err}\n` +
        `Start one with: scripts/test-server.sh, or point MCMCP_WORLD at a singleplayer save.`,
    );
  }
  await mc.waitUntilInWorld(120_000);
}

/** Boots the client once and returns a ready, in-world session. */
export async function getClient(): Promise<McClient> {
  if (sharedClient) return sharedClient;
  bootstrap ??= (async () => {
    sharedGame = await launchGame({
      headless: config.headless,
      timeoutMs: config.launchTimeoutMs,
      detached: true,
    });
    const mc = new McClient();
    await ensureWorld(mc);
    sharedClient = mc;
    return mc;
  })();
  return bootstrap;
}

/**
 * Stops the game the suite is using, whoever started it.
 *
 * <p>Not called automatically at the end of a run: leaving the client up is what
 * makes re-running a single test take seconds instead of a minute. Stop it
 * explicitly with {@code npm run e2e:stop}.
 */
export async function shutdown(): Promise<void> {
  await stopRunningGame();
  sharedGame = null;
  sharedClient = null;
  bootstrap = null;
}

/**
 * A private cube of world for one test.
 *
 * <p>Tests that build in the same place contaminate each other, and a test that
 * asserts on leftovers from the previous run is worse than no test at all. Each
 * arena is cleared before use and sits on a fresh slab of bedrock-free space.
 */
export class Arena {
  constructor(
    readonly mc: McClient,
    readonly origin: Vec3,
    readonly size: number,
  ) {}

  /** Absolute position from arena-relative offsets. */
  at(dx: number, dy: number, dz: number): Vec3 {
    return { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz };
  }

  get corner(): Vec3 {
    return this.at(this.size - 1, this.size - 1, this.size - 1);
  }

  private get centre(): Vec3 {
    return this.at(Math.floor(this.size / 2), 0, Math.floor(this.size / 2));
  }

  /**
   * Gets the arena ready for a test: player inside it, cleared, floored.
   *
   * <p>Order matters. Block reads are answered from the *client's* copy of the
   * world, and the client only has chunks near the player -- everywhere else
   * reads back as {@code minecraft:void_air} no matter what the server did. So
   * the player has to be moved in and the chunks awaited before anything is
   * filled, or every assertion in the arena inspects a world the client cannot
   * actually see.
   */
  async prepare(): Promise<void> {
    // Creative first: the arena may be carved out of solid rock or open sky,
    // and a suffocating or falling player breaks tests for no useful reason.
    await this.mc.command("/gamemode creative", 500);

    await this.teleportTo(this.centre.x + 0.5, this.origin.y + 2, this.centre.z + 0.5);
    await this.awaitChunks();
    await this.reset();
    await this.enter();
  }

  /** Waits until the client has actually received the arena's chunks. */
  private async awaitChunks(): Promise<void> {
    await waitFor(
      () => this.mc.blockId(this.at(0, -1, 0)),
      (id) => id !== "minecraft:void_air",
      {
        description: "the arena's chunks to reach the client",
        timeoutMs: 30_000,
        intervalMs: 250,
      },
    );
  }

  /** Empties the arena and lays a floor one block below it. */
  async reset(): Promise<void> {
    const a = this.at(0, 0, 0);
    const b = this.corner;
    await this.mc.command(`/fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} air`, 1500);
    await this.mc.command(
      `/fill ${a.x} ${a.y - 1} ${a.z} ${b.x} ${a.y - 1} ${b.z} stone`,
      1500,
    );
    // The fill is applied server-side; wait for the client to see it before a
    // test starts asserting on block state.
    await this.mc.waitForBlock(this.at(0, -1, 0), "minecraft:stone", {
      timeoutMs: 15_000,
      description: "the arena floor to appear",
    });
  }

  /** Teleports the player onto the arena floor, facing +X, and lets them settle. */
  async enter(): Promise<void> {
    const p = this.centre;
    await this.teleportTo(p.x + 0.5, p.y, p.z + 0.5);
    await this.awaitSettled();
  }

  /**
   * Waits until the player has actually come to rest.
   *
   * <p>A teleport is not finished when the position reads back: the server is
   * still reconciling, and movement sent during that window gets corrected away.
   * A test that starts walking immediately measures a fraction of the distance
   * it should and looks flaky for no real reason.
   */
  private async awaitSettled(): Promise<void> {
    let previous: Vec3 | null = null;
    await waitFor(
      async () => {
        const state = await this.mc.state();
        const now = state.player!.position;
        const still =
          previous !== null &&
          Math.abs(now.x - previous.x) < 0.01 &&
          Math.abs(now.y - previous.y) < 0.01 &&
          Math.abs(now.z - previous.z) < 0.01;
        previous = now;
        return { still, onGround: state.player!.onGround };
      },
      (s) => s.still && s.onGround,
      { description: "the player to come to rest", timeoutMs: 15_000, intervalMs: 150 },
    );
  }

  private async teleportTo(x: number, y: number, z: number): Promise<void> {
    await this.mc.command(`/tp @s ${x} ${y} ${z} -90 0`, 1000);
    await waitFor(
      () => this.mc.position(),
      (pos) => Math.hypot(pos.x - x, pos.z - z) < 2,
      { description: `the player to arrive at ${x},${z}`, timeoutMs: 15_000 },
    );
  }

  /** Every non-air block currently in the arena. */
  async contents() {
    return this.mc.scan(this.at(0, 0, 0), this.corner);
  }

  async expectBlock(pos: Vec3, blockId: string): Promise<void> {
    const expected = blockId.includes(":") ? blockId : `minecraft:${blockId}`;
    await this.mc.waitForBlock(pos, expected, {
      timeoutMs: 10_000,
      description: `${expected} at ${pos.x},${pos.y},${pos.z}`,
    });
  }

  async expectAir(pos: Vec3): Promise<void> {
    await this.expectBlock(pos, "minecraft:air");
  }
}

// Arenas are handed out in a row so neighbouring tests never overlap. The slot
// count is bounded and recycled: a long `MCMCP_REPEAT` run would otherwise march
// arenas thousands of blocks from spawn, generating terrain for no reason. Reuse
// is safe because every arena is cleared before it is used.
const ARENA_SLOTS = 16;

// Fixed stride, not derived from a test's own arena size: tests may ask for
// different sizes, and a stride that varied with them would let a large arena
// overlap the slot next door.
const ARENA_STRIDE = 64;

let arenaCounter = 0;

export interface McTestContext {
  mc: McClient;
  arena: Arena;
  /** Saves a PNG into the artifact directory and returns its path. */
  capture(name: string): Promise<string>;
}

export interface McTestOptions {
  /** Per-test timeout. Minecraft is slow; the default is generous. */
  timeoutMs?: number;
  /** Run this test N times. Overrides the global repeat count. */
  repeat?: number;
  skip?: boolean | string;
  /** Arena edge length in blocks. */
  arenaSize?: number;
  /** Skip arena setup for tests that do not build anything. */
  noArena?: boolean;
}

async function capture(mc: McClient, name: string): Promise<string> {
  await mkdir(config.artifactDir, { recursive: true });
  const safe = name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
  const path = join(config.artifactDir, `${safe}.png`);
  await writeFile(path, await mc.screenshotBuffer());
  return path;
}

/**
 * Declares an end-to-end test that runs against a live Minecraft client.
 *
 * <p>Wraps {@code node:test} rather than replacing it, so filtering, reporters,
 * concurrency and CI integration all work as they normally do. What it adds is
 * the parts that are specific to driving a game: a shared client, a world to be
 * in, an isolated arena per test, and a screenshot when something fails.
 */
export function mcTest(
  name: string,
  optionsOrFn: McTestOptions | ((ctx: McTestContext) => Promise<void>),
  maybeFn?: (ctx: McTestContext) => Promise<void>,
): void {
  const options: McTestOptions = typeof optionsOrFn === "function" ? {} : optionsOrFn;
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn!;
  if (!fn) throw new Error(`mcTest("${name}") was given no test function`);

  const repeat = options.repeat ?? config.repeat;

  for (let run = 1; run <= repeat; run++) {
    const label = repeat > 1 ? `${name} [run ${run}/${repeat}]` : name;

    test(label, { skip: options.skip, timeout: options.timeoutMs ?? 300_000 }, async (t: TestContext) => {
      const mc = await getClient();

      const size = options.arenaSize ?? 16;
      const slot = arenaCounter++ % ARENA_SLOTS;
      const arena = new Arena(
        mc,
        {
          // Spread arenas along X so nothing a neighbouring test built is in reach.
          x: config.arenaOrigin.x + slot * ARENA_STRIDE,
          y: config.arenaOrigin.y,
          z: config.arenaOrigin.z,
        },
        size,
      );

      if (!options.noArena) {
        await arena.prepare();
      }

      try {
        await fn({ mc, arena, capture: (n) => capture(mc, n) });
      } catch (err) {
        // A screenshot at the moment of failure is usually the fastest way to
        // see what actually went wrong in a world.
        try {
          const shot = await capture(mc, `FAILED-${label}`);
          t.diagnostic(`failure screenshot: ${shot}`);
        } catch {
          // the client may be gone; the original error matters more
        }
        throw err;
      } finally {
        // Never leave keys held down for the next test.
        await mc.stopInput().catch(() => {});
      }
    });
  }
}

/**
 * Stops the game when the run is interrupted.
 *
 * <p>Only on Ctrl-C: a normal end-of-run deliberately leaves the client up for
 * the next run to attach to.
 */
export function registerShutdown(): void {
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(130));
  });
}

export { sleep as delay };
