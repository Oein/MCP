/**
 * Physical net connectivity for the live PCB.
 *
 * EasyEDA's own net lists answer "does this net exist", not "is this net
 * physically complete": a net stays listed when only some of its nodes are
 * actually joined by copper. This module answers the second question from the
 * primitives the bridge can already read (pads, tracks, vias) by building the
 * connected components of the copper graph for a single net.
 *
 * Coordinates are native PCB units (mils) exactly as returned by
 * PCB_Primitive{Pad,Line,Via}.getAll — no conversion happens here.
 */

export interface ConnectivityPad {
  primitiveId: string;
  x: number;
  y: number;
  layer?: number;
  padNumber?: string;
  designator?: string;
  /** > 0 marks a plated through-hole pad, which shorts every copper layer. */
  holeDiameter?: number;
}

export interface ConnectivityTrack {
  primitiveId: string;
  layer?: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface ConnectivityVia {
  primitiveId: string;
  x: number;
  y: number;
}

export interface NetConnectivityInput {
  net: string;
  pads: ConnectivityPad[];
  tracks: ConnectivityTrack[];
  vias: ConnectivityVia[];
  /** Coincidence tolerance in native PCB units; defaults to 1 mil. */
  tolerance?: number;
}

export interface NetConnectivityGroup {
  index: number;
  pads: string[];
  vias: string[];
  tracks: string[];
  pad_count: number;
}

export interface NetConnectivityResult {
  net: string;
  tolerance: number;
  groups: NetConnectivityGroup[];
  group_count: number;
  pad_count: number;
  /** Number of groups that contain at least one pad; 1 means every pad is joined. */
  pad_group_count: number;
  complete: boolean;
  /** Pads that share no copper with anything else on the net. */
  isolated_pads: string[];
  /** Groups made only of tracks/vias — copper on the net that reaches no pad. */
  stray_group_indexes: number[];
  summary: string;
}

const DEFAULT_TOLERANCE = 1;
/** Layer marker for primitives that short every copper layer (vias, THT pads). */
const ALL_LAYERS = Symbol('all-layers');
type LayerScope = number | typeof ALL_LAYERS;

interface GraphNode {
  key: string;
  x: number;
  y: number;
  layer: LayerScope;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root) as string;
    }
    let cursor = key;
    while (cursor !== root) {
      const next = this.parent.get(cursor) as string;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function layersTouch(a: LayerScope, b: LayerScope): boolean {
  if (a === ALL_LAYERS || b === ALL_LAYERS) return true;
  // An unknown layer is not treated as a wildcard: guessing a layer would
  // report connections that do not exist, which is the failure mode this
  // module exists to avoid.
  return a === b;
}

function padLayerScope(pad: ConnectivityPad): LayerScope {
  if (typeof pad.holeDiameter === 'number' && pad.holeDiameter > 0) return ALL_LAYERS;
  return typeof pad.layer === 'number' ? pad.layer : Number.NaN;
}

function trackLayerScope(track: ConnectivityTrack): LayerScope {
  return typeof track.layer === 'number' ? track.layer : Number.NaN;
}

function cellKey(value: number, tolerance: number): number {
  return Math.floor(value / tolerance);
}

/** Union every pair of nodes that sit within `tolerance` on a shared layer. */
function unionCoincidentNodes(nodes: GraphNode[], union: UnionFind, tolerance: number): void {
  const buckets = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = `${cellKey(node.x, tolerance)}:${cellKey(node.y, tolerance)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(node);
    else buckets.set(key, [node]);
  }

  for (const node of nodes) {
    const cx = cellKey(node.x, tolerance);
    const cy = cellKey(node.y, tolerance);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of buckets.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (other.key === node.key) continue;
          if (Math.abs(other.x - node.x) > tolerance) continue;
          if (Math.abs(other.y - node.y) > tolerance) continue;
          if (!layersTouch(node.layer, other.layer)) continue;
          union.union(node.key, other.key);
        }
      }
    }
  }
}

function buildSummary(result: Omit<NetConnectivityResult, 'summary'>): string {
  if (result.pad_count === 0) {
    return `Net "${result.net}" has no pads on the active PCB; ${result.group_count} copper group(s) found.`;
  }
  if (result.complete) {
    return `Net "${result.net}" is physically complete: ${result.pad_count} pad(s) in one copper group.`;
  }
  return (
    `Net "${result.net}" is split into ${result.pad_group_count} pad group(s) ` +
    `across ${result.pad_count} pad(s); ${result.isolated_pads.length} pad(s) carry no copper.`
  );
}

/**
 * Build the copper connected components for one net.
 *
 * Callers pass only the primitives that already belong to the net — this
 * function does no net filtering and never reads the bridge.
 */
export function analyzeNetConnectivity(input: NetConnectivityInput): NetConnectivityResult {
  const tolerance =
    typeof input.tolerance === 'number' && input.tolerance > 0
      ? input.tolerance
      : DEFAULT_TOLERANCE;

  const union = new UnionFind();
  const nodes: GraphNode[] = [];
  const padNodeKeys = new Map<string, string>();
  const viaNodeKeys = new Map<string, string>();
  const trackNodeKeys = new Map<string, string>();

  input.pads.forEach((pad, index) => {
    const key = `pad:${index}`;
    padNodeKeys.set(key, pad.primitiveId);
    union.add(key);
    nodes.push({ key, x: pad.x, y: pad.y, layer: padLayerScope(pad) });
  });

  input.vias.forEach((via, index) => {
    const key = `via:${index}`;
    viaNodeKeys.set(key, via.primitiveId);
    union.add(key);
    nodes.push({ key, x: via.x, y: via.y, layer: ALL_LAYERS });
  });

  input.tracks.forEach((track, index) => {
    const layer = trackLayerScope(track);
    const startKey = `track:${index}:start`;
    const endKey = `track:${index}:end`;
    trackNodeKeys.set(startKey, track.primitiveId);
    trackNodeKeys.set(endKey, track.primitiveId);
    union.add(startKey);
    union.add(endKey);
    // A segment is continuous copper, so its own endpoints always merge.
    union.union(startKey, endKey);
    nodes.push({ key: startKey, x: track.startX, y: track.startY, layer });
    nodes.push({ key: endKey, x: track.endX, y: track.endY, layer });
  });

  unionCoincidentNodes(nodes, union, tolerance);

  const groupsByRoot = new Map<
    string,
    { pads: Set<string>; vias: Set<string>; tracks: Set<string> }
  >();
  const collect = (nodeKeys: Map<string, string>, field: 'pads' | 'vias' | 'tracks') => {
    for (const [nodeKey, primitiveId] of nodeKeys) {
      const root = union.find(nodeKey);
      let group = groupsByRoot.get(root);
      if (!group) {
        group = { pads: new Set(), vias: new Set(), tracks: new Set() };
        groupsByRoot.set(root, group);
      }
      group[field].add(primitiveId);
    }
  };
  collect(padNodeKeys, 'pads');
  collect(viaNodeKeys, 'vias');
  collect(trackNodeKeys, 'tracks');

  const groups: NetConnectivityGroup[] = [...groupsByRoot.values()]
    .map((group) => ({
      index: 0,
      pads: [...group.pads],
      vias: [...group.vias],
      tracks: [...group.tracks],
      pad_count: group.pads.size,
    }))
    // Largest pad group first so the "main" copper island is always groups[0].
    .sort((a, b) => b.pad_count - a.pad_count || b.tracks.length - a.tracks.length)
    .map((group, index) => ({ ...group, index }));

  const padGroups = groups.filter((group) => group.pad_count > 0);
  const padCount = input.pads.length;
  const base = {
    net: input.net,
    tolerance,
    groups,
    group_count: groups.length,
    pad_count: padCount,
    pad_group_count: padGroups.length,
    complete: padCount > 0 && padGroups.length === 1,
    isolated_pads: groups
      .filter(
        (group) => group.pad_count === 1 && group.tracks.length === 0 && group.vias.length === 0,
      )
      .flatMap((group) => group.pads),
    stray_group_indexes: groups
      .filter((group) => group.pad_count === 0)
      .map((group) => group.index),
  };

  return { ...base, summary: buildSummary(base) };
}
