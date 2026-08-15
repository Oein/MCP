# Schematic Review Example Workflow

This guide details how to perform an automated electrical audit of a schematic sheet to verify net connections, identify open/short circuits, and check decoupling capacitor placement.

---

## 1. Retrieve the Complete Netlist

Fetch all active nets and connected components in the sheet:

**MCP Call**:
`easyeda_schematic_nets`

**Netlist Output**:

```json
{
  "total": 3,
  "nets": [
    {
      "net_name": "VCC",
      "node_count": 2,
      "nodes": [
        { "component_ref": "U1", "pin": "3V3" },
        { "component_ref": "R1", "pin": "1" }
      ]
    },
    {
      "net_name": "GND",
      "node_count": 1,
      "nodes": [{ "component_ref": "U1", "pin": "GND" }]
    }
  ]
}
```

---

## 2. Identify Floating Nets (Single-Node Nets)

An electrical rule of thumb is that active nets must have at least **two nodes** (a driver and a receiver).
In the output above, the **GND** net has `node_count: 1`, indicating it is a **floating net** or missing a terminal connection.

**AI Assessment**:

```text
⚠️ Warning: Net "GND" is connected only to U1.GND. It is missing a power port or connection to other grounds.
```

---

## 3. Verify Pin Names and Connections

For complex ICs, retrieve the pin map of the schematic symbol:

**MCP Call**:
`easyeda_schematic_component_pins` with the primitive ID of `U1`.

**Pin Mapping**:

```json
{
  "primitiveId": "U1_id",
  "pins": [
    { "pinNumber": "1", "pinName": "3V3" },
    { "pinNumber": "2", "pinName": "EN" },
    { "pinNumber": "15", "pinName": "GND" }
  ]
}
```

The AI verifies if the `EN` (Enable) pin is pulled high or left floating. If left floating, it warns the user that the microcontroller might remain disabled during startup.
