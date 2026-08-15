import { Transport, type TransportOptions } from "./transport.js";
import { sleep, waitFor, type WaitOptions } from "./wait.js";
import type {
  BaritoneStatus,
  BlockInfo,
  ChatResult,
  EntityInfo,
  GameState,
  InventoryResult,
  Paths,
  RegistryEntries,
  ResourcePackList,
  ScanResult,
  Screenshot,
  ScreenInfo,
  Vec3,
} from "./types.js";

export type Face = "up" | "down" | "north" | "south" | "east" | "west";
export type Hand = "main" | "off";

export interface MoveInput {
  forward?: boolean;
  backward?: boolean;
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  sneak?: boolean;
  sprint?: boolean;
  attack?: boolean;
  use?: boolean;
  durationMs?: number;
}

export interface GotoOptions {
  x?: number;
  y?: number;
  z?: number;
  goal?: "block" | "near" | "xz" | "y";
  range?: number;
  wait?: boolean;
  timeoutMs?: number;
}

/**
 * Typed client for the mc-mcp bridge.
 *
 * <p>This is the same surface the MCP tools expose, minus the protocol wrapper,
 * so anything an agent can do a script or test can do identically. Methods are
 * thin over the bridge; the value they add is types, sensible timeouts, and the
 * waiting helpers that make assertions reliable.
 */
export class McClient {
  readonly transport: Transport;

  constructor(opts: TransportOptions = {}) {
    this.transport = new Transport(opts);
  }

  /** Escape hatch for actions with no wrapper. */
  raw<T = any>(action: string, params: Record<string, unknown> = {}, timeoutMs?: number) {
    return this.transport.call<T>(action, params, timeoutMs);
  }

  async listActions(): Promise<string[]> {
    const res = await this.raw<{ actions: string[] }>("list_actions");
    return res.actions;
  }

  // --- observation -------------------------------------------------------

  state(): Promise<GameState> {
    return this.raw<GameState>("get_state");
  }

  /** The player state, failing clearly when not in a world. */
  async player() {
    const s = await this.state();
    if (!s.inWorld || !s.player) {
      throw new Error("not in a world; connect to a server or load a world first");
    }
    return s.player;
  }

  async position(): Promise<Vec3> {
    return (await this.player()).position;
  }

  getBlock(pos: Vec3): Promise<BlockInfo> {
    return this.raw<BlockInfo>("get_block", { ...pos });
  }

  /** Registry id at a position, e.g. {@code minecraft:stone}. */
  async blockId(pos: Vec3): Promise<string> {
    return (await this.getBlock(pos)).block;
  }

  scan(from: Vec3, to: Vec3, opts: { includeAir?: boolean; limit?: number } = {}) {
    return this.raw<ScanResult>(
      "scan_blocks",
      {
        x1: from.x, y1: from.y, z1: from.z,
        x2: to.x, y2: to.y, z2: to.z,
        ...opts,
      },
      60_000,
    );
  }

  async entities(opts: { radius?: number; limit?: number } = {}): Promise<EntityInfo[]> {
    const res = await this.raw<{ entities: EntityInfo[] }>("get_entities", opts);
    return res.entities;
  }

  mods() {
    return this.raw<{
      mods: Record<string, string>;
      hasBaritone: boolean;
      hasWorldEdit: boolean;
    }>("get_mods");
  }

  screenshot(): Promise<Screenshot> {
    return this.raw<Screenshot>("screenshot", {}, 30_000);
  }

  /** Screenshot decoded to PNG bytes, ready to write to disk. */
  async screenshotBuffer(): Promise<Buffer> {
    const shot = await this.screenshot();
    return Buffer.from(shot.data, "base64");
  }

  // --- movement ----------------------------------------------------------

  setInput(input: MoveInput) {
    return this.raw("set_input", input as Record<string, unknown>);
  }

  stopInput() {
    return this.raw("stop_input");
  }

  /** Holds the given inputs for a duration and then releases them. */
  async moveFor(input: Omit<MoveInput, "durationMs">, durationMs: number) {
    await this.setInput({ ...input, durationMs });
    await sleep(durationMs + 100);
  }

  look(target: { yaw?: number; pitch?: number; ticks?: number }) {
    return this.raw("look", target);
  }

  lookAt(pos: Vec3, ticks?: number) {
    return this.raw("look_at", { ...pos, ticks });
  }

  /**
   * Walks to a destination with Baritone and reports whether it arrived.
   *
   * <p>Defaults to {@code goal: "xz"} when no Y is given: Baritone pathfinds far
   * more reliably when it may arrive at any height.
   */
  goto(opts: GotoOptions) {
    const goal = opts.goal ?? (opts.y === undefined ? "xz" : "block");
    const timeoutMs = opts.timeoutMs ?? 300_000;
    return this.raw("baritone_goto", { ...opts, goal, timeoutMs }, timeoutMs + 30_000);
  }

