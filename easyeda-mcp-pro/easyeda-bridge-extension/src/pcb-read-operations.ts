import type { ApiRuntime } from './api-runtime.js';
import type { BoardInspectionOperations } from './board-inspection.js';
import { logRecoverableError } from './utils.js';

export type PrimitiveStateReader = (value: unknown, key: string) => unknown;

export interface PcbReadOperationDependencies {
  requireActivePcbContext: BoardInspectionOperations['requireActivePcbContext'];
  readFirstPath: ApiRuntime['readFirstPath'];
  readState: PrimitiveStateReader;
}

export interface PcbReadOperations {
  listComponents(limit?: number, offset?: number): Promise<unknown>;
  listFills(limit?: number, offset?: number): Promise<unknown>;
  listPads(limit?: number, offset?: number): Promise<unknown>;
  listZones(limit?: number, offset?: number): Promise<unknown>;
  listRegions(limit?: number, offset?: number): Promise<unknown>;
  listTracks(limit?: number, offset?: number): Promise<unknown>;
  listVias(limit?: number, offset?: number): Promise<unknown>;
  deletePrimitives(primitiveIds: string[]): Promise<{ deleted: string[]; notFound: string[] }>;
}

/**
 * Classes deletePrimitives checks, in lookup order. Confirmed live
 * (2026-07-07): PCB_PrimitiveComponent.delete() returns `true` for ANY id,
 * including ids belonging to other primitive types or ids that do not exist.
 * Membership must therefore be checked through each concrete class before
 * invoking its delete method.
 */
const PCB_DELETABLE_CLASSES = [
  'PCB_PrimitiveComponent',
  'PCB_PrimitiveVia',
  'PCB_PrimitiveLine',
  'PCB_PrimitivePad',
  'PCB_PrimitivePolyline',
  'PCB_PrimitivePour',
  'PCB_PrimitiveArc',
  'PCB_PrimitiveAttribute',
  'PCB_PrimitiveDimension',
  'PCB_PrimitiveFill',
  'PCB_PrimitiveImage',
  'PCB_PrimitiveObject',
  'PCB_PrimitivePoured',
  'PCB_PrimitiveRegion',
  'PCB_PrimitiveString',
] as const;

function paginationEnd(limit: number | undefined, start: number): number | undefined {
  return typeof limit === 'number' ? start + Math.max(1, limit) : undefined;
}

async function polygonSource(
  readState: PrimitiveStateReader,
  value: unknown,
): Promise<unknown[] | undefined> {
  const polygon = readState(value, 'ComplexPolygon');
  if (Array.isArray(polygon)) return polygon;
  if (!polygon || typeof polygon !== 'object') return undefined;
  try {
    const getSource = (polygon as { getSource?: unknown }).getSource;
    const source =
      typeof getSource === 'function'
        ? await (getSource as () => unknown).call(polygon)
        : (polygon as { polygon?: unknown }).polygon;
    return Array.isArray(source) ? source : undefined;
  } catch (error) {
    logRecoverableError('failed to read PCB Fill/Region polygon source', error);
    return undefined;
  }
}

