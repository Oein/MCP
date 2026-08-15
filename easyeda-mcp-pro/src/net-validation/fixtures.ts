/**
 * Net validation — sample fixture data for tests.
 *
 * @module
 */

import type {
  NetValidationEntry,
  DeviceValidationEntry,
  InterfaceValidationEntry,
  NetValidationInput,
} from './schema.js';

// ── Valid design ───────────────────────────────────────────────────────────

export const VALID_NETS: NetValidationEntry[] = [
  {
    id: 'net-1',
    name: '3V3',
    type: 'power',
    nodes: [
      { deviceRef: 'U1', pin: '1' },
      { deviceRef: 'R1', pin: '1' },
    ],
  },
  {
    id: 'net-2',
    name: 'GND',
    type: 'ground',
    nodes: [
      { deviceRef: 'U1', pin: '2' },
      { deviceRef: 'R1', pin: '2' },
      { deviceRef: 'C1', pin: '2' },
    ],
  },
  {
    id: 'net-3',
    name: 'I2C_SCL',
    type: 'signal',
    nodes: [
      { deviceRef: 'U1', pin: '3' },
      { deviceRef: 'U2', pin: '1' },
    ],
  },
  {
    id: 'net-4',
    name: 'I2C_SDA',
    type: 'signal',
    nodes: [
      { deviceRef: 'U1', pin: '4' },
      { deviceRef: 'U2', pin: '2' },
    ],
  },
  {
    id: 'net-5',
    name: 'nRST',
    type: 'signal',
    nodes: [
      { deviceRef: 'U1', pin: '5' },
      { deviceRef: 'U2', pin: '3' },
    ],
  },
  { id: 'net-6', name: 'CLK_32K', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '6' }] },
];

export const VALID_DEVICES: DeviceValidationEntry[] = [
  { id: 'U1', ref: 'U1', category: 'microcontroller' },
  { id: 'U2', ref: 'U2', category: 'sensor' },
  { id: 'R1', ref: 'R1', category: 'passive' },
  { id: 'C1', ref: 'C1', category: 'passive' },
];

export const VALID_INPUT: NetValidationInput = {
  nets: VALID_NETS,
  devices: VALID_DEVICES,
};

// ── Floating net ───────────────────────────────────────────────────────────

export const FLOATING_NET: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'FLOAT', type: 'signal', nodes: [] }, // ← floating
  { id: 'n3', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
];

export const FLOATING_INPUT: NetValidationInput = {
  nets: FLOATING_NET,
};

// ── Duplicate name ─────────────────────────────────────────────────────────

export const DUPLICATE_NAME_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U2', pin: '1' }] }, // ← duplicate
  { id: 'n3', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
];

export const DUPLICATE_NAME_INPUT: NetValidationInput = {
  nets: DUPLICATE_NAME_NETS,
};

// ── Accidental short ───────────────────────────────────────────────────────

export const SHORT_NETS: NetValidationEntry[] = [
  { id: 'n1', name: 'NET_A', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'NET_B', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '1' }] }, // ← same pin!
  { id: 'n3', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
];

export const SHORT_INPUT: NetValidationInput = {
  nets: SHORT_NETS,
};

// ── Missing power / ground ─────────────────────────────────────────────────

export const NO_POWER_NETS: NetValidationEntry[] = [
  { id: 'n1', name: 'SIG', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
];

export const NO_POWER_INPUT: NetValidationInput = { nets: NO_POWER_NETS };

export const NO_GROUND_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'SIG', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '3' }] },
];

export const NO_GROUND_INPUT: NetValidationInput = { nets: NO_GROUND_NETS };

// ── Missing hierarchical port ──────────────────────────────────────────────

export const MISSING_PORT_INTERFACES: InterfaceValidationEntry[] = [
  {
    id: 'intf-1',
    name: 'EXTERNAL',
    pinout: [
      { pin: '1', signal: 'EXT_CLK' },
      { pin: '2', signal: 'EXT_DATA' },
    ],
  },
];

export const MISSING_PORT_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
];

export const MISSING_PORT_INPUT: NetValidationInput = {
  nets: MISSING_PORT_NETS,
  interfaces: MISSING_PORT_INTERFACES,
};

