# e2e tests

End-to-end tests that drive a real Minecraft 26.2 client through the bridge.
There is no simulation here: every test launches (or attaches to) the game,
joins a world, builds things, and reads the result back out of the world.

## Running

The simplest way is against a singleplayer save — no second process required:

```bash
MCMCP_WORLD=mcmcp-test npm run e2e
```

The save must allow commands; the harness uses `/fill` and `/tp` to prepare
each arena. `bridge-mod/gradlew runClient` once and create one if you have none.

Against a server instead:

```bash
scripts/test-server.sh          # in one terminal: local offline-mode server
npm run e2e                     # in another: build + run the suite
```

`npm run e2e` starts the client headless. To watch it happen:

```bash
npm run e2e:visible
```

The client is **left running between runs on purpose** — re-running one test then
takes seconds instead of a minute, because it attaches to the game that is
already up. When you are done with it:

```bash
npm run e2e:stop
```

Individual files and name filters work as they do with any `node:test` suite:

```bash
cd e2e
node --test tests/movement.test.ts
node --test --test-name-pattern="baritone" 'tests/*.test.ts'
```

## Repeating runs

Flaky behaviour in a game is normal — chunks load late, a path takes a different
route, a mob wanders in. The point of repeating is to find out whether a test is
*reliably* green:

```bash
MCMCP_REPEAT=10 npm run e2e                       # every test, ten times
MCMCP_REPEAT=20 node --test --test-name-pattern="walks to" 'tests/*.test.ts'
```

Each repetition gets its own arena, so runs cannot contaminate each other.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCMCP_HEADLESS` | `1` | run the client with a hidden window |
| `MCMCP_WORLD` | — | singleplayer save to open; takes precedence over the server |
| `MCMCP_SERVER` | `localhost` | server to join when not already in a world |
| `MCMCP_NO_SERVER` | `0` | never join a server; the world is already loaded |
| `MCMCP_REPEAT` | `1` | run every test this many times |
| `MCMCP_ARENA_X/Y/Z` | `512/80/512` | where arenas are carved |
| `MCMCP_ARTIFACTS` | `e2e/artifacts` | where failure screenshots land |
| `MCMCP_LAUNCH_TIMEOUT_MS` | `240000` | how long to wait for the client to boot |

## How the harness works

`@mc-mcp/client/testing` wraps `node:test` rather than replacing it, so
reporters, filtering, and CI integration behave normally. What it adds is the
part that is specific to driving a game:

- **One client for the whole run, detached.** `node:test` isolates every file in
  its own process, so a client owned by one of them would mean a cold start per
  file — and, worse, an attached child process keeps Node's event loop alive, so
  the run would never exit. The game is therefore launched detached: the first
  process that needs it starts it, every later one attaches over the handshake
  file, and stopping it is an explicit step (`npm run e2e:stop`).
- **A world to be in.** If the client is not in one, the harness joins
  `MCMCP_SERVER`, after checking the account is offline — the same gate the
  bridge enforces.
- **An arena per test.** Each test gets its own 16-block cube, cleared and
  floored before use, with the player teleported into it. Arenas are laid out in
  a row so nothing a previous test built is ever in reach. Without this, tests
  that build in the same place quietly assert on each other's leftovers.
- **A screenshot on failure**, written to `e2e/artifacts/`. For a failure in a
  3D world this is usually faster to read than any assertion message.
- **Held keys released** after every test, so a stuck input cannot leak into the
  next one.

Tests are declared with `mcTest`, which hands over a client and an arena:

```ts
import { mcTest, assert } from "@mc-mcp/client/testing";

mcTest("places a block", async ({ mc, arena }) => {
  await mc.hold("minecraft:stone");
  await mc.useOnBlock(arena.at(3, -1, 3), { face: "up" });
  await arena.expectBlock(arena.at(3, 0, 3), "minecraft:stone");
});
```

`{ noArena: true }` skips the arena for tests that do not build anything.

## Waiting, not sleeping

Almost nothing in Minecraft is synchronous with respect to a caller: the server
acknowledges a block change a tick later, chunks stream in, a path finishes when
it finishes. Asserting immediately after acting is flaky by construction.

Use the waiting helpers instead of `sleep`:

```ts
await arena.expectBlock(pos, "minecraft:glass");   // polls until it matches
await mc.waitUntilNear({ x, z }, 3);
await mc.waitForState((s) => s.player!.onGround);
await waitFor(() => mc.entities(), (list) => list.length > 0, { description: "a mob to spawn" });
```

Each throws a `WaitTimeoutError` naming what it was waiting for and what it last
saw, so a timeout says something useful.

## What is covered

`basics`, `building`, `movement`, `entities`, `interaction`, `inventory`,
`screens`, `worldedit`, `datapack`, `mcp`, and `server`.

That last one matters more than it sounds: every other file talks to the bridge
directly, which leaves the layer an agent actually uses — tool names, argument
names, schema validation, the shape of the reply — covered by nothing.
`mcp.test.ts` speaks real MCP over stdio to the real server binary, so a wrapper
that renames an argument fails there rather than in production.

`server.test.ts` is the only file that covers multiplayer — joining, the host
gate on a live session, and getting back out. It needs a second process, so it
is opt-in:

```bash
scripts/test-server.sh                 # terminal 1
MCMCP_SERVER_TEST=1 npm run e2e        # terminal 2
```

Without the flag it reports as skipped with that reason, rather than quietly
passing.

## Writing tests that stay honest

Two rules earned the hard way in this project:

- **Do not skip silently when a dependency is missing.** The Baritone and
  WorldEdit tests fail loudly if those mods are absent. A suite that goes green
  without ever exercising pathfinding is worse than no suite.
- **Assert on the failure paths too.** `basics.test.ts` asserts that connecting
  to a public host is *refused*, and `movement.test.ts` asserts that an
  unfinishable path is reported as an error rather than a false arrival. Those
  are the behaviours most likely to rot unnoticed.
