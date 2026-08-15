import { z } from 'zod';
import { type EnvConfig } from '../config/env.js';
import { type ToolContext, type ToolDefinition } from './types.js';

/**
 * Batch PCB writes.
 *
 * Deliberately NOT atomic, and it says so in every response: the schematic
 * batch path proved that a partial rollback which itself fails leaves the
 * document in a state the caller cannot reason about. Here each operation is
 * applied and reported independently, so a caller always knows exactly which
 * primitives exist.
 */

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const operationIdSchema = z.string().min(1).max(120);

const trackOperationSchema = z.object({
  operationId: operationIdSchema.optional(),
  kind: z.literal('track'),
  points: z.array(pointSchema).min(2).max(500),
  layer: z.number().int(),
  width: z.number().positive(),
  netName: z.string().optional(),
});

const viaOperationSchema = z.object({
  operationId: operationIdSchema.optional(),
  kind: z.literal('via'),
  x: z.number().finite(),
  y: z.number().finite(),
  outerDiameter: z.number().positive(),
  holeSize: z.number().positive(),
  netName: z.string().optional(),
});

const textOperationSchema = z.object({
  operationId: operationIdSchema.optional(),
  kind: z.literal('text'),
  layer: z.number().int(),
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().min(1),
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
  lineWidth: z.number().positive().optional(),
  rotation: z.number().optional(),
  mirror: z.boolean().optional(),
});

const silkscreenOperationSchema = z.object({
  operationId: operationIdSchema.optional(),
  kind: z.literal('silkscreenLine'),
  layer: z.number().int(),
  startX: z.number().finite(),
  startY: z.number().finite(),
  endX: z.number().finite(),
  endY: z.number().finite(),
  lineWidth: z.number().positive().optional(),
});

const zoneOperationSchema = z.object({
  operationId: operationIdSchema.optional(),
  kind: z.literal('zone'),
  points: z.array(pointSchema).min(3).max(500),
  layer: z.number().int(),
  netName: z.string().optional(),
  clearance: z.number().optional(),
  name: z.string().optional(),
});

const operationSchema = z.discriminatedUnion('kind', [
  trackOperationSchema,
  viaOperationSchema,
  textOperationSchema,
  silkscreenOperationSchema,
  zoneOperationSchema,
]);

type PcbBatchOperation = z.infer<typeof operationSchema>;

const pcbBatchInputSchema = z.object({
  projectId: z.string().optional(),
  operations: z.array(operationSchema).min(1).max(500),
  stopOnError: z
    .boolean()
    .default(true)
    .describe('Stop after the first failed operation instead of continuing with the rest.'),
  confirmWrite: z
    .literal(true)
    .describe('Must be the literal boolean true (not the string "true") to allow this write.'),
});

const pcbBatchResultSchema = z.object({
  index: z.number().int().nonnegative(),
  operationId: z.string().optional(),
  kind: z.string(),
  success: z.boolean(),
  primitiveId: z.string().optional(),
  primitiveIds: z.array(z.string()).optional(),
  skipped: z.boolean().optional(),
  error: z.string().optional(),
});

const pcbBatchOutputSchema = z.object({
  success: z.boolean(),
  atomic: z.literal(false),
  rolled_back: z.literal(false),
  applied_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  skipped_count: z.number().int().nonnegative(),
  results: z.array(pcbBatchResultSchema),
  summary: z.string(),
});

/** Maps one batch operation onto the single-write bridge method it shares with
 *  the corresponding easyeda_pcb_add_* tool — same contracts, same units. */