  baritoneStatus(): Promise<BaritoneStatus> {
    return this.raw<BaritoneStatus>("baritone_status");
  }

  /** Runs any Baritone command through its chat prefix, returning what it said. */
  baritoneCommand(command: string, waitMs?: number): Promise<ChatResult> {
    return this.raw<ChatResult>("baritone_command", { command, waitMs });
  }

  baritoneStop() {
    return this.raw("baritone_stop");
  }

  /** Waits for pathing started with {@code wait:false} to finish. */
  baritoneWait(timeoutMs = 300_000) {
    return this.raw("baritone_wait", { timeoutMs }, timeoutMs + 30_000);
  }

  // --- interaction -------------------------------------------------------

  breakBlock(pos: Vec3, timeoutMs = 15_000) {
    return this.raw("break_block", { ...pos, timeoutMs }, timeoutMs + 10_000);
  }

  useOnBlock(pos: Vec3, opts: { face?: Face; hand?: Hand } = {}) {
    return this.raw("use_on_block", { ...pos, ...opts });
  }

  /** Alias that reads better when the intent is placing. */
  placeBlock(against: Vec3, opts: { face?: Face; hand?: Hand } = {}) {
    return this.useOnBlock(against, opts);
  }

  useItem(hand: Hand = "main") {
    return this.raw("use_item", { hand });
  }

  attackEntity(entityId: number) {
    return this.raw("attack_entity", { entityId });
  }

  interactEntity(entityId: number, hand: Hand = "main") {
    return this.raw("interact_entity", { entityId, hand });
  }

  pickBlock(pos: Vec3, withData = false) {
    return this.raw("pick_block", { ...pos, withData });
  }

  swing(hand: Hand = "main") {
    return this.raw("swing", { hand });
  }

  // --- inventory ---------------------------------------------------------

  inventory(): Promise<InventoryResult> {
    return this.raw<InventoryResult>("get_inventory");
  }

  /** Puts an item in hand by id, moving it to the hotbar if necessary. */
  hold(itemId: string) {
    return this.raw("select_item", { id: itemId });
  }

  selectSlot(slot: number) {
    return this.raw("select_slot", { slot });
  }

  clickSlot(slot: number, opts: { type?: string; button?: number } = {}) {
    return this.raw("click_slot", { slot, ...opts });
  }

  dropItem(wholeStack = false) {
    return this.raw("drop_item", { wholeStack });
  }

  swapOffhand() {
    return this.raw("swap_offhand");
  }

  // --- commands and chat -------------------------------------------------

  /** Runs a command and returns the chat output it produced. */
  command(command: string, waitMs = 700): Promise<ChatResult> {
    return this.raw<ChatResult>("send_command", { command, waitMs });
  }

  chat(message: string, waitMs = 400): Promise<ChatResult> {
    return this.raw<ChatResult>("send_chat", { message, waitMs });
  }

  readChat(opts: { since?: number; limit?: number; waitMs?: number } = {}): Promise<ChatResult> {
    return this.raw<ChatResult>("read_chat", opts);
  }

  /** WorldEdit runs through the command channel; the double slash is literal. */
  worldedit(command: string, waitMs = 2000): Promise<ChatResult> {
    return this.raw<ChatResult>("send_command", { command, waitMs });
  }

  commandSyntax(command?: string) {
    return this.raw<{ commands?: string[]; command?: string; usage?: string[] }>(
      "get_command_syntax",
      { command },
    );
  }

  // --- screens and dialogs ----------------------------------------------

  screen(): Promise<ScreenInfo> {
    return this.raw<ScreenInfo>("get_screen");
  }

  clickWidget(target: { label?: string; index?: number; doubleClick?: boolean }) {
    return this.raw("click_widget", target);
  }

  setWidgetText(text: string, target: { label?: string; index?: number }) {
    return this.raw("set_widget_text", { text, ...target });
  }

  pressKey(key: string) {
    return this.raw("press_key", { key });
  }

  closeScreen() {
    return this.raw("close_screen");
  }

  openInventory() {
    return this.raw("open_inventory");
  }

  waitForScreen(classContains?: string, timeoutMs = 5000) {
    return this.raw("wait_for_screen", { classContains, timeoutMs });
  }

  // --- session -----------------------------------------------------------

  session() {
    return this.raw<{
      account: { name: string; uuid: string; offline: boolean };
      inWorld: boolean;
      connected: boolean;
      policy: { requireOfflineAccount: boolean; extraAllowedHosts: string[] };
    }>("get_session");
  }

  /**
   * Joins a server. Waits for the join to finish by default and surfaces the
   * server's own refusal reason rather than a generic screen title.
   */
  connect(
    address: string,
    opts: { name?: string; wait?: boolean; timeoutMs?: number } = {},
  ) {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    return this.raw("connect_server", { address, ...opts, timeoutMs }, timeoutMs + 30_000);
  }

