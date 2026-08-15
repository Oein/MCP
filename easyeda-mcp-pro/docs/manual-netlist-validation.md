# Manual Netlist Validation Procedure

> ⚠️ **Live validation is blocked.** This document describes the exact manual steps to validate the net creation tools against a real EasyEDA Pro instance. Run these when a bridge-connected environment is available.

## Prerequisites

- EasyEDA Pro with MCP Bridge extension installed and connected
- MCP client configured with `easyeda-mcp-pro` server running
- An open schematic project with at least one component placed

## Validation Steps

### 1. Create a Net Flag

```json
{
  "tool": "easyeda_schematic_create_net_flag",
  "params": {
    "projectId": "<project-id>",
    "netName": "TEST_NET",
    "x": 500,
    "y": 500,
    "rotation": 0,
    "confirmWrite": true
  }
}
```

**Expected result:**

- Net flag visible on the schematic canvas at (500, 500)
- Response: `{ "success": true, "netFlag": { "primitiveId": "<uuid>", "netName": "TEST_NET" } }`

### 2. Create a Net Port

```json
{
  "tool": "easyeda_schematic_create_net_port",
  "params": {
    "projectId": "<project-id>",
    "netName": "TEST_PORT",
    "x": 600,
    "y": 600,
    "portType": "bidirectional",
    "confirmWrite": true
  }
}
```

**Expected result:**

- Net port visible on the schematic canvas
- Response: `{ "success": true, "netPort": { "primitiveId": "<uuid>", "netName": "TEST_PORT" } }`

### 3. Connect a Component Pin to TEST_NET

First, find a component pin using `easyeda_schematic_component_pins`:

```json
{
  "tool": "easyeda_schematic_component_pins",
  "params": { "primitiveId": "<component-primitive-id>" }
}
```

Then connect a pin:

```json
{
  "tool": "easyeda_schematic_connect_pin_to_net",
  "params": {
    "projectId": "<project-id>",
    "primitiveId": "<component-primitive-id>",
    "pinNumber": "1",
    "netName": "TEST_NET",
    "confirmWrite": true
  }
}
```

**Expected result:**

- Response: `{ "success": true, "connection": { "primitiveId": "...", "pinNumber": "1", "netName": "TEST_NET" } }`

### 4. Save the Project

```json
{
  "tool": "easyeda_project_save",
  "params": {
    "projectId": "<project-id>",
    "confirmWrite": true
  }
}
```

**Expected result:**

- Response: `{ "success": true, "project_id": "...", "saved_at": "..." }`

### 5. Verify — List Nets

```json
{
  "tool": "easyeda_schematic_nets",
  "params": { "projectId": "<project-id>" }
}
```

**Expected:**

- `total` > 0
- `TEST_NET` appears in the `nets` array

### 6. Verify — Validate Netlist

```json
{
  "tool": "easyeda_schematic_validate_netlist",
  "params": {
    "projectId": "<project-id>",
    "includeWireCheck": true
  }
}
```

**Expected:**

- `total_nets` > 0
- `TEST_NET` listed with connected refs/pins
- `valid` is `true` or warnings are informational
- `floating_pins` includes other unconnected pins

### 7. Cleanup

Delete temporary objects created during validation:

```json
{
  "tool": "easyeda_schematic_delete_primitive",
  "params": {
    "primitiveIds": ["<netflag-primitive-id>", "<netport-primitive-id>"],
    "confirmWrite": true
  }
}
```

Then save again:

```json
{
  "tool": "easyeda_project_save",
  "params": {
    "projectId": "<project-id>",
    "confirmWrite": true
  }
}
```

## Verification Commands (Bridge API)

If you have bridge access via `easyeda_api_call`, verify at the EasyEDA API level:

```
// List all net names
easyeda_api_call(path="SCH_Net.getAllNetsName", args=[])

// Get netlist entries
easyeda_api_call(path="SCH_Netlist.getNetlist", args=[])

// Get wires with net info
easyeda_api_call(path="SCH_PrimitiveWire.getAll", args=[])
```

## Blocked Status

✅ Tool schemas implemented
✅ Bridge methods registered
✅ Unit tests passing (533/533)
✅ Build, typecheck, lint, metadata all passing
❌ **Live EasyEDA Pro validation** — blocked (no bridge-connected EasyEDA Pro instance available in this development environment)

When live validation is performed, document the exact project ID, commands used, and results here.
