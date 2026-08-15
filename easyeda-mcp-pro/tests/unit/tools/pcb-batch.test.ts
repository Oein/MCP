import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';
import { registerPcbBatchTools } from '../../../src/tools/L1_pcb_batch.js';
import { EnvSchema } from '../../../src/config/env.js';

describe('easyeda_pcb_batch_write', () => {
  let registry: ToolRegistry;
  let context: ToolContext;
  let bridgeCall: ReturnType<
    typeof vi.fn<(method: string, params?: unknown, opts?: unknown) => Promise<unknown>>
  >;

  beforeEach(() => {
    registry = new ToolRegistry();
    registerPcbBatchTools(registry, EnvSchema.parse({ NODE_ENV: 'test' }));
    bridgeCall = vi.fn();
    context = {
      profile: 'full',
      bridge: { connected: true, call: bridgeCall },
      config: {
        bridgeTimeoutMs: 1000,
        artifactDir: '.easyeda-mcp-pro/artifacts',
        bridgeHost: '127.0.0.1',
        bridgePort: 49620,
      },
      vendors: { lcsc: null, jlcpcb: null, mouser: null, digikey: null },
    };
  });

  const track = {
    operationId: 'gnd-stub',
    kind: 'track' as const,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    layer: 2,
    width: 8,
    netName: 'GND',
  };
  const via = {
    kind: 'via' as const,
    x: 100,
    y: 0,
    outerDiameter: 24,
    holeSize: 12,
    netName: 'GND',
  };

  it('maps every operation kind onto its single-write bridge method', async () => {
    const tool = registry.get('easyeda_pcb_batch_write');
    bridgeCall.mockResolvedValue({ primitiveId: 'p1' });

    await tool?.handler(context, {
      operations: [
        track,
        via,
        { kind: 'text', layer: 3, x: 5, y: 6, text: 'BOOT' },
        { kind: 'silkscreenLine', layer: 3, startX: 0, startY: 0, endX: 10, endY: 0 },
      ],
      confirmWrite: true,
    });

    expect(bridgeCall.mock.calls.map((call) => call[0])).toEqual([
      'pcb.addTrack',
      'pcb.addVia',
      'pcb.addText',
      'pcb.addSilkscreenLine',
    ]);
  });

  it('reports each result individually and never claims atomicity', async () => {
    const tool = registry.get('easyeda_pcb_batch_write');
    bridgeCall.mockResolvedValueOnce({ primitiveIds: ['t1', 't2'] }).mockResolvedValueOnce('v1');

    const result = await tool?.handler(context, {
      operations: [track, via],
      confirmWrite: true,
    });

    expect(result).toMatchObject({
      success: true,
      atomic: false,
      rolled_back: false,
      applied_count: 2,
      failed_count: 0,
    });
    expect(result?.results).toEqual([
      {
        index: 0,
        operationId: 'gnd-stub',
        kind: 'track',
        success: true,
        primitiveIds: ['t1', 't2'],
      },
      { index: 1, kind: 'via', success: true, primitiveId: 'v1' },
    ]);
  });

  it('stops after the first failure by default and marks the rest skipped', async () => {
    const tool = registry.get('easyeda_pcb_batch_write');
    bridgeCall.mockRejectedValueOnce(new Error('native track rejected')).mockResolvedValue('v1');

    const result = await tool?.handler(context, {
      operations: [track, via],
      confirmWrite: true,
    });

    expect(result).toMatchObject({
      success: false,
      applied_count: 0,
      failed_count: 1,
      skipped_count: 1,
    });
    expect(bridgeCall).toHaveBeenCalledTimes(1);
    expect(result?.summary).toContain('Applied operations were kept');
  });

  it('continues past failures when stopOnError is false', async () => {
    const tool = registry.get('easyeda_pcb_batch_write');
    bridgeCall.mockRejectedValueOnce(new Error('native track rejected')).mockResolvedValue('v1');

    const result = await tool?.handler(context, {
      operations: [track, via],
      stopOnError: false,
      confirmWrite: true,
    });

    expect(result).toMatchObject({ applied_count: 1, failed_count: 1, skipped_count: 0 });
    expect(bridgeCall).toHaveBeenCalledTimes(2);
  });

  it('treats an unverified zone as a failed operation', async () => {
    const tool = registry.get('easyeda_pcb_batch_write');
    bridgeCall.mockResolvedValue({});

    const result = await tool?.handler(context, {
      operations: [
        {
          kind: 'zone',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
          layer: 14,
          netName: 'GND',
        },
      ],
      confirmWrite: true,
    });

    expect(result).toMatchObject({ success: false, failed_count: 1 });
    expect((result?.results as Array<Record<string, unknown>>)[0]?.error).toContain(
      'verified copper-zone primitive id',
    );
  });
});
