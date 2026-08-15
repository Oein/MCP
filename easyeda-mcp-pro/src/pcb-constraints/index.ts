/**
 * PCB constraints — public API barrel.
 *
 * @module
 */

export { PcbConstraintCodeMap } from './errors.js';
export { pcbConstraintIssue, pcbError, pcbWarning } from './errors.js';
export type {
  PcbConstraintCode,
  PcbConstraintIssue,
  PcbConstraintResult,
  PcbConstraintInput,
  ConstraintReport,
} from './types.js';

export { validatePcbConstraints, buildConstraintReport, fromPcbIntent } from './validation.js';
