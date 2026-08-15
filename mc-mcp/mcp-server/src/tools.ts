import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bridge } from "./bridge.js";
import { guard, json, summary } from "./format.js";
import { launchGame, stopGame, gameStatus } from "./launcher.js";

/** Shorthand for the very common x/y/z triple. */
const xyz = {
  x: z.number().describe("block X"),
  y: z.number().describe("block Y"),
  z: z.number().describe("block Z"),
};

export function registerTools(server: McpServer): void {
  // ---------------------------------------------------------------- session

  server.registerTool(
    "mc_launch",
    {
      title: "Launch Minecraft",
      description:
        "Starts the Minecraft 26.2 client with the bridge mod so the other tools have something to " +
        "drive. Use headless:true to run without a visible window (rendering, and therefore " +
        "mc_screenshot, still works). If the game is already running this reports that instead of " +
        "starting a second copy.",
      inputSchema: {
        headless: z
          .boolean()
          .optional()
          .describe("run with a hidden window (default false)"),
        waitForBridge: z
          .boolean()
          .optional()
          .describe("block until the bridge answers, default true"),
        timeoutMs: z.number().optional().describe("how long to wait for startup, default 180000"),
      },
    },
    guard(async ({ headless, waitForBridge, timeoutMs }) =>
      json(await launchGame({ headless, waitForBridge, timeoutMs })),
    ),
  );

  server.registerTool(
    "mc_quit",
    {
      title: "Quit Minecraft",
      description: "Stops the Minecraft process that mc_launch started.",
      inputSchema: {},
    },
    guard(async () => json(await stopGame())),
  );

  server.registerTool(
    "mc_session",
    {
      title: "Session and connection policy",
      description:
        "Reports the logged-in account, whether it is an offline account, and the host allowlist " +
        "policy that governs which servers may be joined. Check this first when a connection is refused.",
      inputSchema: {},
    },
    guard(async () => json({ process: gameStatus(), ...(await bridge.call("get_session")) })),
  );

  server.registerTool(
    "mc_connect",
    {
      title: "Join a server",
      description:
        "Joins a multiplayer server. Restricted to test servers on purpose: the target must resolve " +
        "to a loopback or private address (or be allowlisted in the mod config), and the client must " +
        "be signed in with an offline account. Waits for the join to finish by default and reports " +
        "the server's own reason if it fails, so a refusal is never mistaken for a success.",
      inputSchema: {
        address: z
          .string()
          .describe("host or host:port, e.g. 'localhost' or '127.0.0.1:25565'"),
        name: z.string().optional().describe("label shown in the server list"),
        wait: z
          .boolean()
          .optional()
          .describe("block until in the world or the join fails, default true"),
        timeoutMs: z.number().optional().describe("how long to wait, default 60000"),
      },
    },
    guard(async (args) => json(await bridge.call("connect_server", args))),
  );

  server.registerTool(
    "mc_worlds",
    {
      title: "List singleplayer worlds",
      description:
        "Lists the saved singleplayer worlds, with the id that mc_open_world takes. The id is the " +
        "save folder name, which is not always the display name.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("list_worlds"))),
  );

  server.registerTool(
    "mc_open_world",
    {
      title: "Open a singleplayer world",
      description:
        "Loads a saved singleplayer world straight away, without driving the title screen. This is " +
        "the singleplayer counterpart to mc_connect - prefer it over clicking through " +
        "Singleplayer -> world list. Waits until the world is actually loaded. Call mc_worlds for ids.",
      inputSchema: {
        id: z.string().describe("save folder name, from mc_worlds"),
        leaveCurrent: z
          .boolean()
          .optional()
          .describe("leave the current world/server first, default false (otherwise this errors)"),
        confirm: z
          .boolean()
          .optional()
          .describe(
            "answer a loading confirmation (experimental settings, version warning) by proceeding " +
              "without a backup; without this such a prompt is reported so you can decide",
          ),
        timeoutMs: z.number().optional().describe("how long to wait for the load, default 120000"),
      },
    },
    guard(async (args) => json(await bridge.call("open_world", args))),
  );

  server.registerTool(
    "mc_input_lock",
    {
      title: "Lock out human input",
      description:
        "Controls whether real keyboard and mouse input to the game window reaches the game. On by " +
        "default, so a stray click or keypress on the desktop cannot turn the camera or cancel a " +
        "path mid-run. Bridge actions are never affected, and the window can still be moved and " +
        "closed. Call with no argument to read the current setting; pass locked:false to hand " +
        "control back to a human.",
      inputSchema: {
        locked: z.boolean().optional().describe("omit to just report the current setting"),
      },
    },
    guard(async (args) => json(await bridge.call("set_input_lock", args))),
  );

  server.registerTool(
    "mc_disconnect",
    {
      title: "Leave the current server or world",
      description: "Disconnects from the current server or closes the current world.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("disconnect"))),
  );

  // ------------------------------------------------------------ observation

  server.registerTool(
    "mc_state",
    {
      title: "Read game state",
      description:
        "The main sensor: player position, rotation, health, food, game mode, held item, the block " +
        "or entity under the crosshair, the dimension, and which screen (if any) is open. Call this " +
        "before and after acting to confirm what actually happened.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("get_state"))),
  );

  server.registerTool(
    "mc_screenshot",
    {
      title: "See the game",
      description:
        "Captures what the client is rendering right now and returns it as an image. This is how you " +
        "visually check a build, read a GUI, or confirm where you are. Works in headless mode too.",
      inputSchema: {},
    },
    guard(async () => {
      const res = await bridge.call("screenshot", {}, 30_000);
      return {
        content: [
          { type: "image" as const, data: res.data as string, mimeType: "image/png" },
          {
            type: "text" as const,
            text: `${res.width}x${res.height} PNG, ${res.bytes} bytes`,
          },
        ],
      };
    }),
  );

  server.registerTool(
    "mc_get_block",
    {
      title: "Read one block",
      description: "Returns the block id and blockstate at a single coordinate.",
      inputSchema: xyz,
    },
    guard(async (args) => json(await bridge.call("get_block", args))),
  );

  server.registerTool(
    "mc_scan_blocks",
    {
      title: "Read a region of blocks",
      description:
        "Bulk block read over a box, returning a per-block-type count plus the individual non-air " +
        "blocks. Use this to verify a build precisely - it is exact where a screenshot is not. " +
        "Air is omitted unless includeAir is set, and the region is capped at 1,000,000 blocks.",
      inputSchema: {
        x1: z.number(),
        y1: z.number(),
        z1: z.number(),
        x2: z.number(),
        y2: z.number(),
        z2: z.number(),
        includeAir: z.boolean().optional().describe("include air blocks, default false"),
        limit: z.number().optional().describe("max individual blocks returned, default 20000"),
      },
    },
    guard(async (args) => json(await bridge.call("scan_blocks", args, 60_000))),
  );

  server.registerTool(
    "mc_entities",
    {
      title: "List nearby entities",
      description:
        "Entities around the player with their ids, types, positions and health. The numeric id is " +
        "what mc_attack_entity and mc_interact_entity take.",
      inputSchema: {
        radius: z.number().optional().describe("search radius in blocks, default 16"),
        limit: z.number().optional().describe("max entities returned, default 64"),
      },
    },
    guard(async (args) => json(await bridge.call("get_entities", args))),
  );

  server.registerTool(
    "mc_mods",
    {
      title: "List installed mods",
      description:
        "Which mods are loaded, and specifically whether Baritone and WorldEdit are available. " +
        "Check this before relying on mc_goto or mc_worldedit.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("get_mods"))),
  );

  // -------------------------------------------------------------- movement

  server.registerTool(
    "mc_move",
    {
      title: "Hold movement keys",
      description:
        "Presses or releases movement keys exactly as a player would hold them, producing normal " +
        "movement packets. Keys stay held until released or until durationMs elapses. For getting " +
        "to a distant coordinate prefer mc_goto, which pathfinds around obstacles; use this for " +
        "short, deliberate adjustments.",
      inputSchema: {
        forward: z.boolean().optional(),
        backward: z.boolean().optional(),
        left: z.boolean().optional(),
        right: z.boolean().optional(),
        jump: z.boolean().optional(),
        sneak: z.boolean().optional(),
        sprint: z.boolean().optional(),
        attack: z.boolean().optional().describe("hold the attack button (mines what you look at)"),
        use: z.boolean().optional().describe("hold the use button"),
        durationMs: z
          .number()
          .optional()
          .describe("auto-release after this long; omit to hold indefinitely"),
      },
    },
    guard(async (args) => json(await bridge.call("set_input", args))),
  );

  server.registerTool(
    "mc_stop",
    {
      title: "Release all inputs",
      description: "Releases every held key and cancels any in-progress camera turn.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("stop_input"))),
  );

  server.registerTool(
    "mc_look",
    {
      title: "Aim the camera",
      description:
        "Turns the camera, either to explicit yaw/pitch angles or towards a world position. The turn " +
        "is spread over several ticks so it sweeps rather than snapping.",
      inputSchema: {
        yaw: z.number().optional().describe("absolute yaw in degrees; omit to keep the current one"),
        pitch: z
          .number()
          .optional()
          .describe("absolute pitch, -90 (up) to 90 (down); omit to keep the current one"),
        x: z.number().optional().describe("look at this position instead"),
        y: z.number().optional(),
        z: z.number().optional(),
        ticks: z.number().optional().describe("how many ticks to spread the turn over, default 4"),
      },
    },
    guard(async (args) => {
      const hasTarget = args.x !== undefined && args.y !== undefined && args.z !== undefined;
      if (hasTarget) return json(await bridge.call("look_at", args));
      if (args.yaw === undefined && args.pitch === undefined) {
        throw new Error("pass yaw, pitch, or a full x/y/z target");
      }
      return json(await bridge.call("look", args));
    }),
  );

  server.registerTool(
    "mc_goto",
    {
      title: "Walk to coordinates (Baritone)",
      description:
        "Pathfinds and physically walks to a destination using Baritone, handling terrain, jumps and " +
        "obstacles. This is the right tool for 'go to X,Y,Z'. By default it blocks until the player " +
        "arrives and reports whether the goal was actually reached - a failed path is reported as an " +
        "error rather than silently returning. Omit y (goal:'xz') when the height does not matter; " +
        "that pathfinds far more reliably.",
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        goal: z
          .enum(["block", "near", "xz", "y"])
          .optional()
          .describe("block = exact position (default), near = within range, xz = any height, y = a Y level"),
        range: z.number().optional().describe("for goal:'near', how close is close enough"),
        wait: z.boolean().optional().describe("block until arrival, default true"),
        timeoutMs: z.number().optional().describe("give up after this long, default 300000"),
      },
    },
    guard(async (args) => {
      const goal = args.goal ?? (args.y === undefined ? "xz" : "block");
      const timeout = (args.timeoutMs ?? 300_000) + 30_000;
      return json(await bridge.call("baritone_goto", { ...args, goal }, timeout));
    }),
  );

  server.registerTool(
    "mc_baritone",
    {
      title: "Baritone command or status",
      description:
        "Runs an arbitrary Baritone command (without the '#' prefix), or reads its pathing status. " +
        "Covers everything beyond plain navigation: 'mine diamond_ore', 'follow player Steve', " +
        "'farm', 'explore', 'sel'/'build' for schematics, and settings like 'set allowBreak false'. " + "Baritone's replies come back in the messages.",
      inputSchema: {
        command: z
          .string()
          .optional()
          .describe("e.g. 'mine 12 diamond_ore'; omit to just read status"),
        stop: z.boolean().optional().describe("cancel whatever Baritone is doing"),
        wait: z
          .boolean()
          .optional()
          .describe("block until Baritone finishes what it is doing, and report whether it arrived"),
        timeoutMs: z.number().optional().describe("for wait, default 300000"),
        waitMs: z.number().optional(),
      },
    },
    guard(async ({ command, stop, wait, waitMs, timeoutMs }) => {
      if (stop) return json(await bridge.call("baritone_stop"));
      if (command) return json(await bridge.call("baritone_command", { command, waitMs }));
      if (wait) {
        const limit = timeoutMs ?? 300_000;
        return json(await bridge.call("baritone_wait", { timeoutMs: limit }, limit + 30_000));
      }
      return json(await bridge.call("baritone_status"));
    }),
  );

  // ----------------------------------------------------------- interaction

  server.registerTool(
    "mc_break_block",
    {
      title: "Mine a block",
      description:
        "Looks at the block and mines it the way a player does - holding attack until it breaks - " +
        "so mining speed, tool and hardness all apply. Blocks until the block is gone or the timeout " +
        "passes. Needs the block to be within reach; use mc_goto first if it is not.",
      inputSchema: {
        ...xyz,
        timeoutMs: z.number().optional().describe("give up after this long, default 15000"),
      },
    },
    guard(async (args) =>
      json(await bridge.call("break_block", args, (args.timeoutMs ?? 15_000) + 10_000)),
    ),
  );

  server.registerTool(
    "mc_use_block",
    {
      title: "Right-click a block (place, open, activate)",
      description:
        "Aims at the given block face and uses the held item on it. This one action covers placing a " +
        "block (the new block appears against the given face), opening a chest or door, activating a " +
        "lever, and feeding items into a container. Select what you want to place with mc_inventory " +
        "first.",
      inputSchema: {
        ...xyz,
        face: z
          .enum(["up", "down", "north", "south", "east", "west"])
          .optional()
          .describe("which face to click; a placed block appears on this side, default 'up'"),
        hand: z.enum(["main", "off"]).optional(),
      },
    },
    guard(async (args) => json(await bridge.call("use_on_block", args))),
  );

  server.registerTool(
    "mc_use_item",
    {
      title: "Right-click with the held item",
      description:
        "Uses the held item with nothing targeted: eating, drinking, throwing an ender pearl, " +
        "shooting a bow, opening a written book.",
      inputSchema: { hand: z.enum(["main", "off"]).optional() },
    },
    guard(async (args) => json(await bridge.call("use_item", args))),
  );

  server.registerTool(
    "mc_pick_block",
    {
      title: "Put a block you can see into your hand",
      description:
        "Middle-click a block: puts a copy of it in the hotbar in creative, or switches to it if you " +
        "already carry one. The fastest way to get the right block in hand before building, and it " +
        "works from what is in the world rather than from an item id you have to know.",
      inputSchema: {
        ...xyz,
        withData: z
          .boolean()
          .optional()
          .describe("copy the block's data too, e.g. a chest's contents (creative only)"),
      },
    },
    guard(async (args) => json(await bridge.call("pick_block", args))),
  );

  server.registerTool(
    "mc_attack_entity",
    {
      title: "Attack an entity",
      description: "Faces and hits an entity. Take the numeric id from mc_entities.",
      inputSchema: { entityId: z.number().describe("numeric id from mc_entities") },
    },
    guard(async (args) => json(await bridge.call("attack_entity", args))),
  );

  server.registerTool(
    "mc_interact_entity",
    {
      title: "Right-click an entity",
      description:
        "Faces and right-clicks an entity: trading with a villager, mounting a horse, shearing a " +
        "sheep, opening a chest minecart.",
      inputSchema: {
        entityId: z.number().describe("numeric id from mc_entities"),
        hand: z.enum(["main", "off"]).optional(),
      },
    },
    guard(async (args) => json(await bridge.call("interact_entity", args))),
  );

  // ------------------------------------------------------------- inventory

  server.registerTool(
    "mc_inventory",
    {
      title: "Inventory and hotbar",
      description:
        "Reads the inventory, or changes it. With no arguments it lists everything the player is " +
        "carrying plus any open container. Pass selectItem to put an item in hand by id (moving it " +
        "to the hotbar if needed) - that is what you want before placing blocks. Pass slot to select " +
        "a hotbar index directly, clickSlot to manipulate an open container, or drop to throw the " +
        "held item.",
      inputSchema: {
        selectItem: z
          .string()
          .optional()
          .describe("item id to hold, e.g. 'stone' or 'minecraft:oak_planks'"),
        slot: z.number().optional().describe("hotbar slot 0-8 to select"),
        clickSlot: z.number().optional().describe("slot index in the open container to click"),
        clickType: z
          .enum(["PICKUP", "QUICK_MOVE", "SWAP", "CLONE", "THROW", "QUICK_CRAFT", "PICKUP_ALL"])
          .optional()
          .describe("PICKUP = normal click, QUICK_MOVE = shift-click"),
        button: z.number().optional().describe("0 = left, 1 = right"),
        drop: z.boolean().optional().describe("drop the held item"),
        dropWholeStack: z.boolean().optional(),
        swapOffhand: z.boolean().optional(),
      },
    },
    guard(async (args) => {
      if (args.selectItem) return json(await bridge.call("select_item", { id: args.selectItem }));
      if (args.slot !== undefined) return json(await bridge.call("select_slot", { slot: args.slot }));
      if (args.clickSlot !== undefined) {
        return json(
          await bridge.call("click_slot", {
            slot: args.clickSlot,
            type: args.clickType,
            button: args.button,
          }),
        );
      }
      if (args.drop) {
        return json(await bridge.call("drop_item", { wholeStack: args.dropWholeStack }));
      }
      if (args.swapOffhand) return json(await bridge.call("swap_offhand"));
      return json(await bridge.call("get_inventory"));
    }),
  );

  // -------------------------------------------------------------- commands

  server.registerTool(
    "mc_command",
    {
      title: "Run a Minecraft command",
      description:
        "Sends a slash command as the player and returns the chat output it produced. Requires the " +
        "usual permissions (op or a creative/cheats world). Note this is 26.2: the command set " +
        "includes newer commands like /dialog, /waypoint, /rotate, /transfer and /test. If unsure " +
        "of the syntax, consult the mc-commands-26.2 skill rather than guessing at older syntax.",
      inputSchema: {
        command: z.string().describe("with or without the leading slash, e.g. '/time set day'"),
        waitMs: z.number().optional().describe("how long to collect output, default 700"),
      },
    },
    guard(async (args) => json(await bridge.call("send_command", args))),
  );

  server.registerTool(
    "mc_command_syntax",
    {
      title: "Look up real command syntax",
      description:
        "Returns the exact usage lines for a command, read from the command tree the connected " +
        "server actually sent. Use this instead of relying on remembered syntax: this is 26.2, where " +
        "several commands are new or changed since 1.21, and the answer here also covers datapack " +
        "functions, WorldEdit and any other mod's commands on this particular server. Call with no " +
        "arguments to list every command the server offers.",
      inputSchema: {
        command: z
          .string()
          .optional()
          .describe("command name, e.g. 'dialog'; omit to list all command names"),
      },
    },
    guard(async (args) => json(await bridge.call("get_command_syntax", args))),
  );

  server.registerTool(
    "mc_worldedit",
    {
      title: "Run a WorldEdit command",
      description:
        "Runs a WorldEdit command for bulk building. Pass it as you would type it, including the " +
        "double slash where WorldEdit uses one: '//set stone', '//pos1', '//sphere glass 10', " +
        "'//copy', '//paste'. Selection commands (//pos1, //pos2) act on the player's position, so " +
        "move there first, or use //pos1 x,y,z form. Verify results with mc_scan_blocks.",
      inputSchema: {
        command: z.string().describe("e.g. '//set minecraft:stone'"),
        waitMs: z.number().optional().describe("default 2000, raise for large operations"),
      },
    },
    guard(async ({ command, waitMs }) => {
      const mods = await bridge.call("get_mods");
      if (!mods.hasWorldEdit) {
        throw new Error(
          "WorldEdit is not installed in this instance. Install the Fabric build of WorldEdit " +
            "(7.4.5 or newer supports 26.2) into the mods folder and relaunch.",
        );
      }
      return json(await bridge.call("send_command", { command, waitMs: waitMs ?? 2000 }));
    }),
  );

  server.registerTool(
    "mc_chat",
    {
      title: "Chat: send or read",
      description:
        "Sends a chat message, or reads recent chat and system output. Command feedback, WorldEdit " +
        "results and Baritone progress all arrive here. Pass since (a cursor from an earlier call) " +
        "to read only what is new.",
      inputSchema: {
        message: z.string().optional().describe("send this message; omit to only read"),
        since: z.number().optional().describe("return messages with seq >= this"),
        limit: z.number().optional(),
        waitMs: z.number().optional().describe("wait up to this long for new messages"),
      },
    },
    guard(async ({ message, since, limit, waitMs }) => {
      if (message) return json(await bridge.call("send_chat", { message, waitMs, limit }));
      return json(await bridge.call("read_chat", { since, limit, waitMs }));
    }),
  );

  // --------------------------------------------------- screens and dialogs

  server.registerTool(
    "mc_screen",
    {
      title: "Inspect the open screen or dialog",
      description:
        "Lists the widgets on whatever screen is open, with their labels, indices and current values. " +
        "This is how you read a server dialog created by /dialog (isDialog will be true), but it works " +
        "for any GUI: inventories, sign editing, the pause menu, modded screens. Use mc_screen_click " +
        "and mc_screen_input to act on what you find here.",
      inputSchema: {
        waitFor: z
          .string()
          .optional()
          .describe("wait until a screen whose class name contains this appears"),
        timeoutMs: z.number().optional(),
      },
    },
    guard(async ({ waitFor, timeoutMs }) => {
      if (waitFor) {
        await bridge.call("wait_for_screen", { classContains: waitFor, timeoutMs });
      }
      return json(await bridge.call("get_screen"));
    }),
  );

  server.registerTool(
    "mc_screen_click",
    {
      title: "Click a widget or press a key on a screen",
      description:
        "Clicks a button on the open screen by label or index - this is how you answer a /dialog - " +
        "or sends a key such as enter or escape. Dispatches a real mouse event at the widget, so " +
        "confirmation flows and multi-step dialogs behave normally. Also clicks rows of scrolling " +
        "lists (worlds, servers, resource packs); those usually select on a single click and need " +
        "doubleClick to activate. Call mc_screen first to see what is available.",
      inputSchema: {
        label: z.string().optional().describe("button or row text, matched case-insensitively"),
        index: z.number().optional().describe("widget index from mc_screen"),
        doubleClick: z
          .boolean()
          .optional()
          .describe("double-click, e.g. to load a world from the world list"),
        key: z
          .enum(["enter", "escape", "tab", "backspace", "delete", "up", "down", "left", "right", "space"])
          .optional()
          .describe("press this key instead of clicking"),
        close: z.boolean().optional().describe("close the screen"),
      },
    },
    guard(async ({ label, index, key, close, doubleClick }) => {
      if (close) return json(await bridge.call("close_screen"));
      if (key) return json(await bridge.call("press_key", { key }));
      if (label === undefined && index === undefined) {
        throw new Error("pass a label, an index, a key, or close:true");
      }
      return json(await bridge.call("click_widget", { label, index, doubleClick }));
    }),
  );

  server.registerTool(
    "mc_screen_input",
    {
      title: "Type into a screen text field",
      description:
        "Sets the value of a text input on the open screen - a dialog's text field, a sign line, an " +
        "anvil rename box. Identify the field by index or label from mc_screen.",
      inputSchema: {
        text: z.string().describe("the value to set"),
        index: z.number().optional().describe("widget index from mc_screen"),
        label: z.string().optional(),
      },
    },
    guard(async (args) => json(await bridge.call("set_widget_text", args))),
  );

  server.registerTool(
    "mc_open_inventory",
    {
      title: "Open the player inventory screen",
      description:
        "Opens the inventory GUI, which is what you need before crafting in the 2x2 grid or using " +
        "mc_inventory's clickSlot on your own slots.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("open_inventory"))),
  );

  // --------------------------------------------------- datapacks and packs

  server.registerTool(
    "mc_paths",
    {
      title: "Where things live, and this build's pack formats",
      description:
        "Reports the game directory, the resourcepacks folder, and the current world's datapacks " +
        "folder, plus the pack_format this exact build expects for data and resource packs. Start " +
        "here before writing a pack: 26.2 uses a major/minor pack_format pair, so a number recalled " +
        "from a 1.21-era tutorial produces a pack the game silently ignores.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("get_paths"))),
  );

  server.registerTool(
    "mc_datapack_create",
    {
      title: "Create a datapack",
      description:
        "Creates a datapack folder in the current world with a correct pack.mcmeta, generated by the " +
        "game's own codec rather than hand-written, so the format always matches the running version. " +
        "Then write files with mc_datapack_write and apply them with mc_datapack_reload.",
      inputSchema: {
        datapack: z.string().describe("folder name for the pack, e.g. 'mypack'"),
        description: z.string().optional().describe("shown in the datapack list"),
        world: z
          .string()
          .optional()
          .describe("save id to author for; defaults to the world currently open"),
        overwrite: z.boolean().optional().describe("rewrite an existing pack.mcmeta, default false"),
      },
    },
    guard(async (args) => json(await bridge.call("create_datapack", args))),
  );

  server.registerTool(
    "mc_datapack_write",
    {
      title: "Write a file into a datapack",
      description:
        "Writes one file inside a datapack, creating folders as needed. JSON and .mcmeta content is " +
        "parsed first, so a syntax error is reported against the file you wrote instead of surfacing " +
        "later as an opaque reload failure. Paths are relative to the pack root, e.g. " +
        "'data/mypack/function/hello.mcfunction'. In 26.2 those folder names are singular: function, " +
        "dialog, loot_table, recipe, advancement, tags/...",
      inputSchema: {
        datapack: z.string().describe("pack folder name"),
        path: z.string().describe("path relative to the pack root"),
        content: z.string().describe("file contents"),
        world: z.string().optional().describe("save id; defaults to the world currently open"),
      },
    },
    guard(async (args) => json(await bridge.call("write_datapack_file", args))),
  );

  server.registerTool(
    "mc_datapack_files",
    {
      title: "List datapack files",
      description:
        "Lists the files in a datapack, or every pack in the world's datapacks folder when no pack is " +
        "named. Use it to confirm what actually got written.",
      inputSchema: {
        datapack: z.string().optional().describe("pack folder name; omit to list the whole folder"),
        world: z.string().optional(),
      },
    },
    guard(async (args) => json(await bridge.call("list_datapack_files", args))),
  );

  server.registerTool(
    "mc_datapack_delete",
    {
      title: "Delete a datapack file or the whole pack",
      description:
        "Deletes one file inside a datapack, or the entire pack when no path is given. Reload " +
        "afterwards for the game to notice.",
      inputSchema: {
        datapack: z.string().describe("pack folder name"),
        path: z
          .string()
          .optional()
          .describe("file to delete, relative to the pack root; omit to delete the whole pack"),
        world: z.string().optional(),
      },
    },
    guard(async (args) => json(await bridge.call("delete_datapack_file", args))),
  );

  server.registerTool(
    "mc_datapack_reload",
    {
      title: "Reload datapacks and report failures",
      description:
        "Runs /reload and reads the result back, reporting an error when the reload was rejected. " +
        "Vanilla only mentions a broken pack in chat while the command itself looks like it worked, " +
        "so use this rather than sending /reload yourself - otherwise a pack that failed to load " +
        "looks like a pack that did nothing.",
      inputSchema: {
        waitMs: z.number().optional().describe("how long to collect output, default 5000"),
      },
    },
    guard(async (args) => json(await bridge.call("reload_datapacks", args, 60_000))),
  );

  server.registerTool(
    "mc_registry",
    {
      title: "List registry ids",
      description:
        "Lists the ids in one of the connected server's registries - blocks, items, enchantments, " +
        "dialogs, and anything datapacks added. Datapack files are mostly references to these ids, " +
        "and a wrong id fails at load, so check here instead of recalling. Call with no arguments to " +
        "list the registries themselves.",
      inputSchema: {
        registry: z
          .string()
          .optional()
          .describe("e.g. 'block', 'item', 'minecraft:dialog'; omit to list all registries"),
        filter: z.string().optional().describe("only ids containing this substring"),
        limit: z.number().optional().describe("max entries returned, default 500"),
      },
    },
    guard(async (args) => json(await bridge.call("get_registry", args))),
  );

  server.registerTool(
    "mc_resourcepacks",
    {
      title: "List resource packs",
      description:
        "Lists the resource packs this instance can see and which are active. Later entries in " +
        "'selected' override earlier ones.",
      inputSchema: {},
    },
    guard(async () => json(await bridge.call("list_resourcepacks"))),
  );

  server.registerTool(
    "mc_resourcepack",
    {
      title: "Change the resource pack",
      description:
        "Switches the active resource pack, installing it from any path on disk first: pass a .zip or " +
        "a folder containing pack.mcmeta. Applies the selection, persists it to options.txt, reloads " +
        "resources, and then re-reads what is active - so a pack the game rejected is reported as an " +
        "error instead of looking like it worked. By default it replaces the previous pack while " +
        "leaving built-ins alone; pass replace:false to stack it on top, or ids:[] to go back to the " +
        "default look.",
      inputSchema: {
        path: z.string().optional().describe("path to a .zip or a folder with pack.mcmeta at its top level"),
        ids: z
          .array(z.string())
          .optional()
          .describe("select packs already present by id (from mc_resourcepacks); [] clears them"),
        replace: z
          .boolean()
          .optional()
          .describe("replace the current pack rather than stacking on top, default true"),
      },
    },
    guard(async (args) => json(await bridge.call("set_resourcepack", args, 120_000))),
  );

  // Escape hatch: the bridge exposes more actions than there are tools for.
  server.registerTool(
    "mc_raw",
    {
      title: "Call a bridge action directly",
      description:
        "Low-level escape hatch that invokes any bridge action by name with raw parameters. Use it " +
        "only when no dedicated tool fits; call it with action:'list_actions' to see what exists.",
      inputSchema: {
        action: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().optional(),
      },
    },
    guard(async ({ action, params, timeoutMs }) =>
      json(await bridge.call(action, params ?? {}, timeoutMs ?? 30_000)),
    ),
  );
}
