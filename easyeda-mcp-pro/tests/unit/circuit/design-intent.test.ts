import { describe, it, expect } from 'vitest';
import {
  DesignIntentSchema,
  validateDesignIntent,
  isDesignIntent,
  DESIGN_INTENT_SCHEMA_VERSION,
} from '../../../src/circuit/design-intent.js';
import { BoardType } from '../../../src/circuit/types.js';
import { CircuitError, CircuitErrorCode } from '../../../src/circuit/errors.js';

// ── Helpers ───────────────────────────────────────────────────────────────

const minimalValid = {
  $schema: DESIGN_INTENT_SCHEMA_VERSION,
  project: {
    name: 'ESP32-S3 Sensor Board',
    goal: 'A low-power sensor board with I2C environmental sensors',
    boardType: BoardType.SensorBoard,
  },
  requirements: {
    functionalBlocks: [
      {
        id: 'req-mcu',
        name: 'Microcontroller',
        type: 'microcontroller',
        purpose: 'Main processing unit with WiFi and Bluetooth',
      },
      {
        id: 'req-sensor',
        name: 'Environmental Sensor',
        type: 'sensor',
        purpose: 'Temperature, humidity, and pressure sensing',
      },
    ],
    power: {
      rails: [
        { id: '3V3', voltage: 3.3, maxCurrentAmps: 0.5 },
        { id: 'VIN', voltage: 5.0, maxCurrentAmps: 1.0 },
      ],
    },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('DesignIntentSchema', () => {
  it('validates a minimal valid DesignIntent', () => {
    const result = DesignIntentSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.$schema).toBe(DESIGN_INTENT_SCHEMA_VERSION);
      expect(result.data.project.name).toBe('ESP32-S3 Sensor Board');
      expect(result.data.requirements.functionalBlocks).toHaveLength(2);
      expect(result.data.requirements.power.rails).toHaveLength(2);
    }
  });

  it('rejects DesignIntent with no functional blocks', () => {
    const invalid = {
      ...minimalValid,
      requirements: {
        ...minimalValid.requirements,
        functionalBlocks: [],
      },
    };
    const result = DesignIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects DesignIntent with no power rails', () => {
    const invalid = {
      ...minimalValid,
      requirements: {
        ...minimalValid.requirements,
        power: { rails: [] },
      },
    };
    const result = DesignIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects DesignIntent with empty project name', () => {
    const invalid = {
      ...minimalValid,
      project: { ...minimalValid.project, name: '' },
    };
    const result = DesignIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects DesignIntent with invalid board type', () => {
    const invalid = {
      ...minimalValid,
      project: { ...minimalValid.project, boardType: 'invalid-board' },
    };
    const result = DesignIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts DesignIntent with all optional fields populated', () => {
    const full = {
      ...minimalValid,
      requirements: {
        ...minimalValid.requirements,
        electrical: {
          vinMin: 4.5,
          vinMax: 5.5,
          currentMaxAmps: 0.8,
          notes: 'USB bus-powered',
        },
        mechanical: {
          widthMm: 60,
          heightMm: 40,
          layers: 2,
          mountingHoles: true,
        },
        manufacturing: {
          volume: 'prototype',
          process: 'lead-free',
          timelineWeeks: 4,
        },
        safety: {
          isolation: false,
          certifications: ['CE'],
        },
      },
      assumptions: ['USB port provides 5V at 500mA'],
      unknowns: ['Final BOM cost target'],
    };
    const result = DesignIntentSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assumptions).toHaveLength(1);
      expect(result.data.unknowns).toHaveLength(1);
      expect(result.data.requirements.electrical.vinMin).toBe(4.5);
    }
  });

  it('rejects extra fields via strict mode', () => {
    const invalid = { ...minimalValid, extraField: 'not allowed' };
    const result = DesignIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('validateDesignIntent', () => {
  it('returns validated DesignIntent on valid input', () => {
    const result = validateDesignIntent(minimalValid);
    expect(result.project.name).toBe('ESP32-S3 Sensor Board');
  });

  it('throws CircuitError on invalid input', () => {
    expect(() => validateDesignIntent({ project: {} })).toThrow(CircuitError);
  });

  it('throws CircuitError with DESIGN_INTENT_INVALID code on missing blocks', () => {
    try {
      validateDesignIntent({
        project: { name: 'Test', goal: 'Test', boardType: 'sensor-board' },
        requirements: {
          functionalBlocks: [],
          power: { rails: [{ id: '3V3', voltage: 3.3 }] },
        },
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitError);
      expect((err as CircuitError).code).toBe(CircuitErrorCode.DESIGN_INTENT_INVALID);
      expect((err as CircuitError).errors.length).toBeGreaterThan(0);
    }
  });
});

describe('isDesignIntent', () => {
  it('returns true for valid DesignIntent', () => {
    expect(isDesignIntent(minimalValid)).toBe(true);
  });

  it('returns false for invalid input', () => {
    expect(isDesignIntent(null)).toBe(false);
    expect(isDesignIntent({})).toBe(false);
    expect(isDesignIntent('hello')).toBe(false);
  });
});