function bridgeRequest(operation: PcbBatchOperation): {
  method: string;
  params: Record<string, unknown>;
} {
  switch (operation.kind) {
    case 'track':
      return {
        method: 'pcb.addTrack',
        params: {
          points: operation.points,
          layer: operation.layer,
          width: operation.width,
          netName: operation.netName,
        },
      };
    case 'via':
      return {
        method: 'pcb.addVia',
        params: {
          x: operation.x,
          y: operation.y,
          outerDiameter: operation.outerDiameter,
          holeSize: operation.holeSize,
          netName: operation.netName,
        },
      };
    case 'text':
      return {
        method: 'pcb.addText',
        params: {
          layer: operation.layer,
          x: operation.x,
          y: operation.y,
          text: operation.text,
          fontFamily: operation.fontFamily,
          fontSize: operation.fontSize,
          lineWidth: operation.lineWidth,
          rotation: operation.rotation,
          mirror: operation.mirror,
        },
      };
    case 'silkscreenLine':
      return {
        method: 'pcb.addSilkscreenLine',
        params: {
          layer: operation.layer,
          startX: operation.startX,
          startY: operation.startY,
          endX: operation.endX,
          endY: operation.endY,
          lineWidth: operation.lineWidth,
        },
      };
    case 'zone':
      return {
        method: 'pcb.addZone',
        params: {
          points: operation.points,
          layer: operation.layer,
          netName: operation.netName,
          clearance: operation.clearance,
          name: operation.name,
        },
      };
  }
}

function extractIds(result: unknown): { primitiveId?: string; primitiveIds?: string[] } {
  if (typeof result === 'string') return { primitiveId: result };
  if (!result || typeof result !== 'object') return {};
  const data = result as { primitiveId?: unknown; primitiveIds?: unknown; result?: unknown };
  const primitiveIds = Array.isArray(data.primitiveIds)
    ? data.primitiveIds.filter((id): id is string => typeof id === 'string')
    : undefined;
  const primitiveId =
    typeof data.primitiveId === 'string'
      ? data.primitiveId
      : typeof data.result === 'string'
        ? data.result
        : undefined;
  return {
    ...(primitiveId ? { primitiveId } : {}),
    ...(primitiveIds && primitiveIds.length > 0 ? { primitiveIds } : {}),
  };
}

function registerPcbBatchTools(
  registry: { register: (def: ToolDefinition) => void },
  _config: EnvConfig,
) {
  registry.register({
    name: 'easyeda_pcb_batch_write',
    title: 'Write several PCB primitives in one call',
    description:
      'Apply a mixed list of PCB writes (tracks, vias, text, silkscreen lines, copper zones) in ' +
      'one call, using the same native contracts as the single-write tools. Explicitly NOT ' +
      'atomic: every operation is reported individually and successful ones are never rolled ' +
      'back, so the caller always knows which primitives exist.',
    profile: 'full',
    evidence: ['runtime-probe'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: pcbBatchInputSchema,
    outputSchema: pcbBatchOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const parsed = pcbBatchInputSchema.parse(params);
      const results: Array<z.infer<typeof pcbBatchResultSchema>> = [];
      let stopped = false;

      for (const [index, operation] of parsed.operations.entries()) {
        const base = {
          index,
          ...(operation.operationId ? { operationId: operation.operationId } : {}),
          kind: operation.kind,
        };
        if (stopped) {
          results.push({ ...base, success: false, skipped: true });
          continue;
        }
        const request = bridgeRequest(operation);
        try {
          const result = await ctx.bridge.call<Record<string, unknown>, unknown>(
            request.method,
            request.params,
          );
          const ids = extractIds(result);
          if (operation.kind === 'zone' && !ids.primitiveId) {
            throw new Error('The bridge did not return a verified copper-zone primitive id.');
          }
          results.push({ ...base, success: true, ...ids });
        } catch (err) {
          results.push({
            ...base,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
          if (parsed.stopOnError) stopped = true;
        }
      }

      const appliedCount = results.filter((result) => result.success).length;
      const skippedCount = results.filter((result) => result.skipped).length;
      const failedCount = results.length - appliedCount - skippedCount;
      return {
        success: failedCount === 0 && skippedCount === 0,
        atomic: false as const,
        rolled_back: false as const,
        applied_count: appliedCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        results,
        summary:
          failedCount === 0 && skippedCount === 0
            ? `Applied ${appliedCount} PCB write operation(s).`
            : `Applied ${appliedCount}, failed ${failedCount}, skipped ${skippedCount}. ` +
              'Applied operations were kept — delete them explicitly if you need to undo.',
      };
    },
  });
}

export { registerPcbBatchTools };