export function createPcbReadOperations({
  requireActivePcbContext,
  readFirstPath,
  readState,
}: PcbReadOperationDependencies): PcbReadOperations {
  async function listComponents(limit?: number, offset = 0): Promise<unknown> {
    await requireActivePcbContext();
    const pcbCompClass = readFirstPath<any>(['PCB_PrimitiveComponent', 'pcb_PrimitiveComponent']);
    if (!pcbCompClass || typeof pcbCompClass.getAll !== 'function') {
      return { total: 0, items: [] };
    }

    const all = (await pcbCompClass.getAll()) || [];
    const start = Math.max(0, offset);
    const items = all.slice(start, paginationEnd(limit, start)).map((component: any) => {
      const footprint = readState(component, 'Footprint') as Record<string, unknown> | undefined;
      const device = readState(component, 'Component') as Record<string, unknown> | undefined;
      return {
        primitiveId: readState(component, 'PrimitiveId') ?? '',
        designator: readState(component, 'Designator') ?? '',
        footprintName: footprint?.name ?? '',
        footprintUuid: footprint?.uuid ?? '',
        footprintLibraryUuid: footprint?.libraryUuid ?? '',
        deviceName: device?.name ?? '',
        x: readState(component, 'X'),
        y: readState(component, 'Y'),
        rotation: readState(component, 'Rotation'),
        layer: readState(component, 'Layer'),
        locked: readState(component, 'PrimitiveLock') ?? false,
      };
    });
    return { total: all.length, items };
  }

  async function listPolygonPrimitives(
    kind: 'Fill' | 'Region',
    limit?: number,
    offset = 0,
  ): Promise<unknown> {
    await requireActivePcbContext();
    const pcbClass = readFirstPath<any>([`PCB_Primitive${kind}`, `pcb_Primitive${kind}`]);
    if (!pcbClass || typeof pcbClass.getAll !== 'function') {
      throw new Error(`PCB_Primitive${kind}.getAll is unavailable in this EasyEDA Pro runtime`);
    }
    const all = (await pcbClass.getAll()) || [];
    const start = Math.max(0, offset);
    const fill = kind === 'Fill';
    const items = await Promise.all(
      all.slice(start, paginationEnd(limit, start)).map(async (value: any) => ({
        primitiveId: readState(value, 'PrimitiveId'),
        layer: readState(value, 'Layer'),
        ...(fill
          ? {
              net: readState(value, 'Net'),
              fillMode: readState(value, 'FillMode'),
            }
          : {
              ruleTypes: readState(value, 'RuleType'),
              regionName: readState(value, 'RegionName'),
            }),
        lineWidth: readState(value, 'LineWidth'),
        locked: readState(value, 'PrimitiveLock'),
        polygonSource: await polygonSource(readState, value),
      })),
    );
    return { total: all.length, items };
  }

  const listFills = (limit?: number, offset = 0) => listPolygonPrimitives('Fill', limit, offset);
  const listRegions = (limit?: number, offset = 0) =>
    listPolygonPrimitives('Region', limit, offset);

  /**
   * Pad geometry is a positional array, not a record — live-confirmed on
   * EasyEDA Pro 3.2.149: `Pad: ["RECT", 31.5, 35.4, 0]` is
   * [shape, width, height, cornerRadius]. Only the leading string and the first
   * two numbers are read; anything else is left to the caller's own inspection.
   */
  function padShapeParts(value: unknown): {
    shape?: string;
    width?: number;
    height?: number;
  } {
    if (!Array.isArray(value)) return {};
    const numbers = value.filter(
      (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
    );
    return {
      shape: typeof value[0] === 'string' ? value[0] : undefined,
      width: numbers[0],
      height: numbers[1],
    };
  }

  /** `Hole` is null on SMD pads. Drilled pads carry the drill size either as a
   *  bare number or inside a positional array, so the first finite number wins. */
  function holeDiameter(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!Array.isArray(value)) return undefined;
    return value.find(
      (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
    );
  }

  async function listPads(limit?: number, offset = 0): Promise<unknown> {
    await requireActivePcbContext();
    const pcbPadClass = readFirstPath<any>(['PCB_PrimitivePad', 'pcb_PrimitivePad']);
    if (!pcbPadClass || typeof pcbPadClass.getAll !== 'function') {
      throw new Error('PCB_PrimitivePad.getAll is unavailable in this EasyEDA Pro runtime');
    }

    const all = (await pcbPadClass.getAll()) || [];
    const start = Math.max(0, offset);
    const items = all.slice(start, paginationEnd(limit, start)).map((pad: any) => {
      const shape = padShapeParts(readState(pad, 'Pad'));
      return {
        primitiveId: readState(pad, 'PrimitiveId') ?? '',
        net: readState(pad, 'Net') ?? '',
        padNumber: readState(pad, 'PadNumber'),
        x: readState(pad, 'X'),
        y: readState(pad, 'Y'),
        layer: readState(pad, 'Layer'),
        // Radians, unlike the degrees used for component rotation.
        rotation: readState(pad, 'Rotation'),
        shape: shape.shape,
        width: shape.width,
        height: shape.height,
        holeDiameter: holeDiameter(readState(pad, 'Hole')),
        // The runtime reports plating explicitly; it is not implied by the hole.
        metallization: readState(pad, 'Metallization'),
        padType: readState(pad, 'PadType'),
        locked: readState(pad, 'PrimitiveLock') ?? false,
      };
    });
    return { total: all.length, items };
  }

  /** Copper pours (zones). Kept separate from Fill/Region: a Pour is the
   *  net-bound copper plane, and it is the only one of the three this bridge
   *  can create. */
  async function listZones(limit?: number, offset = 0): Promise<unknown> {
    await requireActivePcbContext();
    const pcbPourClass = readFirstPath<any>(['PCB_PrimitivePour', 'pcb_PrimitivePour']);
    if (!pcbPourClass || typeof pcbPourClass.getAll !== 'function') {
      throw new Error('PCB_PrimitivePour.getAll is unavailable in this EasyEDA Pro runtime');
    }
    const all = (await pcbPourClass.getAll()) || [];
    const start = Math.max(0, offset);
    const items = await Promise.all(
      all.slice(start, paginationEnd(limit, start)).map(async (pour: any) => ({
        primitiveId: readState(pour, 'PrimitiveId') ?? '',
        net: readState(pour, 'Net') ?? '',
        layer: readState(pour, 'Layer'),
        name: readState(pour, 'Name'),
        clearance: readState(pour, 'Clearance'),
        fillStyle: readState(pour, 'FillStyle'),
        priority: readState(pour, 'Priority'),
        keepIsland: readState(pour, 'KeepIsland'),
        locked: readState(pour, 'PrimitiveLock') ?? false,
        polygonSource: await polygonSource(readState, pour),
      })),
    );
    return { total: all.length, items };
  }

  async function listTracks(limit?: number, offset = 0): Promise<unknown> {
    await requireActivePcbContext();
    // Tracks are PCB_PrimitiveLine segments. PCB_PrimitivePolyline.create()
    // never resolved in the live runtime used to validate pcb.addTrack.
    const pcbLineClass = readFirstPath<any>(['PCB_PrimitiveLine', 'pcb_PrimitiveLine']);
    if (!pcbLineClass || typeof pcbLineClass.getAll !== 'function') {
      return { total: 0, items: [] };
    }

    const all = (await pcbLineClass.getAll()) || [];
    const start = Math.max(0, offset);
    const items = all.slice(start, paginationEnd(limit, start)).map((line: any) => ({
      primitiveId: readState(line, 'PrimitiveId') ?? '',
      net: readState(line, 'Net') ?? '',
      layer: readState(line, 'Layer'),
      startX: readState(line, 'StartX'),
      startY: readState(line, 'StartY'),
      endX: readState(line, 'EndX'),
      endY: readState(line, 'EndY'),
      width: readState(line, 'LineWidth'),
      locked: readState(line, 'PrimitiveLock') ?? false,
    }));
    return { total: all.length, items };
  }

  async function listVias(limit?: number, offset = 0): Promise<unknown> {
    await requireActivePcbContext();
    const pcbViaClass = readFirstPath<any>(['PCB_PrimitiveVia', 'pcb_PrimitiveVia']);
    if (!pcbViaClass || typeof pcbViaClass.getAll !== 'function') {
      return { total: 0, items: [] };
    }

    const all = (await pcbViaClass.getAll()) || [];
    const start = Math.max(0, offset);
    const items = all.slice(start, paginationEnd(limit, start)).map((via: any) => ({
      primitiveId: readState(via, 'PrimitiveId') ?? '',
      net: readState(via, 'Net') ?? '',
      x: readState(via, 'X'),
      y: readState(via, 'Y'),
      holeDiameter: readState(via, 'HoleDiameter'),
      diameter: readState(via, 'Diameter'),
      locked: readState(via, 'PrimitiveLock') ?? false,
    }));
    return { total: all.length, items };
  }

  async function deletePrimitives(
    primitiveIds: string[],
  ): Promise<{ deleted: string[]; notFound: string[] }> {
    const remaining = new Set(primitiveIds);
    const deleted: string[] = [];

    for (const className of PCB_DELETABLE_CLASSES) {
      if (remaining.size === 0) break;
      const primitiveClass = readFirstPath<any>([className]);
      if (
        !primitiveClass ||
        typeof primitiveClass.getAllPrimitiveId !== 'function' ||
        typeof primitiveClass.delete !== 'function'
      ) {
        continue;
      }

      let ownedIds: Set<string>;
      try {
        ownedIds = new Set((await primitiveClass.getAllPrimitiveId()) ?? []);
      } catch (error) {
        logRecoverableError(`pcb.deleteComponent: ${className}.getAllPrimitiveId failed`, error);
        continue;
      }

      const matches = [...remaining].filter((id) => ownedIds.has(id));
      if (matches.length === 0) continue;
      try {
        await primitiveClass.delete(matches);
        for (const id of matches) {
          remaining.delete(id);
          deleted.push(id);
        }
      } catch (error) {
        logRecoverableError(`pcb.deleteComponent: ${className}.delete failed`, error);
      }
    }

    return { deleted, notFound: [...remaining] };
  }

  return {
    listComponents,
    listFills,
    listPads,
    listRegions,
    listTracks,
    listVias,
    listZones,
    deletePrimitives,
  };
}
