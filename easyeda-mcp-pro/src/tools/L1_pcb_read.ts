import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from './types.js';
import { type EnvConfig } from '../config/env.js';
import {
  analyzeNetConnectivity,
  type ConnectivityPad,
  type ConnectivityTrack,
  type ConnectivityVia,
} from '../pcb-connectivity/index.js';

const pcbListInputSchema = z.object({
  projectId: z.string(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const pcbPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const pcbBoundsSchema = z.object({
  minX: z.number().finite(),
  minY: z.number().finite(),
  maxX: z.number().finite(),
  maxY: z.number().finite(),
});
const pcbPolygonContourSchema = z.object({
  points: z.array(pcbPointSchema).max(500),
  pointCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  bounds: pcbBoundsSchema,
});
const pcbPolygonSchema = z.object({
  contours: z.array(pcbPolygonContourSchema).max(500),
  contourCount: z.number().int().nonnegative(),
  pointCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  bounds: pcbBoundsSchema,
});

type PcbPoint = { x: number; y: number };
type PcbBounds = { minX: number; minY: number; maxX: number; maxY: number };
const MAX_PCB_POLYGON_POINTS = 500;
const FALLBACK_CIRCLE_SEGMENTS = 32;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function circleSourcePoints(source: unknown[]): PcbPoint[] {
  const cx = finiteNumber(source[1]);
  const cy = finiteNumber(source[2]);
  const radius = finiteNumber(source[3]);
  if (cx === undefined || cy === undefined || radius === undefined || radius <= 0) return [];
  return Array.from({ length: FALLBACK_CIRCLE_SEGMENTS }, (_, index) => {
    const angle = (index / FALLBACK_CIRCLE_SEGMENTS) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

function rectangleSourcePoints(source: unknown[]): PcbPoint[] {
  const [x, y, width, height, rotation, round] = source.slice(1, 7).map(finiteNumber);
  if ([x, y, width, height].some((value) => value === undefined)) return [];
  if (rotation !== 0 || round !== 0 || (width as number) < 0 || (height as number) < 0) return [];
  const right = (x as number) + (width as number);
  const bottom = (y as number) + (height as number);
  return [
    { x: x as number, y: y as number },
    { x: right, y: y as number },
    { x: right, y: bottom },
    { x: x as number, y: bottom },
  ];
}

function lineSourcePoints(source: unknown[]): PcbPoint[] {
  if (source.some((token) => typeof token === 'string' && token !== 'L')) return [];
  const coordinates = source.filter((token) => token !== 'L');
  if (coordinates.length < 6 || coordinates.length % 2) return [];
  const points: PcbPoint[] = [];
  for (let index = 0; index < coordinates.length; index += 2) {
    const x = finiteNumber(coordinates[index]);
    const y = finiteNumber(coordinates[index + 1]);
    if (x === undefined || y === undefined) return [];
    points.push({ x, y });
  }
  return points;
}

function sourcePoints(source: unknown[]): PcbPoint[] {
  if (source[0] === 'CIRCLE') return circleSourcePoints(source);
  if (source[0] === 'R') return rectangleSourcePoints(source);
  return lineSourcePoints(source);
}

function pointBounds(points: PcbPoint[]): PcbBounds {
  return points.reduce<PcbBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function normalizePolygonSource(source: unknown) {
  if (!Array.isArray(source) || source.length === 0) return undefined;
  const candidates = Array.isArray(source[0]) ? source : [source];
  const contours = [];
  let pointCount = 0;
  let storedPointCount = 0;
  let bounds: PcbBounds | undefined;
  let contourCount = 0;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const points = sourcePoints(candidate);
    if (points.length === 0) continue;
    contourCount += 1;
    pointCount += points.length;
    const contourBounds = pointBounds(points);
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, contourBounds.minX),
          minY: Math.min(bounds.minY, contourBounds.minY),
          maxX: Math.max(bounds.maxX, contourBounds.maxX),
          maxY: Math.max(bounds.maxY, contourBounds.maxY),
        }
      : contourBounds;
    const stored = points.slice(0, Math.max(0, MAX_PCB_POLYGON_POINTS - storedPointCount));
    storedPointCount += stored.length;
    if (stored.length) {
      contours.push({
        points: stored,
        pointCount: points.length,
        truncated: stored.length < points.length,
        bounds: contourBounds,
      });
    }
  }
  if (!bounds || pointCount === 0) return undefined;
  return {
    contours,
    contourCount,
    pointCount,
    truncated: storedPointCount < pointCount,
    bounds,
  };
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function withPolygon(item: Record<string, unknown>, publicItem: Record<string, unknown>) {
  const polygon = normalizePolygonSource(item.polygonSource);
  return polygon ? { ...publicItem, polygon } : publicItem;
}

function normalizeFillItem(item: Record<string, unknown>): Record<string, unknown> {
  const net = typeof item.net === 'string' ? item.net : '';
  return withPolygon(item, {
    primitiveId: typeof item.primitiveId === 'string' ? item.primitiveId : '',
    layer: optionalNumber(item.layer),
    net,
    netless: !net,
    fillMode: Number.isInteger(item.fillMode) ? item.fillMode : undefined,
    lineWidth: optionalNumber(item.lineWidth),
    locked: item.locked === true,
  });
}

function optionalText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

function normalizePadItem(item: Record<string, unknown>): Record<string, unknown> {
  const holeDiameter = optionalNumber(item.holeDiameter);
  return {
    primitiveId: typeof item.primitiveId === 'string' ? item.primitiveId : '',
    net: typeof item.net === 'string' ? item.net : '',
    padNumber: optionalText(item.padNumber) ?? '',
    x: optionalNumber(item.x),
    y: optionalNumber(item.y),
    layer: optionalNumber(item.layer),
    rotationRad: optionalNumber(item.rotation),
    shape: optionalText(item.shape),
    width: optionalNumber(item.width),
    height: optionalNumber(item.height),
    ...(holeDiameter === undefined ? {} : { holeDiameter }),
    // A drilled pad spans every copper layer; an SMD pad reports no hole at all.
    // Absent rather than false when the runtime did not report a hole state, so
    // callers never read "SMD" out of a field the runtime never answered.
    through_hole: holeDiameter === undefined ? undefined : holeDiameter > 0,
    // Plating comes from the runtime's own Metallization flag, not inferred.
    ...(typeof item.metallization === 'boolean' ? { plated: item.metallization } : {}),
    locked: item.locked === true,
  };
}

function normalizeZoneItem(item: Record<string, unknown>): Record<string, unknown> {
  return withPolygon(item, {
    primitiveId: typeof item.primitiveId === 'string' ? item.primitiveId : '',
    net: typeof item.net === 'string' ? item.net : '',
    layer: optionalNumber(item.layer),
    name: optionalText(item.name),
    clearance: optionalNumber(item.clearance),
    fillStyle: Number.isInteger(item.fillStyle) ? item.fillStyle : undefined,
    priority: optionalNumber(item.priority),
    keepIsland: typeof item.keepIsland === 'boolean' ? item.keepIsland : undefined,
    locked: item.locked === true,
  });
}

function normalizeRegionItem(item: Record<string, unknown>): Record<string, unknown> {
  return withPolygon(item, {
    primitiveId: typeof item.primitiveId === 'string' ? item.primitiveId : '',
    layer: optionalNumber(item.layer),
    ruleTypes: Array.isArray(item.ruleTypes) ? item.ruleTypes.filter(Number.isInteger) : [],
    regionName: typeof item.regionName === 'string' ? item.regionName : '',
    lineWidth: optionalNumber(item.lineWidth),
    locked: item.locked === true,
  });
}

/** Shared handler for the PCB list-* tools: call the bridge, map its
 *  {total, items} shape onto the caller-provided list key, and degrade to
 *  an empty (not_available) list instead of throwing — "no PCB tab focused"
 *  is a normal state for these tools, not an error. */
function makePcbListHandler(
  bridgeMethod: string,
  listKey: string,
  mapItem?: (item: Record<string, unknown>) => Record<string, unknown>,
) {
  return async (ctx: ToolContext, params: unknown) => {
    const { projectId, limit, offset } = pcbListInputSchema.parse(params);
    try {
      const result = await ctx.bridge.call<
        Record<string, unknown>,
        { total?: number; items?: Record<string, unknown>[] }
      >(bridgeMethod, { limit, offset });
      const items = result?.items ?? [];
      return {
        project_id: projectId,
        [listKey]: mapItem ? items.map(mapItem) : items,
        total: result?.total ?? items.length,
      };
    } catch (err) {
      return {
        project_id: projectId,
        [listKey]: [],
        total: 0,
        not_available: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/** Shared registration for PCB list-* tools: identical profile,
 *  risk, annotations, and output-schema envelope — only name/description/
 *  bridge method/item shape vary. */
function registerPcbListTool(
  registry: { register: (def: ToolDefinition) => void },
  opts: {
    name: string;
    title: string;
    description: string;
    bridgeMethod: string;
    listKey: string;
    itemSchema: z.ZodTypeAny;
    mapItem?: (item: Record<string, unknown>) => Record<string, unknown>;
  },
): void {
  registry.register({
    name: opts.name,
    title: opts.title,
    description: opts.description,
    profile: 'core',
    evidence: ['runtime-probe'],
    risk: 'low',
    confirmWrite: false,
    group: 'board',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: pcbListInputSchema,
    outputSchema: z.object({
      project_id: z.string(),
      [opts.listKey]: z.array(opts.itemSchema),
      total: z.number().int().nonnegative(),
      not_available: z.boolean().optional(),
      error: z.string().optional(),
    }),
    handler: makePcbListHandler(opts.bridgeMethod, opts.listKey, opts.mapItem),
  });
}

const PCB_FETCH_PAGE_SIZE = 200;
const PCB_FETCH_MAX_ITEMS = 20000;

/** Page through one of the PCB list-* bridge methods until the reported total
 *  is covered. Connectivity has to see every primitive of a net, so a single
 *  capped page would silently under-report a split net. */
async function fetchAllPcbItems(
  ctx: ToolContext,
  bridgeMethod: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const page = await ctx.bridge.call<
      Record<string, unknown>,
      { total?: number; items?: Record<string, unknown>[] }
    >(bridgeMethod, { limit: PCB_FETCH_PAGE_SIZE, offset });
    const pageItems = page?.items ?? [];
    items.push(...pageItems);
    offset += pageItems.length;
    const total = typeof page?.total === 'number' ? page.total : items.length;
    if (pageItems.length === 0 || items.length >= total || items.length >= PCB_FETCH_MAX_ITEMS) {
      return items;
    }
  }
}

function matchesNet(item: Record<string, unknown>, net: string): boolean {
  return typeof item.net === 'string' && item.net === net;
}

const netConnectivityInputSchema = z.object({
  projectId: z.string(),
  net: z.string().min(1),
  tolerance: z.coerce
    .number()
    .positive()
    .max(100)
    .default(1)
    .describe('Coincidence tolerance in native PCB units (mils).'),
});

const netConnectivityGroupSchema = z.object({
  index: z.number().int().nonnegative(),
  pads: z.array(z.string()),
  vias: z.array(z.string()),
  tracks: z.array(z.string()),
  pad_count: z.number().int().nonnegative(),
});

function registerPcbNetConnectivityTool(registry: { register: (def: ToolDefinition) => void }) {
  registry.register({
    name: 'easyeda_pcb_net_connectivity',
    title: 'Analyze physical net connectivity',
    description:
      'Answer whether one net is physically complete on the active PCB by grouping its pads, ' +
      'tracks, and vias into copper connected components. A partly routed net is returned as ' +
      'several groups with complete=false. Vias and plated through-hole pads bridge layers; ' +
      'SMD pads and track endpoints connect within their own layer.',
    profile: 'core',
    evidence: ['runtime-probe'],
    risk: 'low',
    confirmWrite: false,
    group: 'board',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: netConnectivityInputSchema,
    outputSchema: z.object({
      project_id: z.string(),
      net: z.string(),
      tolerance: z.number(),
      complete: z.boolean(),
      groups: z.array(netConnectivityGroupSchema),
      group_count: z.number().int().nonnegative(),
      pad_count: z.number().int().nonnegative(),
      pad_group_count: z.number().int().nonnegative(),
      isolated_pads: z.array(z.string()),
      stray_group_indexes: z.array(z.number().int().nonnegative()),
      summary: z.string(),
      not_available: z.boolean().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { projectId, net, tolerance } = netConnectivityInputSchema.parse(params);
      try {
        const [padItems, trackItems, viaItems] = await Promise.all([
          fetchAllPcbItems(ctx, 'pcb.listPads'),
          fetchAllPcbItems(ctx, 'pcb.listTracks'),
          fetchAllPcbItems(ctx, 'pcb.listVias'),
        ]);

        const pads: ConnectivityPad[] = padItems
          .filter((item) => matchesNet(item, net))
          .map((item) => normalizePadItem(item) as unknown as Record<string, unknown>)
          .filter(
            (pad) => optionalNumber(pad.x) !== undefined && optionalNumber(pad.y) !== undefined,
          )
          .map((pad) => ({
            primitiveId: pad.primitiveId as string,
            x: pad.x as number,
            y: pad.y as number,
            layer: optionalNumber(pad.layer),
            padNumber: pad.padNumber as string,
            designator: pad.designator as string | undefined,
            holeDiameter: optionalNumber(pad.holeDiameter),
          }));

        const tracks: ConnectivityTrack[] = trackItems
          .filter((item) => matchesNet(item, net))
          .flatMap((item) => {
            const startX = optionalNumber(item.startX);
            const startY = optionalNumber(item.startY);
            const endX = optionalNumber(item.endX);
            const endY = optionalNumber(item.endY);
            if ([startX, startY, endX, endY].some((value) => value === undefined)) return [];
            return [
              {
                primitiveId: typeof item.primitiveId === 'string' ? item.primitiveId : '',
                layer: optionalNumber(item.layer),
                startX: startX as number,
                startY: startY as number,
                endX: endX as number,
                endY: endY as number,
              },
            ];
          });

        const vias: ConnectivityVia[] = viaItems
          .filter((item) => matchesNet(item, net))
          .flatMap((item) => {
            const x = optionalNumber(item.x);
            const y = optionalNumber(item.y);
            if (x === undefined || y === undefined) return [];
            return [
              {
                primitiveId: typeof item.primitiveId === 'string' ? item.primitiveId : '',
                x,
                y,
              },
            ];
          });

        const analysis = analyzeNetConnectivity({ net, pads, tracks, vias, tolerance });
        return { project_id: projectId, ...analysis };
      } catch (err) {
        return {
          project_id: projectId,
          net,
          tolerance,
          complete: false,
          groups: [],
          group_count: 0,
          pad_count: 0,
          pad_group_count: 0,
          isolated_pads: [],
          stray_group_indexes: [],
          summary: `Net connectivity is unavailable for "${net}".`,
          not_available: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });
}

function registerPcbReadTools(
  registry: { register: (def: ToolDefinition) => void },
  _config: EnvConfig,
) {
  registerPcbListTool(registry, {
    name: 'easyeda_pcb_components',
    title: 'List PCB components',
    description:
      'List components placed on the active PCB layout: primitiveId, designator, footprint ' +
      'identity, position/rotation/layer. Requires a focused PCB tab in EasyEDA Pro — returns ' +
      'an empty list (not an error) if none is active.',
    bridgeMethod: 'pcb.listComponents',
    listKey: 'components',
    itemSchema: z.object({
      primitiveId: z.string().optional(),
      designator: z.string().optional(),
      footprintName: z.string().optional(),
      footprintUuid: z.string().optional(),
      footprintLibraryUuid: z.string().optional(),
      deviceName: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      rotation: z.number().optional(),
      layer: z.number().optional(),
      locked: z.boolean().optional(),
    }),
  });

  registerPcbListTool(registry, {
    name: 'easyeda_pcb_fills',
    title: 'List PCB fills',
    description:
      'List native PCB Fill primitives separately from copper pours/zones, including net/layer, ' +
      'fill mode, line width, lock state, and a bounded normalized polygon representation. ' +
      'Netless fills are returned explicitly with netless=true. Read-only; no Fill mutation is exposed.',
    bridgeMethod: 'pcb.listFills',
    listKey: 'fills',
    mapItem: normalizeFillItem,
    itemSchema: z.object({
      primitiveId: z.string(),
      layer: z.number().optional(),
      net: z.string(),
      netless: z.boolean(),
      fillMode: z.number().int().optional(),
      lineWidth: z.number().optional(),
      locked: z.boolean(),
      polygon: pcbPolygonSchema.optional(),
    }),
  });

  registerPcbListTool(registry, {
    name: 'easyeda_pcb_regions',
    title: 'List PCB constraint regions',
    description:
      'List native PCB Region primitives separately from copper pours/zones, including layer, ' +
      'region rule types/name, line width, lock state, and a bounded normalized polygon representation. ' +
      'Read-only; no Region mutation is exposed.',
    bridgeMethod: 'pcb.listRegions',
    listKey: 'regions',
    mapItem: normalizeRegionItem,
    itemSchema: z.object({
      primitiveId: z.string(),
      layer: z.number().optional(),
      ruleTypes: z.array(z.number().int()),
      regionName: z.string(),
      lineWidth: z.number().optional(),
      locked: z.boolean(),
      polygon: pcbPolygonSchema.optional(),
    }),
  });

  registerPcbListTool(registry, {
    name: 'easyeda_pcb_pads',
    title: 'List PCB pads',
    description:
      'List pads on the active PCB layout: primitiveId, net, pad number, position, layer, ' +
      'rotation (radians), shape/size, hole. Authoritative source for measured pad geometry — ' +
      'take track endpoints from these coordinates, not from a netlist. Requires a focused PCB tab.',
    bridgeMethod: 'pcb.listPads',
    listKey: 'pads',
    mapItem: normalizePadItem,
    itemSchema: z.object({
      primitiveId: z.string(),
      net: z.string(),
      padNumber: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
      layer: z.number().optional(),
      rotationRad: z.number().optional().describe('Pad rotation in radians, not degrees.'),
      shape: z.string().optional().describe('Native pad shape name, e.g. RECT, ROUND, OVAL.'),
      width: z.number().optional(),
      height: z.number().optional(),
      holeDiameter: z.number().optional().describe('Absent on SMD pads, which report no hole.'),
      through_hole: z.boolean().optional(),
      plated: z.boolean().optional().describe("The runtime's own Metallization flag."),
      locked: z.boolean(),
    }),
  });

  registerPcbListTool(registry, {
    name: 'easyeda_pcb_tracks',
    title: 'List PCB tracks',
    description:
      'List copper track segments on the active PCB layout: primitiveId, net, layer, start/end ' +
      'coordinates, width. A multi-point track drawn by add_track appears as several consecutive ' +
      'segments sharing one net. Returns an empty list (not an error) if no PCB tab is focused.',
    bridgeMethod: 'pcb.listTracks',
    listKey: 'tracks',
    itemSchema: z.object({
      primitiveId: z.string().optional(),
      net: z.string().optional(),
      layer: z.number().optional(),
      startX: z.number().optional(),
      startY: z.number().optional(),
      endX: z.number().optional(),
      endY: z.number().optional(),
      width: z.number().optional(),
      locked: z.boolean().optional(),
    }),
  });

  registerPcbListTool(registry, {
    name: 'easyeda_pcb_vias',
    title: 'List PCB vias',
    description:
      'List vias on the active PCB layout: primitiveId, net, position, hole/outer diameter ' +
      '(native unit, same scale as x/y — not independently verified against a known physical ' +
      'dimension). Requires a focused PCB tab — returns an empty list (not an error) if none is active.',
    bridgeMethod: 'pcb.listVias',
    listKey: 'vias',
    itemSchema: z.object({
      primitiveId: z.string().optional(),
      net: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      holeDiameter: z.number().optional(),
      diameter: z.number().optional(),
      locked: z.boolean().optional(),
    }),
  });

  registerPcbListTool(registry, {
    name: 'easyeda_pcb_zones',
    title: 'List PCB copper zones/pours',
    description:
      'List copper pours (zones) on the active PCB — the primitives that form inner GND/power ' +
      'planes — with net, layer, name, clearance, fill/priority settings, lock state, and a ' +
      'bounded normalized outline polygon. Use it to confirm what easyeda_pcb_add_zone created.',
    bridgeMethod: 'pcb.listZones',
    listKey: 'zones',
    mapItem: normalizeZoneItem,
    itemSchema: z.object({
      primitiveId: z.string(),
      net: z.string(),
      layer: z.number().optional(),
      name: z.string().optional(),
      clearance: z.number().optional(),
      fillStyle: z.number().int().optional(),
      priority: z.number().optional(),
      keepIsland: z.boolean().optional(),
      locked: z.boolean(),
      polygon: pcbPolygonSchema.optional(),
    }),
  });

  registerPcbNetConnectivityTool(registry);
}

export { registerPcbReadTools };
