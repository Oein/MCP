# Claude Prompt Examples

Here are typical prompts you can use with Claude Desktop (or other MCP-enabled AI assistants) to control and query `easyeda-mcp-pro`.

---

## 1. Project Health & Connection Check

Use this prompt to ensure Claude has successfully connected to the EasyEDA Pro bridge extension:

```text
Check the bridge connection status and verify that you can talk to my EasyEDA Pro editor. Let me know which tools profile is active.
```

---

## 2. Schematic Review

Use this prompt to perform a sanity check on a schematic sheet:

```text
List all the components in the active schematic sheet. Check if we have any disconnected pins or floating nets, and summarize any potential issues you see.
```

---

## 3. BOM & Sourcing Check

Use this prompt to check your components against LCSC stock and pricing:

```text
Generate a Bill of Materials for this project. Validate it against LCSC's live inventory to check for out-of-stock parts or obsolete components, and suggest pin-compatible alternatives if any are found.
```

---

## 4. Manufacturing Audit

Use this prompt to prepare the project for fabrication:

```text
Run a Design Rule Check (DRC) and an Electrical Rule Check (ERC). Summarize all violations, highlight any critical clearance errors, and if everything looks clean, export the Gerber fabrication files.
```

---

## 5. Mutating Design (Placing a decoupling capacitor)

Use this prompt to modify the layout (requires confirming writes):

```text
Place a 100nF decoupling capacitor (LCSC Part: C14663) at coordinates x=120, y=180 on the schematic sheet. Connect it to the VCC and GND nets. Make sure you set confirmWrite=true.
```
