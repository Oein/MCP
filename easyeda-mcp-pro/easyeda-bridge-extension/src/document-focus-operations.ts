import type { ApiRuntime } from './api-runtime.js';
import { isRecord, logRecoverableError } from './utils.js';

export type DocumentKind = 'pcb' | 'schematic';

export interface ActiveDocumentInfo {
  kind: DocumentKind | 'unknown' | 'none';
  uuid?: string;
  name?: string;
  projectUuid?: string;
  pcbAvailable: boolean;
  schematicAvailable: boolean;
}

export interface DocumentFocusOperations {
  getActiveDocument(): Promise<ActiveDocumentInfo>;
  focusDocument(params: Record<string, unknown>): Promise<{
    focused: boolean;
    kind: DocumentKind;
    uuid?: string;
    name?: string;
    contract: string;
    alreadyActive: boolean;
    attempts: string[];
  }>;
}

export interface DocumentFocusDependencies {
  readFirstPath: ApiRuntime['readFirstPath'];
  createBridgeError: (
    code: string,
    message: string,
    remediation: string,
    details?: unknown,
  ) => Error;
}

function readText(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  return undefined;
}

async function callSafely(target: unknown, method: string, ...args: unknown[]): Promise<unknown> {
  if (!isRecord(target)) return undefined;
  const fn = target[method];
  if (typeof fn !== 'function') return undefined;
  try {
    return await (fn as (...values: unknown[]) => unknown).call(target, ...args);
  } catch (error) {
    logRecoverableError(`${method} failed`, error);
    return undefined;
  }
}

const SELECTED_UUID_KEYS = [
  'uuid',
  'documentUuid',
  'pcbUuid',
  'schematicUuid',
  'schematicPageUuid',
];
const DOCUMENT_UUID_KEYS = ['uuid', 'pcbUuid', 'schematicPageUuid', 'documentUuid'];

function classifyActiveKind(input: {
  pcb: unknown;
  schematic: unknown;
  selected: unknown;
  selectedUuid?: string;
}): ActiveDocumentInfo['kind'] {
  const selectedType = (
    readText(input.selected, ['type', 'documentType', 'docType']) ?? ''
  ).toLowerCase();
  if (selectedType.includes('pcb')) return 'pcb';
  if (selectedType.includes('sch')) return 'schematic';
  if (input.selectedUuid) {
    if (input.selectedUuid === readText(input.pcb, ['uuid', 'pcbUuid', 'documentUuid'])) {
      return 'pcb';
    }
    if (
      input.selectedUuid ===
      readText(input.schematic, ['uuid', 'schematicUuid', 'schematicPageUuid', 'documentUuid'])
    ) {
      return 'schematic';
    }
  }
  if (input.pcb && !input.schematic) return 'pcb';
  if (input.schematic && !input.pcb) return 'schematic';
  return input.pcb || input.schematic ? 'unknown' : 'none';
}

