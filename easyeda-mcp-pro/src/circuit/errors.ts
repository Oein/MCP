/**
 * Circuit-specific validation and compilation errors.
 *
 * These extend the project's existing error pattern (see src/schemas/common.ts)
 * and provide structured, actionable error messages for DesignIntent and CircuitIR
 * validation failures.
 */

import { ZodError } from 'zod';

// ── Error codes ───────────────────────────────────────────────────────────

export const CircuitErrorCode = {
  // DesignIntent validation
  DESIGN_INTENT_INVALID: 'DESIGN_INTENT_INVALID',
  DESIGN_INTENT_MISSING_BLOCKS: 'DESIGN_INTENT_MISSING_BLOCKS',
  DESIGN_INTENT_RAIL_CONFLICT: 'DESIGN_INTENT_RAIL_CONFLICT',

  // CircuitIR validation
  CIRCUIT_IR_INVALID: 'CIRCUIT_IR_INVALID',
  CIRCUIT_IR_BLOCK_DEVICE_MISMATCH: 'CIRCUIT_IR_BLOCK_DEVICE_MISMATCH',
  CIRCUIT_IR_NET_ORPHAN: 'CIRCUIT_IR_NET_ORPHAN',
  CIRCUIT_IR_RAIL_VOLTAGE_MISMATCH: 'CIRCUIT_IR_RAIL_VOLTAGE_MISMATCH',
  CIRCUIT_IR_DUPLICATE_ID: 'CIRCUIT_IR_DUPLICATE_ID',
  CIRCUIT_IR_REFERENCE_MISSING: 'CIRCUIT_IR_REFERENCE_MISSING',

  // Compilation
  COMPILE_FAILED: 'COMPILE_FAILED',
  COMPILE_UNSUPPORTED_BOARD_TYPE: 'COMPILE_UNSUPPORTED_BOARD_TYPE',

  // Internal
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type CircuitErrorCode = (typeof CircuitErrorCode)[keyof typeof CircuitErrorCode];

// ── Structured error ──────────────────────────────────────────────────────

export interface CircuitValidationError {
  code: CircuitErrorCode;
  message: string;
  /** Path to the field that caused the error (dot-notation) */
  path?: string;
  /** Specific details for programmatic handling */
  details?: Record<string, unknown>;
}

export class CircuitError extends Error {
  public readonly code: CircuitErrorCode;
  public readonly errors: CircuitValidationError[];
  public readonly retryable: boolean;

  constructor(opts: {
    code: CircuitErrorCode;
    message: string;
    errors?: CircuitValidationError[];
    retryable?: boolean;
  }) {
    super(opts.message);
    this.name = 'CircuitError';
    this.code = opts.code;
    this.errors = opts.errors ?? [];
    this.retryable = opts.retryable ?? false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wrap a ZodError into a list of CircuitValidationErrors.
 */
export function fromZodError(zodError: ZodError, prefix?: string): CircuitValidationError[] {
  return zodError.issues.map((issue) => ({
    code: 'CIRCUIT_IR_INVALID' as CircuitErrorCode,
    message: issue.message,
    path: prefix ? `${prefix}.${issue.path.join('.')}` : issue.path.join('.'),
    details: {
      code: issue.code,
      expected: issue.message,
      received: (issue as { received?: unknown }).received,
    },
  }));
}

/**
 * Create a single validation error.
 */
export function validationError(
  code: CircuitErrorCode,
  message: string,
  details?: Record<string, unknown>,
): CircuitValidationError {
  return { code, message, details };
}
