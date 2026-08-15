# mc-mcp

An MCP server that lets an AI agent play **Minecraft 26.2** as a real player —
walking, mining, placing, using items, managing inventory, running commands,
driving WorldEdit and Baritone, answering server dialogs, and *looking at the
screen* to check its own work.

> **26.2 is not 1.26.2.** Mojang moved to year-based versioning in 2026:
> `26.1` (Tiny Takeover, March 2026) was the first, `26.2` (Chaos Cubed, June
> 2026) is the second drop of 2026. It requires **Java 25**, and from 26.1
> onwards Minecraft Java ships **unobfuscated**, so mods compile against
> Mojang's own names with no Yarn or Intermediary mappings involved.

## How it works

```
  ┌──────────────┐   stdio    ┌──────────────┐   HTTP/loopback   ┌─────────────────────┐
  │  AI agent    │ ─────────▶ │  MCP server  │ ────────────────▶ │  Minecraft 26.2     │
  │  (Claude)    │            │  (TypeScript)│   127.0.0.1 only  │  + mcmcp-bridge mod │
  └──────────────┘            └──────────────┘                   │  + Baritone         │
                                                                 │  + WorldEdit        │
                                                                 └─────────────────────┘
```

The agent drives a **real Minecraft client**, not a headless protocol bot. That
choice is forced by the requirements and is the whole design:

- **Baritone** is a client mod. It only exists inside a running client.
- **WorldEdit** likewise runs in the client (Fabric build).
- **Screenshots** need something that actually renders.
- **`mineflayer` does not support the 26.2 protocol**, so a protocol-level bot
  was not an option even if the above were not true.

Actions are expressed as real input wherever possible. Movement sets the same
`KeyMapping` down-states a held key produces, so the client's own input pipeline
generates the movement packets — the server sees a player, not a teleporting
script.

## Requirements

- macOS or Linux
- **Java 25** (`brew install openjdk@25`)
- Node.js 20+

## Setup

```bash
scripts/setup.sh
```

That installs/builds everything: the bridge mod, Baritone (built from
`cabaletta/baritone`'s official `26.2` branch), WorldEdit (latest Fabric build
for 26.2 from Modrinth), and the MCP server.

Then register the MCP server with your client:

```json
{
  "mcpServers": {
    "mc-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/mc-mcp/mcp-server/dist/index.js"]
    }
  }
}
```

### A world to play in

```bash
scripts/test-server.sh     # local offline-mode server on 127.0.0.1:25565
```

Then from the agent: `mc_launch` → `mc_connect address:"localhost"`. Op the
agent in the server console (`op <name>`; `mc_session` reports the name, which
the dev client randomises per launch) so it can use commands and WorldEdit.

Singleplayer works too — `mc_launch` → `mc_worlds` → `mc_open_world id:"..."`,
which loads a save directly. The title screen can still be driven by hand with
`mc_screen` / `mc_screen_click` if you want the world-creation flow.

### The window is not in the way

Two things make an unattended run reproducible, both applied on every launch:

- **`pauseOnLostFocus` is forced off.** The agent drives the game from another
  process, so the window is almost never focused; with the vanilla default the
  client opens the pause menu the moment it loses focus and a singleplayer world
  *stops ticking* — Baritone would never take a step.
- **Real keyboard and mouse input is ignored** (`mc_input_lock`, on by default),
  so a stray click or keypress cannot turn the camera or cancel a path. Bridge
  actions are unaffected, and the window can still be moved and closed.
- **Your IME keeps working.** Minecraft turns the IME off whenever you are not
  typing into a text field, so that letter keys reach the movement controls. On
  macOS that is not per-window: GLFW implements it by selecting a Roman input
  source, which changes the input source *system-wide*, and
  `TextInputManager.tick()` re-applies it every client tick. While an
  agent-driven client runs, that makes it impossible to type Korean, Japanese or
  Chinese anywhere on the machine — the language key switches back for one tick
  before the game overrides it again. Neither focus nor headless avoids it: the
  tick runs regardless. The bridge therefore suppresses the change whenever
  input is locked, on the principle that a client already ignoring your keyboard
  has no business touching your input source. Unlock input to play by hand and
  vanilla IME handling returns with it; `-Dmcmcp.imeGuard=false` disables the
  guard outright.
- **The window never steals focus.** It is mapped unfocused, so launching the
  game does not take the keyboard away from whatever you are typing in. This
  matters most with an IME: on macOS, a newly activated app switches the system
  input source, which drops a half-composed Korean/Japanese/Chinese word in the
  app you were actually using. Click the window to bring it forward, or pass
  `-Dmcmcp.focusOnLaunch=true` for vanilla behaviour. The JVM also runs with
  `java.awt.headless=true` and `apple.awt.UIElement=true` so AWT never registers
  an input context of its own.

## Safety model

This project can move a player, run commands, and edit worlds. Three things
constrain it:

1. **The control API is loopback-only.** The mod binds `127.0.0.1` and requires
   a bearer token generated per install, handed to the MCP server through
   `~/.mcmcp/bridge.json`. Nothing on the network can reach it.

2. **Servers are restricted to test targets.** `mc_connect` refuses any address
   that does not resolve to a loopback or private (RFC1918) address, unless you
   list it explicitly in `extraAllowedHosts` in the mod config.

3. **The account must be offline.** The bridge checks that the running profile
   is an offline account — recognised by the standard `OfflinePlayer:<name>`
   v3-UUID rule — which by construction cannot authenticate against an
   online-mode server. Configurable via `requireOfflineAccount`, on by default.

Config lives at `bridge-mod/run/config/mcmcp-bridge.json` for the dev runtime.

