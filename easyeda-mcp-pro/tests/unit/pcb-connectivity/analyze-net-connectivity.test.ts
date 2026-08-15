import { describe, it, expect } from 'vitest';
import {
  analyzeNetConnectivity,
  type ConnectivityPad,
  type ConnectivityTrack,
} from '../../../src/pcb-connectivity/index.js';

function pad(
  primitiveId: string,
  x: number,
  y: number,
  overrides: Partial<ConnectivityPad> = {},
): ConnectivityPad {
  return { primitiveId, x, y, layer: 1, ...overrides };
}

function track(
  primitiveId: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  layer = 1,
): ConnectivityTrack {
  return { primitiveId, startX, startY, endX, endY, layer };
}

describe('analyzeNetConnectivity', () => {
  it('reports one complete group when copper joins every pad', () => {
    const result = analyzeNetConnectivity({
      net: 'GND',
      pads: [pad('p1', 0, 0), pad('p2', 100, 0)],
      tracks: [track('t1', 0, 0, 50, 0), track('t2', 50, 0, 100, 0)],
      vias: [],
    });

    expect(result.complete).toBe(true);
    expect(result.group_count).toBe(1);
    expect(result.pad_group_count).toBe(1);
    expect(result.groups[0]).toMatchObject({ index: 0, pad_count: 2 });
    expect(result.groups[0]?.tracks).toEqual(['t1', 't2']);
    expect(result.summary).toContain('physically complete');
  });

  it('splits a net whose copper has a gap wider than the tolerance', () => {
    const result = analyzeNetConnectivity({
      net: 'OLED_IREF',
      pads: [pad('p1', 0, 0), pad('p2', 100, 0)],
      tracks: [track('t1', 0, 0, 49, 0), track('t2', 51, 0, 100, 0)],
      vias: [],
      tolerance: 1,
    });

    expect(result.complete).toBe(false);
    expect(result.pad_group_count).toBe(2);
    expect(result.groups.map((group) => group.pads)).toEqual([['p1'], ['p2']]);
  });

  it('closes a sub-tolerance gap so a 1 mil offset does not read as a break', () => {
    const result = analyzeNetConnectivity({
      net: 'D+',
      pads: [pad('p1', 0, 0), pad('p2', 100, 0)],
      tracks: [track('t1', 0, 0, 50, 0), track('t2', 50.5, 0, 100, 0)],
      vias: [],
      tolerance: 1,
    });

    expect(result.complete).toBe(true);
  });

  it('keeps different layers apart unless a via or plated pad bridges them', () => {
    const split = analyzeNetConnectivity({
      net: '3V3',
      pads: [pad('p1', 0, 0, { layer: 1 }), pad('p2', 100, 0, { layer: 2 })],
      tracks: [track('t1', 0, 0, 100, 0, 1), track('t2', 100, 0, 100, 0, 2)],
      vias: [],
    });
    expect(split.complete).toBe(false);
    expect(split.pad_group_count).toBe(2);

    const stitched = analyzeNetConnectivity({
      net: '3V3',
      pads: [pad('p1', 0, 0, { layer: 1 }), pad('p2', 100, 0, { layer: 2 })],
      tracks: [track('t1', 0, 0, 100, 0, 1)],
      vias: [{ primitiveId: 'v1', x: 100, y: 0 }],
    });
    expect(stitched.complete).toBe(true);
    expect(stitched.groups[0]?.vias).toEqual(['v1']);
  });

  it('treats a plated through-hole pad as present on every layer', () => {
    const result = analyzeNetConnectivity({
      net: 'GND',
      pads: [pad('tht', 0, 0, { layer: 1, holeDiameter: 12 })],
      tracks: [track('t1', 0, 0, 100, 0, 2)],
      vias: [],
    });

    expect(result.complete).toBe(true);
    expect(result.groups[0]?.pads).toEqual(['tht']);
  });

  it('flags pads that carry no copper and copper that reaches no pad', () => {
    const result = analyzeNetConnectivity({
      net: 'BTN_YES',
      pads: [pad('p1', 0, 0), pad('p2', 500, 500)],
      tracks: [track('t1', 0, 0, 10, 0), track('t2', 900, 900, 950, 900)],
      vias: [],
    });

    expect(result.isolated_pads).toEqual(['p2']);
    expect(result.stray_group_indexes).toHaveLength(1);
    const strayIndex = result.stray_group_indexes[0] as number;
    expect(result.groups[strayIndex]?.tracks).toEqual(['t2']);
    expect(result.summary).toContain('carry no copper');
  });

  it('reports a net without pads as incomplete instead of trivially complete', () => {
    const result = analyzeNetConnectivity({
      net: 'GNDPLANE',
      pads: [],
      tracks: [track('t1', 0, 0, 100, 0)],
      vias: [],
    });

    expect(result.complete).toBe(false);
    expect(result.pad_count).toBe(0);
    expect(result.summary).toContain('no pads');
  });

  it('does not merge primitives whose layer the runtime did not report', () => {
    const result = analyzeNetConnectivity({
      net: 'GND',
      pads: [pad('p1', 0, 0, { layer: undefined }), pad('p2', 0, 0, { layer: undefined })],
      tracks: [],
      vias: [],
    });

    expect(result.pad_group_count).toBe(2);
  });
});
