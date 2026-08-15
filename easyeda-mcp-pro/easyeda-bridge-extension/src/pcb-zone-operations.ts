import type { ApiRuntime } from './api-runtime.js';
import type { PrimitiveStateReader } from './pcb-read-operations.js';
import { isRecord, logRecoverableError } from './utils.js';

export interface PcbZoneOperationDependencies {
  readFirstPath: ApiRuntime['readFirstPath'];
  readState: PrimitiveStateReader;
  deletePrimitives(ids: string[]): Promise<{ deleted: string[]; notFound: string[] }>;
}

export interface PcbZoneCreationResult {
  primitiveId: string;
  contract: string;
  polygonForm: string;
  attempts: string[];
}

export interface PcbZoneOperations {
  addZone(params: Record<string, unknown>): Promise<PcbZoneCreationResult>;
}

interface ZoneRequest {
  points: Array<{ x: number; y: number }>;
  layer: number;
  netName: string;
  clearance: number;
  name: string;
}

/**
 * Argument tails tried after the polygon value, in order. The live runtime
 * rejects `PCB_PrimitivePour.create` with `无法创建覆铜边框图元` for every
 * incomplete or mis-ordered form without saying which argument is wrong, so the
 * contract is recovered by attempting each candidate and verifying the result by
 * native read-back. Nothing here is asserted to be the documented signature: a
 * candidate counts only when the created pour reads back with the requested
 * layer and net.
 */
const ZONE_ARGUMENT_CONTRACTS: Array<{
  name: string;
  build: (request: ZoneRequest) => unknown[];
}> = [
  {
    name: 'layer,net,clearance',
    build: (request) => [request.layer, request.netName, request.clearance],
  },
  {
    name: 'layer,net,clearance,keepIsland,fillStyle,spacing,priority,name',
    build: (request) => [
      request.layer,
      request.netName,
      request.clearance,
      true,
      0,
      10,
      1,
      request.name,
    ],
  },
  {
    name: 'layer,net,clearance,fillStyle,spacing,keepIsland,priority,name',
    build: (request) => [
      request.layer,
      request.netName,
      request.clearance,
      0,
      10,
      true,
      1,
      request.name,
    ],
  },
  {
    name: 'layer,net,clearance,name',
    build: (request) => [request.layer, request.netName, request.clearance, request.name],
  },
];

function flatCoordinates(points: Array<{ x: number; y: number }>): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function pairCoordinates(points: Array<{ x: number; y: number }>): number[][] {
  return points.map((point) => [point.x, point.y]);
}

function parseZoneRequest(params: Record<string, unknown>): ZoneRequest {
  const rawPoints = Array.isArray(params.points) ? params.points : [];
  const points = rawPoints.flatMap((point) => {
    if (!isRecord(point)) return [];
    const { x, y } = point;
    if (typeof x !== 'number' || !Number.isFinite(x)) return [];
    if (typeof y !== 'number' || !Number.isFinite(y)) return [];
    return [{ x, y }];
  });
  if (points.length < 3) {
    throw new Error('A copper zone outline needs at least three finite points');
  }
  if (typeof params.layer !== 'number' || !Number.isInteger(params.layer)) {
    throw new Error('A copper zone needs an integer layer id');
  }
  return {
    points,
    layer: params.layer,
    netName: typeof params.netName === 'string' ? params.netName : '',
    clearance: typeof params.clearance === 'number' ? params.clearance : 8,
    name: typeof params.name === 'string' ? params.name : '',
  };
}

