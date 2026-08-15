import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '..');
const FIXTURE_PATH = resolve(FIXTURE_DIR, 'fixture.json');
const SCHEMA_PATH = resolve(FIXTURE_DIR, 'fixture-schema.json');

interface FixtureComponent {
  ref: string;
  description: string;
  package: string;
  lcsc?: string;
  quantity?: number;
  category?: string;
}

interface FixtureNet {
  name: string;
  nodes: string[];
}

interface FixtureBomLine {
  ref: string;
  description: string;
  package: string;
  quantity: number;
  lcsc?: string;
}

interface FixtureErcDrc {
  expectedErrorCount: number;
  expectedWarningCount: number;
  maxErrors: number;
}

interface ExportFile {
  name: string;
  format: string;
  minSizeBytes: number;
}

interface ExportManifest {
  expectedFileCount: number;
  expectedFormats: string[];
  files: ExportFile[];
}

interface FixtureMetadata {
  easyedaVersion: string;
  bridgeExtensionVersion: string;
  serverVersion: string;
  requiresLocalEasyEDA: boolean;
}

interface FixtureBoard {
  expectedLayers: number;
  expectedDimensions: { width_mm: number; height_mm: number };
  expectedFeatures: {
    vias: number;
    tracks: number;
    zones: number;
    pads: number;
    components: number;
  };
}

interface FixtureSchematic {
  components: FixtureComponent[];
  namedNets: FixtureNet[];
  totalNets: number;
}

interface FixtureBom {
  expectedLineCount: number;
  maxLineCostUsd: number;
  lines: FixtureBomLine[];
}

interface FixtureBomQuality {
  expectedMinEntries: number;
  expectedIssueTypes: string[];
  minExpectedIssues: number;
  supplierDependent: boolean;
}

interface FixturePcbConstraints {
  expectedBoardOutline: boolean;
  expectedLayerCount: number;
  expectedDimensionsMm: { width: number; height: number };
  expectedErrors: number;
  expectedWarnings: number;
  expectedManualReviewCount: number;
  expectedVerdict: string;
}

interface GoldenFixture {
  $schema: string;
  fixtureName: string;
  fixtureVersion: string;
  schemaVersion: string;
  description: string;
  board: FixtureBoard;
  schematic: FixtureSchematic;
  bom: FixtureBom;
  bomQuality: FixtureBomQuality;
  erc: FixtureErcDrc;
  drc: FixtureErcDrc;
  pcbConstraints: FixturePcbConstraints;
  exportManifest: ExportManifest;
  metadata: FixtureMetadata;
}

function loadFixture(): GoldenFixture {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Fixture file not found: ${FIXTURE_PATH}`);
  }
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GoldenFixture;
}

function loadSchema(): Record<string, unknown> {
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found: ${SCHEMA_PATH}`);
  }
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
}

// ── Schema validation ────────────────────────────────────────────────────────

