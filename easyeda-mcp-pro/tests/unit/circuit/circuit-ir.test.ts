import { describe, it, expect } from 'vitest';
import {
  CircuitIRSchema,
  validateCircuitIR,
  isCircuitIR,
  CIRCUIT_IR_SCHEMA_VERSION,
} from '../../../src/circuit/circuit-ir.js';
import {
  ValidationStatus,
  NetType,
  ConstraintSeverity,
  ConstraintType,
} from '../../../src/circuit/types.js';
import { CircuitError, CircuitErrorCode } from '../../../src/circuit/errors.js';

// ── Helpers ───────────────────────────────────────────────────────────────

const minimalValid = {
  $schema: CIRCUIT_IR_SCHEMA_VERSION,
  metadata: {
    version: '1.0.0',
    validationStatus: ValidationStatus.Draft,
  },
  blocks: [
    { id: 'block-mcu', name: 'Microcontroller', type: 'microcontroller' },
    { id: 'block-sensor', name: 'Sensor', type: 'sensor' },
  ],
  devices: [
    {
      id: 'dev-esp32',
      ref: 'U1',
      mpn: 'ESP32-S3-MINI-1-N8',
      package: 'ESP32-S3-MINI-1',
      blockRef: 'block-mcu',
    },
    {
      id: 'dev-bme280',
      ref: 'U2',
      mpn: 'BME280',
      package: 'LGA-8',
      blockRef: 'block-sensor',
    },
  ],
  nets: [],
  rails: [],
  interfaces: [],
  constraints: [],
  bom: { excludeRefs: [], preferredVendors: [] },
  pcb: {},
  manufacturing: {},
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CircuitIRSchema', () => {
  it('validates a minimal valid CircuitIR', () => {
    const result = CircuitIRSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.$schema).toBe(CIRCUIT_IR_SCHEMA_VERSION);
      expect(result.data.blocks).toHaveLength(2);
      expect(result.data.devices).toHaveLength(2);
      expect(result.data.metadata.validationStatus).toBe(ValidationStatus.Draft);
    }
  });

  it('rejects CircuitIR with missing required fields', () => {
    const result = CircuitIRSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects CircuitIR with net referencing non-existent device', () => {
    const invalid = {
      ...minimalValid,
      nets: [
        {
          id: 'net-bad',
          name: 'BrokenNet',
          nodes: [{ deviceRef: 'dev-nonexistent', pin: '1' }],
        },
      ],
    };
    const result = CircuitIRSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects CircuitIR with device referencing non-existent block', () => {
    const invalid = {
      ...minimalValid,
      devices: [
        {
          id: 'dev-orphan',
          ref: 'U99',
          mpn: 'Unknown',
          blockRef: 'block-nonexistent',
        },
      ],
    };
    const result = CircuitIRSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts CircuitIR with full golden-fixture-like data', () => {
    const goldenLike = {
      $schema: CIRCUIT_IR_SCHEMA_VERSION,
      metadata: {
        version: '1.0.0',
        designIntentRef: 'ESP32-S3 Sensor and Control Board',
        validationStatus: ValidationStatus.Validated,
      },
      blocks: [
        { id: 'block-power', name: 'Power Management', type: 'power-management' },
        { id: 'block-mcu', name: 'Microcontroller', type: 'microcontroller' },
        { id: 'block-sensor', name: 'Sensor Interface', type: 'sensor' },
        { id: 'block-comm', name: 'Communication', type: 'communication' },
        { id: 'block-storage', name: 'External Storage', type: 'custom' },
      ],
      devices: [
        {
          id: 'dev-u1',
          ref: 'U1',
          mpn: 'ESP32-S3-MINI-1-N8',
          package: 'ESP32-S3-MINI-1',
          blockRef: 'block-mcu',
        },
        { id: 'dev-u2', ref: 'U2', mpn: 'CP2102N', package: 'QFN-28', blockRef: 'block-comm' },
        {
          id: 'dev-u3',
          ref: 'U3',
          mpn: 'XC6206P332MR',
          package: 'SOT-23-3',
          blockRef: 'block-power',
        },
        { id: 'dev-u4', ref: 'U4', mpn: 'BME280', package: 'LGA-8', blockRef: 'block-sensor' },
        {
          id: 'dev-u5',
          ref: 'U5',
          mpn: 'W25Q128JVSIQ',
          package: 'SOIC-8',
          blockRef: 'block-storage',
        },
      ],
      nets: [
        {
          id: 'net-vin',
          name: 'VIN',
          type: NetType.Power,
          nodes: [{ deviceRef: 'dev-u3', pin: '1' }],
          blockRef: 'block-power',
        },
        {
          id: 'net-3v3',
          name: '3V3',
          type: NetType.Power,
          nodes: [{ deviceRef: 'dev-u1', pin: '1' }],
          blockRef: 'block-power',
        },
        {
          id: 'net-gnd',
          name: 'GND',
          type: NetType.Ground,
          nodes: [{ deviceRef: 'dev-u1', pin: '9' }],
        },
        {
          id: 'net-i2c-scl',
          name: 'I2C_SCL',
          type: NetType.Signal,
          nodes: [
            { deviceRef: 'dev-u1', pin: '8' },
            { deviceRef: 'dev-u4', pin: '5' },
          ],
          blockRef: 'block-sensor',
        },
        {
          id: 'net-i2c-sda',
          name: 'I2C_SDA',
          type: NetType.Signal,
          nodes: [
            { deviceRef: 'dev-u1', pin: '10' },
            { deviceRef: 'dev-u4', pin: '6' },
          ],
          blockRef: 'block-sensor',
        },
        {
          id: 'net-uart-tx',
          name: 'UART_TXD',
          type: NetType.Signal,
          nodes: [
            { deviceRef: 'dev-u2', pin: '16' },
            { deviceRef: 'dev-u1', pin: '37' },
          ],
        },
        {
          id: 'net-uart-rx',
          name: 'UART_RXD',
          type: NetType.Signal,
          nodes: [
            { deviceRef: 'dev-u2', pin: '17' },
            { deviceRef: 'dev-u1', pin: '38' },
          ],
        },
      ],
      rails: [
        {
          id: 'rail-3v3',
          name: '3V3',
          voltage: 3.3,
          tolerance: 5,
          maxCurrentAmps: 0.5,
          sourceBlockRef: 'block-power',
          sinkBlockRefs: ['block-mcu', 'block-sensor', 'block-comm', 'block-storage'],
        },
        {
          id: 'rail-vin',
          name: 'VIN',
          voltage: 5.0,
          tolerance: 10,
          maxCurrentAmps: 1.0,
          sourceBlockRef: 'block-power',
        },
      ],
      interfaces: [
        {
          id: 'iface-usb',
          name: 'USB Connector',
          type: 'usb-c',
          pinout: [
            { pin: '1', signal: 'VBUS' },
            { pin: '4', signal: 'USB_D+' },
          ],
          blockRef: 'block-comm',
        },
        {
          id: 'iface-i2c',
          name: 'I2C Header',
          type: 'pin-header',
          pinout: [
            { pin: '1', signal: 'SCL' },
            { pin: '3', signal: 'SDA' },
          ],
          blockRef: 'block-sensor',
        },
      ],
      constraints: [
        {
          id: 'constr-trace-impedance',
          type: ConstraintType.Electrical,
          severity: ConstraintSeverity.Required,
          description: 'USB D+/D- traces must be 90Ω differential impedance',
          scope: 'USB routing',
        },
      ],
      bom: { excludeRefs: [], preferredVendors: ['LCSC'], costTargetUsd: 25.0 },
      pcb: { layerCount: 2, widthMm: 60, heightMm: 40, material: 'FR4' },
      manufacturing: { quantity: 100, process: 'lead-free', timelineWeeks: 6 },
    };
    const result = CircuitIRSchema.safeParse(goldenLike);
    expect(result.success).toBe(true);
    if (result.success) {
      // Count expected objects
      expect(result.data.blocks).toHaveLength(5);
      expect(result.data.devices).toHaveLength(5);
      expect(result.data.nets).toHaveLength(7);
      expect(result.data.rails).toHaveLength(2);
      expect(result.data.interfaces).toHaveLength(2);
      expect(result.data.constraints).toHaveLength(1);
      expect(result.data.metadata.validationStatus).toBe(ValidationStatus.Validated);
    }
  });

  it('rejects extra fields via strict mode', () => {
    const invalid = { ...minimalValid, extraField: 'not allowed' };
    const result = CircuitIRSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('validateCircuitIR', () => {
  it('returns validated CircuitIR on valid input', () => {
    const result = validateCircuitIR(minimalValid);
    expect(result.blocks).toHaveLength(2);
  });

  it('throws CircuitError on invalid input', () => {
    expect(() => validateCircuitIR({})).toThrow(CircuitError);
  });

  it('throws CircuitError with CIRCUIT_IR_INVALID code on broken cross-refs', () => {
    try {
      validateCircuitIR({
        ...minimalValid,
        nets: [
          {
            id: 'net-bad',
            name: 'BadNet',
            nodes: [{ deviceRef: 'dev-nonexistent', pin: '1' }],
          },
        ],
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitError);
      expect((err as CircuitError).code).toBe(CircuitErrorCode.CIRCUIT_IR_INVALID);
    }
  });
});

describe('isCircuitIR', () => {
  it('returns true for valid CircuitIR', () => {
    expect(isCircuitIR(minimalValid)).toBe(true);
  });

  it('returns false for invalid input', () => {
    expect(isCircuitIR(null)).toBe(false);
    expect(isCircuitIR({})).toBe(false);
    expect(isCircuitIR('hello')).toBe(false);
  });
});
