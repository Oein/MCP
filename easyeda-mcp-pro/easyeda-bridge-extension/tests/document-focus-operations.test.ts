import { describe, expect, it, vi } from 'vitest';
import { createDocumentFocusOperations } from '../src/document-focus-operations.js';

function createOperations(globals: Record<string, unknown>) {
  const createBridgeError = vi.fn(
    (code: string, message: string) => new Error(`${code}: ${message}`),
  );
  const readFirstPath = <T>(paths: readonly string[]): T | undefined => {
    for (const path of paths) {
      if (path in globals) return globals[path] as T;
    }
    return undefined;
  };
  return {
    createBridgeError,
    operations: createDocumentFocusOperations({ readFirstPath, createBridgeError }),
  };
}

describe('createDocumentFocusOperations', () => {
  it('classifies the focused tab from the per-kind current-document readers', async () => {
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => ({ uuid: 'pcb-1', name: 'Board1' }) },
      DMT_Schematic: { getCurrentSchematicPageInfo: async () => null },
    });

    await expect(operations.getActiveDocument()).resolves.toMatchObject({
      kind: 'pcb',
      uuid: 'pcb-1',
      name: 'Board1',
      pcbAvailable: true,
      schematicAvailable: false,
    });
  });

  it('uses the selected document uuid to disambiguate when both kinds report a current document', async () => {
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => ({ uuid: 'pcb-1' }) },
      DMT_Schematic: { getCurrentSchematicPageInfo: async () => ({ uuid: 'sch-1' }) },
      DMT_SelectControl: { getCurrentDocumentInfo: async () => ({ uuid: 'sch-1' }) },
    });

    await expect(operations.getActiveDocument()).resolves.toMatchObject({
      kind: 'schematic',
      uuid: 'sch-1',
    });
  });

  it('reports no focused document when neither kind is current', async () => {
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => null },
      DMT_Schematic: { getCurrentSchematicPageInfo: async () => null },
    });

    await expect(operations.getActiveDocument()).resolves.toMatchObject({ kind: 'none' });
  });

  it('short-circuits when the requested kind is already focused', async () => {
    const activateDocument = vi.fn();
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => ({ uuid: 'pcb-1' }) },
      DMT_Schematic: { getCurrentSchematicPageInfo: async () => null },
      DMT_EditorControl: { activateDocument },
    });

    await expect(operations.focusDocument({ kind: 'pcb' })).resolves.toMatchObject({
      focused: true,
      alreadyActive: true,
      contract: 'already-active',
    });
    expect(activateDocument).not.toHaveBeenCalled();
  });

  it('activates a document and verifies the switch by re-reading the active tab', async () => {
    let focused: 'pcb' | 'schematic' = 'pcb';
    const activateDocument = vi.fn(async (uuid: unknown) => {
      if (uuid === 'sch-1') focused = 'schematic';
    });
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => (focused === 'pcb' ? { uuid: 'pcb-1' } : null) },
      DMT_Schematic: {
        getCurrentSchematicPageInfo: async () =>
          focused === 'schematic' ? { uuid: 'sch-1', name: 'Schematic1' } : null,
        getAllSchematicsInfo: async () => [{ uuid: 'sch-1', name: 'Schematic1' }],
      },
      DMT_Project: { getCurrentProjectInfo: async () => ({ uuid: 'proj-1' }) },
      DMT_EditorControl: { activateDocument },
    });

    await expect(operations.focusDocument({ kind: 'schematic' })).resolves.toMatchObject({
      focused: true,
      alreadyActive: false,
      uuid: 'sch-1',
      contract: 'activateDocument(uuid)',
    });
    expect(activateDocument).toHaveBeenCalledWith('sch-1');
  });

  it('fails when no candidate call moves focus', async () => {
    const activateDocument = vi.fn(async () => undefined);
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => ({ uuid: 'pcb-1' }) },
      DMT_Schematic: {
        getCurrentSchematicPageInfo: async () => null,
        getAllSchematicsInfo: async () => [{ uuid: 'sch-1' }],
      },
      DMT_EditorControl: { activateDocument },
    });

    await expect(operations.focusDocument({ kind: 'schematic' })).rejects.toThrow(
      'FOCUS_FAILED: Could not focus a schematic document',
    );
    expect(activateDocument).toHaveBeenCalled();
  });

  it('fails with DOCUMENT_NOT_FOUND when the project holds no document of that kind', async () => {
    const { operations } = createOperations({
      DMT_Pcb: { getCurrentPcbInfo: async () => ({ uuid: 'pcb-1' }) },
      DMT_Schematic: {
        getCurrentSchematicPageInfo: async () => null,
        getAllSchematicsInfo: async () => [],
      },
      DMT_EditorControl: { activateDocument: vi.fn() },
    });

    await expect(operations.focusDocument({ kind: 'schematic' })).rejects.toThrow(
      'DOCUMENT_NOT_FOUND',
    );
  });

  it('rejects a kind the bridge does not model', async () => {
    const { operations } = createOperations({});

    await expect(operations.focusDocument({ kind: 'gerber' })).rejects.toThrow(
      'requires kind "pcb" or "schematic"',
    );
  });
});