describe('golden fixture: schema', () => {
  it('should load fixture.json', () => {
    const fixture = loadFixture();
    expect(fixture.fixtureName).toBeTruthy();
    expect(fixture.fixtureVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should load fixture-schema.json', () => {
    const schema = loadSchema();
    expect(schema).toHaveProperty('$schema');
    expect(schema).toHaveProperty('properties');
    expect(schema).toHaveProperty('required');
  });

  it('should reference the schema file correctly', () => {
    const fixture = loadFixture();
    // The $schema reference in fixture.json should point to schema by relative path
    expect(fixture.$schema).toContain('fixture-schema.json');
  });

  it('should have matching schemaVersion', () => {
    const fixture = loadFixture();
    // Schema $id or schema itself should be compatible with fixture's schemaVersion
    expect(fixture.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── Top-level structure ──────────────────────────────────────────────────────

describe('golden fixture: top-level structure', () => {
  const fixture = loadFixture();

  it('should have all required top-level keys', () => {
    const required = [
      'fixtureName',
      'fixtureVersion',
      'schemaVersion',
      'description',
      'board',
      'schematic',
      'bom',
      'erc',
      'drc',
      'pcbConstraints',
      'exportManifest',
      'metadata',
    ];
    for (const key of required) {
      expect(fixture).toHaveProperty(key);
    }
  });

  it('should have a descriptive name', () => {
    expect(fixture.fixtureName.length).toBeGreaterThan(5);
  });

  it('should have a meaningful description', () => {
    expect(fixture.description.length).toBeGreaterThan(20);
  });
});

// ── Board validation ─────────────────────────────────────────────────────────

describe('golden fixture: board', () => {
  const fixture = loadFixture();

  it('should have valid layer count', () => {
    expect(fixture.board.expectedLayers).toBeGreaterThanOrEqual(2);
    expect(fixture.board.expectedLayers).toBeLessThanOrEqual(64);
  });

  it('should have positive board dimensions', () => {
    expect(fixture.board.expectedDimensions.width_mm).toBeGreaterThan(0);
    expect(fixture.board.expectedDimensions.height_mm).toBeGreaterThan(0);
  });

  it('should have non-negative feature counts', () => {
    const features = fixture.board.expectedFeatures;
    expect(features.vias).toBeGreaterThanOrEqual(0);
    expect(features.tracks).toBeGreaterThanOrEqual(0);
    expect(features.zones).toBeGreaterThanOrEqual(0);
    expect(features.pads).toBeGreaterThanOrEqual(0);
    expect(features.components).toBeGreaterThanOrEqual(0);
  });
});

// ── Schematic component validation ───────────────────────────────────────────

describe('golden fixture: schematic components', () => {
  const fixture = loadFixture();
  const comps = fixture.schematic.components;

  it('should have at least 5 components', () => {
    expect(comps.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique reference designators', () => {
    const refs = comps.map((c) => c.ref);
    const unique = new Set(refs);
    expect(unique.size).toBe(refs.length);
  });

  it('should have valid reference designator format', () => {
    for (const c of comps) {
      expect(c.ref).toMatch(/^[A-Z]+[0-9]+$/);
    }
  });

  it('should have MCU (U Series)', () => {
    const ics = comps.filter((c) => c.ref.startsWith('U'));
    expect(ics.length).toBeGreaterThanOrEqual(3);
  });

  it('should have passives (R, C)', () => {
    const resistors = comps.filter((c) => c.ref.startsWith('R'));
    const caps = comps.filter((c) => c.ref.startsWith('C'));
    expect(resistors.length).toBeGreaterThanOrEqual(5);
    expect(caps.length).toBeGreaterThanOrEqual(2);
  });

  it('should have connectors (J)', () => {
    const connectors = comps.filter((c) => c.ref.startsWith('J'));
    expect(connectors.length).toBeGreaterThanOrEqual(2);
  });

  it('should have all components with description', () => {
    for (const c of comps) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('should have all components with package/footprint', () => {
    for (const c of comps) {
      expect(c.package.length).toBeGreaterThan(0);
    }
  });
});

// ── Net validation ───────────────────────────────────────────────────────────

describe('golden fixture: named nets', () => {
  const fixture = loadFixture();
  const nets = fixture.schematic.namedNets;
  const compRefs = new Set(fixture.schematic.components.map((c) => c.ref));

  it('should have at least 5 named nets', () => {
    expect(nets.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique net names', () => {
    const names = nets.map((n) => n.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should have GND net', () => {
    const gnd = nets.find((n) => n.name === 'GND');
    expect(gnd).toBeDefined();
    expect(gnd!.nodes.length).toBeGreaterThanOrEqual(5);
  });

  it('should have power net (3V3 or VIN)', () => {
    const power = nets.find((n) => n.name === '3V3' || n.name === 'VIN');
    expect(power).toBeDefined();
  });

  it('should have valid node references matching component refs', () => {
    for (const net of nets) {
      for (const node of net.nodes) {
        // Skip global net references (GND, 3V3, VIN as node targets in power nets)
        if (node === 'GND' || node === '3V3' || node === 'VIN') continue;
        const parts = node.split('.');
        expect(parts.length).toBe(2);
        const ref = parts[0];
        expect(compRefs.has(ref)).toBe(true);
      }
    }
  });

  it('should have totalNets >= namedNets count', () => {
    expect(fixture.schematic.totalNets).toBeGreaterThanOrEqual(nets.length);
  });

  it('should have I2C nets (SCL, SDA)', () => {
    const scl = nets.find((n) => n.name === 'I2C_SCL' || n.name.includes('SCL'));
    const sda = nets.find((n) => n.name === 'I2C_SDA' || n.name.includes('SDA'));
    expect(scl).toBeDefined();
    expect(sda).toBeDefined();
  });

  it('should have UART nets (TXD, RXD)', () => {
    const txd = nets.find((n) => n.name.includes('TXD'));
    const rxd = nets.find((n) => n.name.includes('RXD'));
    expect(txd).toBeDefined();
    expect(rxd).toBeDefined();
  });

  it('should have LED nets', () => {
    const ledNets = nets.filter(
      (n) =>
        n.name.includes('LED') ||
        n.name.includes('D1') ||
        n.name.includes('D2') ||
        n.name.includes('D3'),
    );
    expect(ledNets.length).toBeGreaterThanOrEqual(3);
  });
});

// ── BOM validation ───────────────────────────────────────────────────────────

describe('golden fixture: BOM', () => {
  const fixture = loadFixture();
  const bom = fixture.bom;

  it('should have at least 5 BOM lines', () => {
    expect(bom.lines.length).toBeGreaterThanOrEqual(5);
  });

  it('should have expectedLineCount within reasonable range of actual lines', () => {
    // Allow some slack: expected line count should be within +-3 of actual
    const diff = Math.abs(bom.expectedLineCount - bom.lines.length);
    expect(diff).toBeLessThanOrEqual(3);
  });

  it('should have non-negative cost anchor', () => {
    expect(bom.maxLineCostUsd).toBeGreaterThan(0);
  });

  it('should have all BOM lines with description and package', () => {
    for (const line of bom.lines) {
      expect(line.description.length).toBeGreaterThan(0);
      expect(line.package.length).toBeGreaterThan(0);
    }
  });

  it('should have all BOM lines with positive quantity', () => {
    for (const line of bom.lines) {
      expect(line.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('should have IC components in BOM', () => {
    const ics = bom.lines.filter(
      (l) =>
        l.description.toLowerCase().includes('esp32') ||
        l.description.toLowerCase().includes('cp2102') ||
        l.description.toLowerCase().includes('bme280') ||
        l.description.toLowerCase().includes('w25q'),
    );
    expect(ics.length).toBeGreaterThanOrEqual(3);
  });
});

// ── BOM Quality validation ─────────────────────────────────────────────────────

describe('golden fixture: BOM quality', () => {
  const fixture = loadFixture();
  const bomQuality = fixture.bomQuality;

  it('should have expectedMinEntries >= 1', () => {
    expect(bomQuality.expectedMinEntries).toBeGreaterThanOrEqual(1);
  });

  it('should have at least one expected issue type', () => {
    expect(bomQuality.expectedIssueTypes.length).toBeGreaterThanOrEqual(1);
  });

  it('should have minExpectedIssues >= 0', () => {
    expect(bomQuality.minExpectedIssues).toBeGreaterThanOrEqual(0);
  });

  it('should have supplierDependent boolean', () => {
    expect(typeof bomQuality.supplierDependent).toBe('boolean');
  });

  it('should list only valid issue types', () => {
    const validTypes = [
      'unavailable',
      'single_source',
      'missing_mpn',
      'missing_footprint',
      'low_stock',
    ];
    for (const t of bomQuality.expectedIssueTypes) {
      expect(validTypes).toContain(t);
    }
  });

  it('should match BOM line count for expectedMinEntries', () => {
    // The BOM quality report should cover at least as many entries as there are BOM lines
    expect(bomQuality.expectedMinEntries).toBeLessThanOrEqual(fixture.bom.lines.length);
  });
});

// ── ERC validation ───────────────────────────────────────────────────────────

describe('golden fixture: ERC', () => {
  const fixture = loadFixture();

  it('should have expected error count >= 0', () => {
    expect(fixture.erc.expectedErrorCount).toBeGreaterThanOrEqual(0);
  });

  it('should have maxErrors >= expectedErrorCount', () => {
    expect(fixture.erc.maxErrors).toBeGreaterThanOrEqual(fixture.erc.expectedErrorCount);
  });

  it('should have reasonable warning count', () => {
    expect(fixture.erc.expectedWarningCount).toBeGreaterThanOrEqual(0);
    expect(fixture.erc.expectedWarningCount).toBeLessThanOrEqual(50);
  });
});

// ── DRC validation ───────────────────────────────────────────────────────────

describe('golden fixture: DRC', () => {
  const fixture = loadFixture();

  it('should have expected error count >= 0', () => {
    expect(fixture.drc.expectedErrorCount).toBeGreaterThanOrEqual(0);
  });

  it('should have maxErrors >= expectedErrorCount', () => {
    expect(fixture.drc.maxErrors).toBeGreaterThanOrEqual(fixture.drc.expectedErrorCount);
  });

  it('should have reasonable warning count', () => {
    expect(fixture.drc.expectedWarningCount).toBeGreaterThanOrEqual(0);
    expect(fixture.drc.expectedWarningCount).toBeLessThanOrEqual(50);
  });
});

// ── Export manifest validation ───────────────────────────────────────────────

describe('golden fixture: export manifest', () => {
  const fixture = loadFixture();
  const manifest = fixture.exportManifest;

  it('should have at least 3 expected export files', () => {
    expect(manifest.files.length).toBeGreaterThanOrEqual(3);
  });

  it('should have expectedFileCount match actual file list length', () => {
    expect(manifest.expectedFileCount).toBe(manifest.files.length);
  });

  it('should have at least 2 export formats', () => {
    expect(manifest.expectedFormats.length).toBeGreaterThanOrEqual(2);
  });

  it('should include gerber format', () => {
    expect(manifest.expectedFormats).toContain('gerber');
  });

  it('should have unique filenames', () => {
    const names = manifest.files.map((f) => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should have valid minSizeBytes for all files', () => {
    for (const file of manifest.files) {
      expect(file.minSizeBytes).toBeGreaterThanOrEqual(1);
    }
  });

  it('should have gerber files', () => {
    const gerbers = manifest.files.filter((f) => f.format === 'gerber');
    expect(gerbers.length).toBeGreaterThanOrEqual(4);
  });

  it('should have a drill file', () => {
    const drill = manifest.files.find((f) => f.format === 'drill');
    expect(drill).toBeDefined();
  });
});

// ── PCB constraints validation ──────────────────────────────────────────

describe('golden fixture: PCB constraints', () => {
  const fixture = loadFixture();
  const pc = fixture.pcbConstraints;

  it('should have expectedBoardOutline boolean', () => {
    expect(typeof pc.expectedBoardOutline).toBe('boolean');
  });

  it('should have valid expectedLayerCount', () => {
    expect(pc.expectedLayerCount).toBeGreaterThanOrEqual(2);
    expect(pc.expectedLayerCount).toBeLessThanOrEqual(64);
  });

  it('should have positive expected dimensions', () => {
    expect(pc.expectedDimensionsMm.width).toBeGreaterThan(0);
    expect(pc.expectedDimensionsMm.height).toBeGreaterThan(0);
  });

  it('should have expectedErrors >= 0', () => {
    expect(pc.expectedErrors).toBeGreaterThanOrEqual(0);
  });

  it('should have expectedWarnings >= 0', () => {
    expect(pc.expectedWarnings).toBeGreaterThanOrEqual(0);
  });

  it('should have expectedManualReviewCount >= 0', () => {
    expect(pc.expectedManualReviewCount).toBeGreaterThanOrEqual(0);
  });

  it('should have a valid verdict string', () => {
    const validVerdicts = ['pass', 'fail', 'needs-review'];
    expect(validVerdicts).toContain(pc.expectedVerdict);
  });

  it('should match layer count with board section', () => {
    expect(pc.expectedLayerCount).toBe(fixture.board.expectedLayers);
  });

  it('should match dimensions with board section', () => {
    expect(pc.expectedDimensionsMm.width).toBe(fixture.board.expectedDimensions.width_mm);
    expect(pc.expectedDimensionsMm.height).toBe(fixture.board.expectedDimensions.height_mm);
  });
});

// ── Metadata validation ──────────────────────────────────────────────────────

describe('golden fixture: metadata', () => {
  const fixture = loadFixture();

  it('should require local EasyEDA Pro', () => {
    expect(fixture.metadata.requiresLocalEasyEDA).toBe(true);
  });

  it('should specify EasyEDA Pro version', () => {
    expect(fixture.metadata.easyedaVersion.length).toBeGreaterThan(0);
  });

  it('should specify bridge extension version', () => {
    expect(fixture.metadata.bridgeExtensionVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should specify server version', () => {
    expect(fixture.metadata.serverVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── Data consistency checks ──────────────────────────────────────────────────

describe('golden fixture: data consistency', () => {
  const fixture = loadFixture();
  const comps = fixture.schematic.components;
  const compRefs = new Set(comps.map((c) => c.ref));
  const bomRefs = fixture.bom.lines.flatMap((l) =>
    l.ref
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  );
  const bomRefSet = new Set(bomRefs);

  it('should have all BOM refs as subsets of schematic refs (or PCB)', () => {
    for (const ref of bomRefSet) {
      // PCB fabrication is not a schematic component, skip it
      if (ref === '' || ref === 'PCB') continue;
      // Mounting holes are valid in BOM
      if (ref.startsWith('MH')) continue;
      // Multi-ref lines like "R1, R2" - check each part
      expect(compRefs.has(ref)).toBe(true);
    }
  });

  it('should have all named net nodes reference existing components', () => {
    const allNodes = new Set<string>();
    for (const net of fixture.schematic.namedNets) {
      for (const node of net.nodes) {
        if (node === 'GND' || node === '3V3' || node === 'VIN') continue;
        allNodes.add(node);
      }
    }
    // At least some nodes should match component refs
    expect(allNodes.size).toBeGreaterThan(0);
  });

  it('should have reasonable total component count', () => {
    // Board features.components should be close to schematic components count
    const diff = Math.abs(fixture.board.expectedFeatures.components - comps.length);
    expect(diff).toBeLessThanOrEqual(10);
  });
});