export function createPcbZoneOperations({
  readFirstPath,
  readState,
  deletePrimitives,
}: PcbZoneOperationDependencies): PcbZoneOperations {
  function pourClass(): any {
    const pour = readFirstPath<any>(['PCB_PrimitivePour', 'pcb_PrimitivePour']);
    if (!pour || typeof pour.create !== 'function') {
      throw new Error('PCB_PrimitivePour.create is unavailable in this EasyEDA Pro runtime');
    }
    return pour;
  }

  /** Candidate polygon representations, most structured first. Fill/Region
   *  primitives read their geometry back as a `ComplexPolygon`, so the native
   *  math helper is tried before the raw coordinate forms. */
  async function polygonForms(
    request: ZoneRequest,
  ): Promise<Array<{ name: string; value: unknown }>> {
    const forms: Array<{ name: string; value: unknown }> = [];
    const math = readFirstPath<any>(['PCB_MathPolygon', 'pcb_MathPolygon']);
    if (math && typeof math.createPolygon === 'function') {
      for (const [name, source] of [
        ['pairs', pairCoordinates(request.points)],
        ['flat', flatCoordinates(request.points)],
      ] as const) {
        try {
          const polygon = await math.createPolygon(source);
          if (polygon === undefined || polygon === null) continue;
          if (typeof math.createComplexPolygon === 'function') {
            try {
              const complex = await math.createComplexPolygon([polygon]);
              if (complex !== undefined && complex !== null) {
                forms.push({ name: `complexPolygon(${name})`, value: complex });
              }
            } catch (error) {
              logRecoverableError('PCB_MathPolygon.createComplexPolygon failed', error);
            }
          }
          forms.push({ name: `polygon(${name})`, value: polygon });
        } catch (error) {
          logRecoverableError('PCB_MathPolygon.createPolygon failed', error);
        }
      }
    }
    forms.push({ name: 'pairs', value: pairCoordinates(request.points) });
    forms.push({ name: 'flat', value: flatCoordinates(request.points) });
    return forms;
  }

  async function existingIds(pour: any): Promise<Set<string>> {
    if (typeof pour.getAllPrimitiveId !== 'function') return new Set();
    try {
      return new Set<string>((await pour.getAllPrimitiveId()) ?? []);
    } catch (error) {
      logRecoverableError('PCB_PrimitivePour.getAllPrimitiveId failed', error);
      return new Set();
    }
  }

  /** A created pour counts only when it reads back on the requested layer and
   *  net. Anything else is treated as a failed attempt and removed. */
  async function verifyCreatedZone(
    pour: any,
    request: ZoneRequest,
    primitiveId: string,
  ): Promise<boolean> {
    if (typeof pour.get !== 'function') return false;
    let created: unknown;
    try {
      created = await pour.get(primitiveId);
    } catch (error) {
      logRecoverableError('PCB_PrimitivePour.get failed during zone verification', error);
      return false;
    }
    if (!created) return false;
    if (readState(created, 'Layer') !== request.layer) return false;
    const net = readState(created, 'Net');
    return (typeof net === 'string' ? net : '') === request.netName;
  }

  async function newlyCreatedIds(pour: any, before: Set<string>): Promise<string[]> {
    const after = await existingIds(pour);
    return [...after].filter((id) => !before.has(id));
  }

  async function attemptZone(
    pour: any,
    request: ZoneRequest,
    polygon: unknown,
    contractArgs: unknown[],
  ): Promise<string | undefined> {
    const before = await existingIds(pour);
    let returned: unknown;
    try {
      returned = await pour.create(polygon, ...contractArgs);
    } catch (error) {
      logRecoverableError('PCB_PrimitivePour.create attempt failed', error);
      // A throwing attempt can still have left a partial primitive behind.
      const orphans = await newlyCreatedIds(pour, before);
      if (orphans.length > 0) await deletePrimitives(orphans);
      return undefined;
    }

    const created = await newlyCreatedIds(pour, before);
    const candidates = typeof returned === 'string' && returned ? [returned, ...created] : created;
    for (const primitiveId of candidates) {
      if (await verifyCreatedZone(pour, request, primitiveId)) {
        const extra = created.filter((id) => id !== primitiveId);
        if (extra.length > 0) await deletePrimitives(extra);
        return primitiveId;
      }
    }
    if (created.length > 0) await deletePrimitives(created);
    return undefined;
  }

  async function addZone(params: Record<string, unknown>): Promise<PcbZoneCreationResult> {
    const request = parseZoneRequest(params);
    const pour = pourClass();
    const attempts: string[] = [];

    for (const form of await polygonForms(request)) {
      for (const contract of ZONE_ARGUMENT_CONTRACTS) {
        const label = `${form.name}+${contract.name}`;
        attempts.push(label);
        const primitiveId = await attemptZone(pour, request, form.value, contract.build(request));
        if (primitiveId) {
          return { primitiveId, contract: contract.name, polygonForm: form.name, attempts };
        }
      }
    }

    throw new Error(
      `PCB_PrimitivePour.create did not produce a verifiable copper zone. Attempted contracts: ${attempts.join(', ')}`,
    );
  }

  return { addZone };
}