// ── Unconnected device ─────────────────────────────────────────────────────

/** Nets that avoid U1 so U1 appears unconnected. */
export const UNCONNECTED_DEVICE_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U2', pin: '1' }] },
  {
    id: 'n2',
    name: 'GND',
    type: 'ground',
    nodes: [
      { deviceRef: 'U2', pin: '2' },
      { deviceRef: 'R1', pin: '2' },
    ],
  },
];

export const UNCONNECTED_DEVICES: DeviceValidationEntry[] = [
  { id: 'R1', ref: 'R1', category: 'passive' },
  { id: 'U1', ref: 'U1', category: 'microcontroller' }, // ← no pin connections
];

export const UNCONNECTED_DEVICE_INPUT: NetValidationInput = {
  nets: UNCONNECTED_DEVICE_NETS,
  devices: UNCONNECTED_DEVICES,
};

// ── Inconsistent cross-sheet interfaces ────────────────────────────────────

export const CROSS_SHEET_INTERFACES: InterfaceValidationEntry[] = [
  {
    id: 'sheet1-port',
    name: 'BUS_A',
    pinout: [
      { pin: '1', signal: 'DATA' },
      { pin: '2', signal: 'CLK' },
    ],
  },
  {
    id: 'sheet2-port',
    name: 'BUS_A',
    pinout: [
      { pin: '1', signal: 'DATA' },
      { pin: '2', signal: 'CLK' },
    ],
  },
];

export const MISMATCHED_CROSS_SHEET_INTERFACES: InterfaceValidationEntry[] = [
  {
    id: 'sheet1-port',
    name: 'BUS_A',
    pinout: [
      { pin: '1', signal: 'DATA' },
      { pin: '2', signal: 'CLK' },
    ],
  },
  {
    id: 'sheet2-port',
    name: 'BUS_A',
    pinout: [
      { pin: '1', signal: 'DATA' },
      { pin: '2', signal: 'STROBE' },
    ],
  }, // ← mismatched
];

export const CROSS_SHEET_INPUT: NetValidationInput = {
  nets: VALID_NETS,
  interfaces: CROSS_SHEET_INTERFACES,
};

export const MISMATCHED_CROSS_SHEET_INPUT: NetValidationInput = {
  nets: VALID_NETS,
  interfaces: MISMATCHED_CROSS_SHEET_INTERFACES,
};

// ── Naming convention violations ───────────────────────────────────────────

export const BAD_POWER_NAME_NETS: NetValidationEntry[] = [
  { id: 'n1', name: 'MY_RAIL', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] }, // ← should be like "3V3", "VCC"
  { id: 'n2', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
];

export const BAD_POWER_NAME_INPUT: NetValidationInput = { nets: BAD_POWER_NAME_NETS };

export const BAD_GROUND_NAME_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'RET', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] }, // ← non-standard ground name
];

export const BAD_GROUND_NAME_INPUT: NetValidationInput = { nets: BAD_GROUND_NAME_NETS };

// ── Protected domain violations ────────────────────────────────────────────

export const HV_GENERIC_NAME_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
  { id: 'n3', name: 'L', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '3' }] }, // ← 'L' alone is a generic name in HV context
];

export const HV_GENERIC_NAME_INPUT: NetValidationInput = { nets: HV_GENERIC_NAME_NETS };

// ── Mixed HV+digital domain ────────────────────────────────────────────────

export const HV_MIXED_DOMAIN_NETS: NetValidationEntry[] = [
  { id: 'n1', name: '3V3', type: 'power', nodes: [{ deviceRef: 'U1', pin: '1' }] },
  { id: 'n2', name: 'GND', type: 'ground', nodes: [{ deviceRef: 'U1', pin: '2' }] },
  { id: 'n3', name: 'HV_CLK', type: 'signal', nodes: [{ deviceRef: 'U1', pin: '3' }] }, // ← HV + CLK = mixed domain (safety hazard)
];

export const HV_MIXED_DOMAIN_INPUT: NetValidationInput = { nets: HV_MIXED_DOMAIN_NETS };