**The test server runs in offline mode. Keep it on localhost.** Offline mode
means anyone who can reach it can join as anyone.

## Headless

```
mc_launch headless:true
```

The window is created hidden (`GLFW_VISIBLE=false`) rather than not created at
all, so rendering — and therefore `mc_screenshot` — keeps working. A truly
render-less client could not satisfy the "look at what you built" half of this
project.

On Linux/Docker, `xvfb-run` is the more thorough option and works the same way
from the bridge's point of view.

Audio is muted on every launch (all sound categories set to 0 in
`run/options.txt`) so an agent-driven client is never noisy.

## Tools

| Tool | What it does |
| --- | --- |
| `mc_launch` / `mc_quit` | start/stop the game (`headless` optional) |
| `mc_session` / `mc_connect` / `mc_disconnect` | account info, join/leave a test server |
| `mc_worlds` / `mc_open_world` | list saved singleplayer worlds, load one directly |
| `mc_input_lock` | ignore (or re-accept) real keyboard/mouse input to the window |
| `mc_state` | position, health, held item, crosshair target, open screen |
| `mc_screenshot` | see the game as an image |
| `mc_get_block` / `mc_scan_blocks` / `mc_entities` | precise world reads |
| `mc_move` / `mc_stop` / `mc_look` | hold keys, aim the camera |
| `mc_goto` | walk to coordinates via Baritone, with real arrival detection |
| `mc_baritone` | any Baritone command: mine, follow, farm, build |
| `mc_break_block` / `mc_use_block` / `mc_use_item` | mine, place, open, activate |
| `mc_attack_entity` / `mc_interact_entity` | fight, trade, ride, shear |
| `mc_inventory` / `mc_open_inventory` | read inventory, hold items, click container slots |
| `mc_command` / `mc_command_syntax` | run commands, and look up their **real** syntax |
| `mc_worldedit` | WorldEdit operations |
| `mc_chat` | send/read chat and command output |
| `mc_screen` / `mc_screen_click` / `mc_screen_input` | read and drive any GUI, including `/dialog` |
| `mc_raw` | escape hatch to any bridge action |

### Two things worth knowing

**`mc_command_syntax` is the antidote to stale knowledge.** It reads the
brigadier command tree the connected server actually sent, so it reports the
true syntax for this server — including 26.2's newer commands (`/dialog`,
`/waypoint`, `/rotate`, `/transfer`, `/stopwatch`), datapack functions, and
WorldEdit. Use it instead of recalling 1.21-era syntax. The
`skills/mc-commands-26.2` skill covers the same ground offline.

**Dialogs are just screens.** 26.x's `/dialog` opens an ordinary `Screen` whose
buttons and inputs are plain widgets, so `mc_screen` enumerates them and
`mc_screen_click` / `mc_screen_input` drive them with real mouse and key events.
The same tools therefore work for inventories, signs, and modded GUIs.

## Scripting it, without an agent

Everything the tools do is also available as a plain Node module, so scripts and
tests drive the game through exactly the same path an agent does:

```ts
import { connect, launchGame } from "@mc-mcp/client";

await launchGame({ headless: true });     // reuses a running client if there is one
const mc = await connect();

await mc.goto({ x: 100, z: 200 });        // walks there via Baritone, confirms arrival
await mc.hold("minecraft:stone");
await mc.useOnBlock({ x: 100, y: 63, z: 200 }, { face: "up" });
await mc.waitForBlock({ x: 100, y: 64, z: 200 }, "minecraft:stone");

await writeFile("shot.png", await mc.screenshotBuffer());
```

## Tests

```bash
scripts/test-server.sh     # terminal 1: local offline-mode server
npm run e2e                # terminal 2: build and run the suite
```

Or against a singleplayer save, with no second process:
`MCMCP_WORLD=<save-name> npm run e2e`.

The suite drives a real client — it builds things and reads them back out of the
world. `MCMCP_REPEAT=10 npm run e2e` runs everything ten times, which is how you
find out whether something is reliably green rather than green once. The client
is left running between runs so re-running one test is fast; `npm run e2e:stop`
shuts it down. See [e2e/README.md](e2e/README.md).

## Layout

```
bridge-mod/       Fabric mod (Java 25) — the in-game control API
packages/client/  @mc-mcp/client — typed Node client and the e2e harness
mcp-server/       MCP server (TypeScript) — tool definitions and the launcher
e2e/              end-to-end tests that drive a real client
baritone/         Baritone source, built from upstream's 26.2 branch
skills/           mc-commands-26.2 — command reference for 26.2
scripts/          setup.sh, test-server.sh, mcapi.sh
```

`scripts/mcapi.sh` is a development aid: because 26.2 is unobfuscated, it can
list and disassemble the real Minecraft classes, which is how this mod was
written against the actual API rather than guessed at.

```bash
scripts/mcapi.sh find 'dialog'                        # list matching classes
scripts/mcapi.sh sig net/minecraft/client/Minecraft   # show its signatures
```

## Limitations

- **macOS + headless:** the window is hidden, not absent. macOS can throttle
  rendering for occluded windows; if frame capture stalls in headless mode,
  run with a visible window or use a Linux/Xvfb host.
- **Day-time reads:** 26.2 dropped the client-side day-time accessor.
  `mc_state` reports `gameTime`; use `/time query time` for the rest. (Not
  `daytime` — 26.2 replaced that with named timelines, and `daytime` is not one
  of them.)
- **Baritone completion** requires the `api` flavour jar. The `standalone`
  build is ProGuard-obfuscated (`getProvider()` becomes `a()`), so the bridge
  cannot read pathing state from it. `setup.sh` installs the right one.