  disconnect() {
    return this.raw("disconnect", {}, 90_000);
  }

  /** Saved singleplayer worlds, with the ids {@link openWorld} takes. */
  worlds() {
    return this.raw<{ worlds: Array<{ id: string; name: string }> }>("list_worlds");
  }

  /**
   * Loads a saved singleplayer world directly, without driving the title screen.
   * Waits until the world is actually loaded.
   */
  openWorld(
    id: string,
    opts: { leaveCurrent?: boolean; confirm?: boolean; timeoutMs?: number } = {},
  ) {
    const timeoutMs = opts.timeoutMs ?? 120_000;
    return this.raw("open_world", { id, ...opts, timeoutMs }, timeoutMs + 30_000);
  }

  /**
   * Controls whether real keyboard and mouse input reaches the game.
   *
   * <p>On by default: a stray click on the desktop must not be able to turn the
   * camera or cancel a path mid-run. Bridge actions are never affected.
   */
  inputLock(locked?: boolean) {
    return this.raw<{ ignoreUserInput: boolean }>("set_input_lock", { locked });
  }

  // --- waiting -----------------------------------------------------------

  /** Polls game state until the predicate holds. */
  waitForState(predicate: (s: GameState) => boolean, opts: WaitOptions = {}) {
    return waitFor(() => this.state(), predicate, { description: "game state", ...opts });
  }

  /** Waits until the client is in a world with a player. */
  waitUntilInWorld(timeoutMs = 120_000) {
    return this.waitForState((s) => s.inWorld && !!s.player, {
      timeoutMs,
      description: "the client to be in a world",
    });
  }

  /** Waits until a position holds the expected block id. */
  waitForBlock(pos: Vec3, blockId: string, opts: WaitOptions = {}) {
    const expected = blockId.includes(":") ? blockId : `minecraft:${blockId}`;
    return waitFor(
      () => this.blockId(pos),
      (actual) => actual === expected,
      { description: `${expected} at ${pos.x},${pos.y},${pos.z}`, ...opts },
    );
  }

  /** Waits until the player is within {@code radius} blocks of a position. */
  waitUntilNear(pos: Vec3, radius = 3, opts: WaitOptions = {}) {
    return waitFor(
      () => this.position(),
      (p) => Math.hypot(p.x - pos.x, p.z - pos.z) <= radius,
      { description: `player within ${radius} blocks of ${pos.x},${pos.z}`, ...opts },
    );
  }

  // --- datapacks and packs ------------------------------------------------

  /** Directories this instance uses, and the pack formats this build wants. */
  paths(): Promise<Paths> {
    return this.raw<Paths>("get_paths");
  }

  /** Creates a datapack with a pack.mcmeta the running version accepts. */
  createDatapack(
    datapack: string,
    opts: { description?: string; world?: string; overwrite?: boolean } = {},
  ) {
    return this.raw<{ path: string; created: boolean; packMcmeta?: unknown }>(
      "create_datapack",
      { datapack, ...opts },
    );
  }

  /** Writes one file inside a datapack. JSON content is validated first. */
  writeDatapackFile(datapack: string, path: string, content: string, world?: string) {
    return this.raw<{ path: string; bytes: number; warning?: string }>("write_datapack_file", {
      datapack,
      path,
      content,
      ...(world ? { world } : {}),
    });
  }

  async datapackFiles(datapack?: string, world?: string): Promise<string[]> {
    const res = await this.raw<{ root: string; files: { path: string }[] }>("list_datapack_files", {
      ...(datapack ? { datapack } : {}),
      ...(world ? { world } : {}),
    });
    return res.files.map((f) => f.path);
  }

  deleteDatapack(datapack: string, path?: string, world?: string) {
    return this.raw<{ deleted: string }>("delete_datapack_file", {
      datapack,
      ...(path ? { path } : {}),
      ...(world ? { world } : {}),
    });
  }

  /** Runs /reload; rejects when the reload reported a broken pack. */
  reloadDatapacks(waitMs = 5000) {
    return this.raw<ChatResult>("reload_datapacks", { waitMs }, 60_000);
  }

  resourcePacks(): Promise<ResourcePackList> {
    return this.raw<ResourcePackList>("list_resourcepacks");
  }

  /** Installs (if given a path) and selects a resource pack, then reloads. */
  setResourcePack(
    opts: { path?: string; ids?: string[]; replace?: boolean },
  ): Promise<{ selected: string[]; applied?: string; installedTo?: string }> {
    return this.raw("set_resourcepack", opts, 120_000);
  }

  /** Ids in one of the server's registries, e.g. "block" or "minecraft:dialog". */
  registry(registry: string, opts: { filter?: string; limit?: number } = {}) {
    return this.raw<RegistryEntries>("get_registry", { registry, ...opts });
  }
}
