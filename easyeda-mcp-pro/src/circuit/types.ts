/**
 * Shared enums and primitive types for DesignIntent and CircuitIR.
 *
 * These types are schema-agnostic — they define the vocabulary used by
 * both DesignIntent (user-facing requirements) and CircuitIR (machine-readable
 * resolved model).
 */

// ── Enums ──────────────────────────────────────────────────────────────────

/** High-level board / application category. */
export enum BoardType {
  PowerSupply = 'power-supply',
  McuBoard = 'mcu-board',
  SensorBoard = 'sensor-board',
  AcDcIot = 'ac-dc-iot',
  Hierarchical = 'hierarchical',
  Custom = 'custom',
}

/** Validation lifecycle state of a CircuitIR model. */
export enum ValidationStatus {
  Draft = 'draft',
  Validated = 'validated',
  Rejected = 'rejected',
}

/** Classification of an electrical net. */
export enum NetType {
  Power = 'power',
  Signal = 'signal',
  Ground = 'ground',
}

/** Classification of a functional block. */
export enum BlockType {
  PowerManagement = 'power-management',
  Microcontroller = 'microcontroller',
  Sensor = 'sensor',
  Communication = 'communication',
  Interface = 'interface',
  Protection = 'protection',
  Analog = 'analog',
  Custom = 'custom',
}

/** Severity of a circuit constraint. */
export enum ConstraintSeverity {
  Required = 'required',
  Recommended = 'recommended',
  Informational = 'informational',
}

/** Kind of constraint. */
export enum ConstraintType {
  Electrical = 'electrical',
  Mechanical = 'mechanical',
  Thermal = 'thermal',
  Regulatory = 'regulatory',
  Cost = 'cost',
  PcbLayout = 'pcb-layout',
  Manufacturing = 'manufacturing',
}

// ── PCB-specific enums ────────────────────────────────────────────────────

/** PCB layer function / type. */
export enum BoardLayerType {
  Signal = 'signal',
  Power = 'power',
  Ground = 'ground',
  Plane = 'plane',
  Mechanical = 'mechanical',
  SolderMask = 'solder-mask',
  Paste = 'paste',
  Silkscreen = 'silkscreen',
  Drill = 'drill',
  Keepout = 'keepout',
}

/** Side of the board for component placement. */
export enum PlacementSide {
  Top = 'top',
  Bottom = 'bottom',
  Both = 'both',
}

/** Restriction applied to a keepout area. */
export enum KeepoutRestriction {
  All = 'all',
  Tracks = 'tracks',
  Vias = 'vias',
  Components = 'components',
  Copper = 'copper',
  Routing = 'routing',
}

/** Type of mounting hole. */
export enum MountingHoleType {
  Unplated = 'unplated',
  Plated = 'plated',
  Tooling = 'tooling',
}

/** Purpose for a placement zone. */
export enum PlacementZoneType {
  Power = 'power',
  Analog = 'analog',
  Digital = 'digital',
  Usb = 'usb',
  Sensor = 'sensor',
  AcDc = 'ac-dc',
  HighVoltage = 'high-voltage',
  Rf = 'rf',
  Thermal = 'thermal',
  General = 'general',
}

// ── PCB-specific interfaces ───────────────────────────────────────────────

/** A 2D point on the board (mm). */
export interface Point2D {
  x: number;
  y: number;
}

/** A board outline defined as an extruded polygon. */
export interface BoardOutline {
  shape: Point2D[];
  cutouts?: Point2D[][];
}

/** One layer in the PCB stackup. */
export interface LayerStackEntry {
  name: string;
  type: BoardLayerType;
  thicknessMm: number;
  material: string;
  copperWeightOz?: number;
  dielectricConstant?: number;
  order: number;
}

/** A net class with routing rules. */
export interface NetClassRule {
  name: string;
  traceWidthMm: number;
  clearanceMm: number;
  viaDiameterMm?: number;
  viaHoleMm?: number;
  priority?: number;
  netNames?: string[];
}

/** Clearance rule between two net classes. */
export interface ClearanceRule {
  netClassA: string;
  netClassB: string;
  clearanceMm: number;
  layer?: string;
}

/** A restricted area on the board. */
export interface KeepoutArea {
  outline: Point2D[];
  layer: string;
  restriction: KeepoutRestriction;
  description?: string;
}

/** A placement zone for grouping components. */
export interface PlacementZone {
  outline: Point2D[];
  layer: PlacementSide;
  zoneType: PlacementZoneType;
  name: string;
  allowedRefs?: string[];
  description?: string;
}

/** A fiducial mark. */
export interface Fiducial {
  x: number;
  y: number;
  type: 'global' | 'local';
  top: boolean;
  bottom?: boolean;
}

/** A test pad specification. */
export interface TestPad {
  x: number;
  y: number;
  netName: string;
  diameterMm: number;
  layer: PlacementSide;
  label?: string;
}

// ── Shared primitive types ────────────────────────────────────────────────

/** A traceability reference pointing back to a DesignIntent requirement. */
export interface DesignIntentRef {
  /** ID of the requirement within the DesignIntent (e.g. "req-power-001"). */
  requirementId: string;
  /** Optional free-text note explaining how this node satisfies the requirement. */
  note?: string;
}

/** A generic key-value metadata entry. */
export interface MetadataEntry {
  key: string;
  value: string;
}

// ── Type guard / helper functions ─────────────────────────────────────────

export function isValidBoardType(value: string): value is BoardType {
  return Object.values(BoardType).includes(value as BoardType);
}

export function isValidBlockType(value: string): value is BlockType {
  return Object.values(BlockType).includes(value as BlockType);
}
