/**
 * BOM quality — public API barrel.
 *
 * @module
 */

export type {
  SupplierKind,
  PartLifecycle,
  BomEntry,
  SupplierQueryResult,
  BomQualityIssueType,
  BomQualityIssue,
  BomQualityReport,
  BomQualityConfig,
} from './types.js';

export { DEFAULT_BOM_QUALITY_CONFIG } from './types.js';

export type { SupplierAdapter, AdapterMap } from './adapter.js';
export {
  LcscAdapter,
  MouserAdapter,
  DigiKeyAdapter,
  createAdapters,
  availableAdapters,
} from './adapter.js';

export { generateBomQualityReport } from './quality.js';