export function createDocumentFocusOperations({
  readFirstPath,
  createBridgeError,
}: DocumentFocusDependencies): DocumentFocusOperations {
  const dmtPcb = () => readFirstPath<any>(['DMT_Pcb', 'dmt_Pcb']);
  const dmtSchematic = () => readFirstPath<any>(['DMT_Schematic', 'dmt_Schematic']);
  const dmtSelect = () => readFirstPath<any>(['DMT_SelectControl', 'dmt_SelectControl']);
  const dmtEditor = () => readFirstPath<any>(['DMT_EditorControl', 'dmt_EditorControl']);
  const dmtProject = () => readFirstPath<any>(['DMT_Project', 'dmt_Project']);

  async function currentPcb(): Promise<unknown> {
    return callSafely(dmtPcb(), 'getCurrentPcbInfo');
  }

  async function currentSchematic(): Promise<unknown> {
    const schematic = dmtSchematic();
    return (
      (await callSafely(schematic, 'getCurrentSchematicPageInfo')) ??
      (await callSafely(schematic, 'getCurrentSchematicInfo'))
    );
  }

  /** Classify the focused tab. `getCurrentDocumentInfo` is authoritative when it
   *  reports a uuid; otherwise the per-kind "current" readers decide, which is
   *  the same signal `requireActivePcbContext` already trusts. */
  async function getActiveDocument(): Promise<ActiveDocumentInfo> {
    const [pcb, schematic] = await Promise.all([currentPcb(), currentSchematic()]);
    const selected = await callSafely(dmtSelect(), 'getCurrentDocumentInfo');
    const selectedUuid = readText(selected, SELECTED_UUID_KEYS);
    const kind = classifyActiveKind({ pcb, schematic, selected, selectedUuid });
    const source =
      kind === 'pcb' ? pcb : kind === 'schematic' ? schematic : (selected ?? undefined);
    return {
      kind,
      uuid: readText(source, DOCUMENT_UUID_KEYS) ?? selectedUuid,
      name: readText(source, ['name', 'friendlyName', 'title']),
      projectUuid: readText(source, ['projectUuid', 'projectId']),
      pcbAvailable: Boolean(pcb),
      schematicAvailable: Boolean(schematic),
    };
  }

  async function listDocuments(kind: DocumentKind, projectUuid?: string): Promise<unknown[]> {
    const target = kind === 'pcb' ? dmtPcb() : dmtSchematic();
    const method = kind === 'pcb' ? 'getAllPcbsInfo' : 'getAllSchematicsInfo';
    for (const args of projectUuid ? [[projectUuid], []] : [[]]) {
      const listed = await callSafely(target, method, ...args);
      if (Array.isArray(listed) && listed.length > 0) return listed;
      if (isRecord(listed)) {
        const items = Object.values(listed).filter((value) => isRecord(value));
        if (items.length > 0) return items;
      }
    }
    return [];
  }

  async function resolveProjectUuid(explicit?: string): Promise<string | undefined> {
    if (explicit) return explicit;
    const info = await callSafely(dmtProject(), 'getCurrentProjectInfo');
    return readText(info, ['uuid', 'projectUuid', 'projectId']);
  }

  async function resolveTarget(
    kind: DocumentKind,
    requestedUuid: string | undefined,
    requestedName: string | undefined,
    projectUuid: string | undefined,
  ): Promise<{ uuid?: string; name?: string }> {
    if (requestedUuid) return { uuid: requestedUuid, name: requestedName };
    const documents = await listDocuments(kind, projectUuid);
    const matched = requestedName
      ? documents.find((document) => readText(document, ['name', 'friendlyName']) === requestedName)
      : documents[0];
    return {
      uuid: readText(matched, ['uuid', 'pcbUuid', 'schematicUuid', 'documentUuid']),
      name: readText(matched, ['name', 'friendlyName']),
    };
  }

  /** `activateDocument`'s argument shape is not documented, so each candidate
   *  call is verified by re-reading the active document; a call that does not
   *  move focus counts as a failed attempt. */
  async function activateUntilFocused(
    kind: DocumentKind,
    targetUuid: string,
    projectUuid: string | undefined,
    attempts: string[],
  ): Promise<{ contract: string; active: ActiveDocumentInfo } | undefined> {
    const editor = dmtEditor();
    const candidates: Array<{ name: string; args: unknown[] }> = [
      { name: 'activateDocument(uuid)', args: [targetUuid] },
      { name: 'activateDocument({uuid})', args: [{ uuid: targetUuid }] },
      ...(projectUuid
        ? [{ name: 'activateDocument(projectUuid,uuid)', args: [projectUuid, targetUuid] }]
        : []),
    ];
    for (const candidate of candidates) {
      attempts.push(candidate.name);
      await callSafely(editor, 'activateDocument', ...candidate.args);
      const active = await getActiveDocument();
      if (active.kind === kind && (!active.uuid || active.uuid === targetUuid)) {
        return { contract: candidate.name, active };
      }
    }
    return undefined;
  }

  async function focusDocument(params: Record<string, unknown>) {
    const kind: DocumentKind | null =
      params.kind === 'pcb' ? 'pcb' : params.kind === 'schematic' ? 'schematic' : null;
    if (!kind) throw new TypeError('focusDocument requires kind "pcb" or "schematic"');

    const active = await getActiveDocument();
    const requestedUuid = typeof params.documentUuid === 'string' ? params.documentUuid : undefined;
    if (active.kind === kind && (!requestedUuid || requestedUuid === active.uuid)) {
      return {
        focused: true,
        kind,
        uuid: active.uuid,
        name: active.name,
        contract: 'already-active',
        alreadyActive: true,
        attempts: [],
      };
    }

    const projectUuid = await resolveProjectUuid(
      typeof params.projectUuid === 'string' ? params.projectUuid : undefined,
    );
    const target = await resolveTarget(
      kind,
      requestedUuid,
      typeof params.name === 'string' ? params.name : undefined,
      projectUuid,
    );
    if (!target.uuid) {
      throw createBridgeError(
        'DOCUMENT_NOT_FOUND',
        `No ${kind} document was found to focus.`,
        `Open the ${kind} document in EasyEDA Pro once, then retry.`,
        { projectUuid },
      );
    }

    const attempts: string[] = [];
    const activated = await activateUntilFocused(kind, target.uuid, projectUuid, attempts);
    if (activated) {
      return {
        focused: true,
        kind,
        uuid: activated.active.uuid ?? target.uuid,
        name: activated.active.name ?? target.name,
        contract: activated.contract,
        alreadyActive: false,
        attempts,
      };
    }

    throw createBridgeError(
      'FOCUS_FAILED',
      `Could not focus a ${kind} document; the active tab did not change.`,
      `Click the ${kind} tab in EasyEDA Pro, then retry.`,
      { attempts, targetUuid: target.uuid },
    );
  }

  return { getActiveDocument, focusDocument };
}
