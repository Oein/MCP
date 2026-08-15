/** Shapes returned by the bridge. Partial on purpose: the bridge is the source
 * of truth, and these describe the fields callers actually rely on. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ItemStack {
  empty: boolean;
  id?: string;
  count?: number;
  name?: string;
}

export interface PlayerState {
  name: string;
  position: Vec3;
  blockPosition: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  food: number;
  onGround: boolean;
  sprinting: boolean;
  sneaking: boolean;
  gameMode: string;
  selectedSlot: number;
  heldItem: ItemStack;
}

export interface ScreenSummary {
  open: boolean;
  class?: string;
  title?: string;
}

export interface GameState {
  ok: true;
  inWorld: boolean;
  fps: number;
  screen: ScreenSummary;
  player?: PlayerState;
  world?: {
    dimension: string;
    gameTime: number;
    raining: boolean;
  };
  crosshair?: {
    type: "miss" | "block" | "entity";
    position?: Vec3;
    face?: string;
    block?: string;
    distance?: number;
    entity?: EntityInfo;
  };
  chatCursor?: number;
}

export interface EntityInfo {
  id: number;
  uuid: string;
  type: string;
  name: string;
  position: Vec3;
  health?: number;
  maxHealth?: number;
  distance?: number;
}

export interface BlockInfo {
  position: Vec3;
  block: string;
  state: string;
  air: boolean;
}

export interface ScanResult {
  volume: number;
  truncated: boolean;
  counts: Record<string, number>;
  blocks: Array<{ x: number; y: number; z: number; block: string }>;
}

export interface ChatMessage {
  seq: number;
  timestamp: number;
  kind: "chat" | "system" | "overlay";
  sender?: string;
  text: string;
}

export interface ChatResult {
  messages: ChatMessage[];
  cursor: number;
  sent?: string;
}

export interface Widget {
  index: number;
  class: string;
  kind?: "button" | "input" | "listEntry";
  label?: string;
  value?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  active?: boolean;
  visible?: boolean;
}

export interface ScreenInfo {
  open: boolean;
  class?: string;
  qualifiedClass?: string;
  title?: string;
  isDialog?: boolean;
  narration?: string;
  widgets?: Widget[];
}

export interface InventoryResult {
  selectedSlot: number;
  selectedItem: ItemStack;
  offhand: ItemStack;
  items: Array<ItemStack & { slot: number; hotbar: boolean }>;
  openContainer?: {
    class: string;
    containerId: number;
    slotCount: number;
    slots: Array<ItemStack & { slot: number }>;
  };
}

export interface BaritoneStatus {
  installed: boolean;
  busy?: boolean;
  atGoal?: boolean;
  goal?: string;
  estimatedTicks?: number;
  position?: Vec3;
  apiError?: string;
  note?: string;
}

export interface Screenshot {
  format: "png";
  bytes: number;
  width: number;
  height: number;
  /** base64-encoded PNG */
  data: string;
}

export interface PackFormat {
  major: number;
  minor: number;
  directory: string;
}

export interface Paths {
  gameDir: string;
  resourcePacksDir: string;
  savesDir: string;
  currentWorld: { name?: string; dir?: string; datapacksDir?: string; note?: string };
  minecraft: string;
  packFormats: { data: PackFormat; resource: PackFormat };
}

export interface ResourcePackInfo {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

export interface ResourcePackList {
  directory: string;
  packs: ResourcePackInfo[];
  selected: string[];
}

export interface RegistryEntries {
  registry: string;
  total: number;
  truncated: boolean;
  entries: string[];
}
