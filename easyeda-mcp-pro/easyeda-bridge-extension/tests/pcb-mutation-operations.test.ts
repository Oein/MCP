import { describe, expect, it, vi } from 'vitest';
import { createPcbMutationOperations } from '../src/pcb-mutation-operations.js';

function createOperations() {
  const callFirst = vi.fn(async (_paths: readonly string[], ...args: unknown[]) => ({ args }));
  const deletePrimitives = vi.fn(
    async (ids: string[]): Promise<{ deleted: string[]; notFound: string[] }> => ({
      deleted: ids.filter((id) => id !== 'missing'),
      notFound: ids.filter((id) => id === 'missing'),
    }),
  );
  const addZone = vi.fn(async (params: Record<string, unknown>) => ({
    primitiveId: 'pour-1',
    params,
  }));
  return {
    callFirst,
    deletePrimitives,
    addZone,
    operations: createPcbMutationOperations({ callFirst, deletePrimitives, addZone }),
  };
}

describe('createPcbMutationOperations', () => {
  it('delegates zone creation to the verifying zone operations', async () => {
    const { addZone, callFirst, operations } = createOperations();
    const request = {
      points: [{ x: 0, y: 0 }],
      layer: 1,
      netName: 'GND',
      clearance: 8,
    };

    await expect(operations.addZone(request)).resolves.toMatchObject({ primitiveId: 'pour-1' });
    expect(addZone).toHaveBeenCalledWith(request);
    expect(callFirst).not.toHaveBeenCalled();
  });

  it('modifies components with the existing primitive id and property order', async () => {
    const { callFirst, operations } = createOperations();
    const property = { x: 12, y: 34, rotation: 90, layer: 2, primitiveLock: false };

    await operations.modifyComponent({ primitiveId: 'component-1', property });

    expect(callFirst).toHaveBeenCalledWith(
      ['PCB_PrimitiveComponent.modify', 'pcb_PrimitiveComponent.modify'],
      'component-1',
      property,
    );
  });

  it('rejects component fields outside the verified transform allowlist', async () => {
    const { callFirst, operations } = createOperations();

    await expect(
      operations.modifyComponent({
        primitiveId: 'component-1',
        property: { x: 12, manufacturer: 'not-a-transform-field' },
      }),
    ).rejects.toThrow('Unsupported PCB component transform field: manufacturer');
    await expect(
      operations.modifyComponent({ primitiveId: 'component-1', property: { layer: 12 } }),
    ).rejects.toThrow('PCB component layer must be 1 (top) or 2 (bottom)');
    expect(callFirst).not.toHaveBeenCalled();
  });

  it('rejects malformed values for every verified component transform field class', async () => {
    const { callFirst, operations } = createOperations();

    await expect(
      operations.modifyComponent({ primitiveId: 'component-1', property: [] }),
    ).rejects.toThrow('PCB component transform property must be an object');
    await expect(
      operations.modifyComponent({
        primitiveId: 'component-1',
        property: { primitiveLock: 'false' },
      }),
    ).rejects.toThrow('PCB component primitiveLock must be a boolean');
    await expect(
      operations.modifyComponent({ primitiveId: 'component-1', property: { x: Number.NaN } }),
    ).rejects.toThrow('PCB component x must be a finite number');
    await expect(
      operations.modifyComponent({ primitiveId: 'component-1', property: {} }),
    ).rejects.toThrow('PCB component transform must change at least one supported field');
    expect(callFirst).not.toHaveBeenCalled();
  });

  it('normalizes complete and partial deletion results without throwing', async () => {
    const { deletePrimitives, operations } = createOperations();

    await expect(
      operations.deleteComponents({ primitiveIds: ['component-1', 'missing'] }),
    ).resolves.toEqual({
      success: false,
      deletedCount: 1,
      deleted: ['component-1'],
      notFound: ['missing'],
    });
    expect(deletePrimitives).toHaveBeenCalledWith(['component-1', 'missing']);
  });

  it('treats a non-array primitiveIds value as an empty deletion request', async () => {
    const { deletePrimitives, operations } = createOperations();

    await expect(operations.deleteComponents({ primitiveIds: 'component-1' })).resolves.toEqual({
      success: true,
      deletedCount: 0,
      deleted: [],
      notFound: [],
    });
    expect(deletePrimitives).toHaveBeenCalledWith([]);
  });
});
