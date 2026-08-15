# Troubleshooting Guide

This guide helps resolve common issues encountered while setting up and running `easyeda-mcp-pro`.

---

## 1. MCP Client Cannot Start the Server

### Symptom:

The AI client (e.g. Claude Desktop or Cursor) displays an error: `"Failed to start MCP server"` or `"Process exited with code 1"`.

### Resolving Node.js and Command Conflicts:

1. **Wrong runtime**: Use Node.js **24.x**. A source checkout is pinned to Node.js **24.18.0** and pnpm **11.5.1**; pnpm is not required for an installed package or production runtime. Run `npx easyeda-mcp-pro doctor --fix` first, and use `node scripts/check-runtime.mjs --require-pnpm` only for repository workflows.
2. **Global `npx` not found**: If `npx` is not in the system PATH, specify the absolute path to `node` and pointing to `dist/index.js` instead.
3. **Execution Policy (Windows)**: In Windows PowerShell, if scripts are disabled, use `.cmd` commands or run from command prompt (`cmd`).
4. **Restore the pinned local toolchain**:

   ```bash
   nvm install 24.18.0
   nvm use 24.18.0
   corepack enable
   corepack prepare pnpm@11.5.1 --activate
   ```

5. **Stale user service**: `doctor --fix` inspects `easyeda-mcp-pro.service`. If its absolute `ExecStart` Node path no longer exists, stop/disable that unit and rerun MCP client setup under Node 24.18.0 instead of leaving `Restart=on-failure` in a restart loop.

---

## 2. EasyEDA Bridge Disconnected

### Symptom:

`easyeda_health_check` shows `bridge_connected: false` and tools targeting the schematic/PCB return `not_available` or WebSocket timeouts.

### Checklist:

1. **Connect via Menu**: In EasyEDA Pro, verify that you clicked **MCP Bridge** → **Connect** in the menu bar. If connected, the menu should display a checkmark or status indicating active socket connections.
2. **Extension Permissions**: Go to **Settings** → **Extensions** → **Extension Manager** and make sure **Allow External Interaction** is checked for the MCP Pro Bridge extension. Without this, EasyEDA blocks external WebSocket connections and some EasyEDA v3 builds fail silently before any socket is opened.
3. **Port Conflict**: The bridge defaults to port `49620`. If it is in use by another application, the extension will fail to bind. Run the doctor tool to diagnose:
   ```bash
   npx easyeda-mcp-pro doctor
   ```
   Add `--fix` to print a suggested-fixes section with the exact command or setting to
   change for each detected failure (Node version, missing pnpm, invalid env, missing
   build artifacts, unreachable bridge port, missing vendor credentials). `doctor --fix`
   never modifies files — it only prints guidance.
4. **Port Scan Configuration**: If you changed ports, ensure the server env var `BRIDGE_PORT` or `BRIDGE_PORT_SCAN` aligns with the extension's configured port (default is `49620`).
5. **Extension Version Mismatch**: `easyeda_health_check` and `easyeda_run_self_test` report
   `extension_version_mismatch: true` (and the mismatched versions) when the connected
   bridge extension's version differs from the installed `easyeda-mcp-pro` package
   version. Update the extension in EasyEDA Pro (Settings → Extensions → Extension
   Manager) or reinstall `easyeda-bridge-extension.eext` from a matching release.
6. **Read the connection phase**: Newer bridge builds append the last failed phase to the offline message. In particular, `SYS_WebSocket.register() ... did not invoke its open callback` means the EasyEDA runtime accepted the preferred registration API but never reported a usable socket. The extension closes that handle without sending and retries the same port through `SYS_WebSocket.create()` and then browser WebSocket. If no alternate API exists, the phase remains visible instead of being collapsed into the generic `no local server found` message. Other phase messages distinguish an unavailable socket API, an open timeout, a socket that opened without returning bridge `hello`, an early close, and an explicit socket error.

7. **The extension restarted mid-session**: EasyEDA Pro can reload the extension on its own, which drops the socket without any user action. `easyeda_bridge_status` reports `diagnostics.last_disconnected_at`, `diagnostics.disconnected_ms_ago`, and `diagnostics.last_disconnect_reason` so you can tell when the session actually broke instead of inferring it from server uptime. The server hosts the socket and cannot dial the extension back — reconnect from **MCP Bridge** → **Connect** in EasyEDA Pro.

---

## 2a. Several MCP Clients, One EasyEDA

### Symptom:

Two MCP clients (two Claude Code sessions, or Claude Code plus another agent) are configured against this server, and only one of them reports `bridge_connected: true`.

### How the server handles it:

A stdio MCP server is spawned once per client, so each client gets its own process, and only one process can own the bridge WebSocket port that the EasyEDA extension connects to. Instances that lose the port **attach to the winner as peers** and forward their bridge calls through it, so every client talks to the one extension session. `easyeda_bridge_status` reports the same `diagnostics.active_port` from every instance, and a peer mirrors the host's `extension_version`, `easyeda_version`, and registry-hash state so `easyeda_health_check` stays truthful. When the host process exits, a surviving peer takes the port over and the extension reconnects to it.

For this to work, every client must be configured with the **same bridge port**, and the scan range should be a single port:

```json
"env": { "BRIDGE_PORT": "49620", "BRIDGE_PORT_SCAN": "49620-49620" }
```

A wide `BRIDGE_PORT_SCAN` defeats it: the second instance simply binds the next free port and waits forever for an extension that is never coming.

Notes and limits:

- Peer attach is loopback-only, and requires the same `BRIDGE_TOKEN` when one is configured. It exists to de-duplicate processes on this machine, not to relay remote callers into EasyEDA.
- Sharing a bridge does not serialize edits. Two agents writing to the same board will overwrite each other, and moving a component changes primitive IDs the other agent may still be holding. Keep writes on one agent.
- The focused document tab is global. `easyeda_focus_document` on one agent changes what every other agent sees.

---

## 2b. Wrong Editor Tab Focused

### Symptom:

A schematic tool fails with an untranslated native error (for example `获取器件关联的所有引脚失败`), or a PCB read returns `total: 0` on a board that clearly has content.

### Cause and fix:

Most schematic and PCB calls only work against the document EasyEDA Pro currently has focused, and not every tool fails loudly when the wrong tab is active — `easyeda_schematic_components` reads from the project file and succeeds regardless, which makes it easy to conclude that focus is fine when it is not.

1. `easyeda_health_check` reports the focused tab as `active_document.kind` (`pcb`, `schematic`, `none`, or `unknown`), plus whether each kind is available at all.
2. `easyeda_focus_document` switches the tab. It verifies the switch by re-reading the active document and reports `focused: false` with a remediation if the tab did not actually change, so a silent no-op is never reported as success. The user sees the tab change.
3. Schematic→PCB synchronization still requires the human to confirm EasyEDA Pro's native dialog — focusing a tab does not bypass that.

---

## 3. Supplier API Credentials Missing

### Symptom:

Pricing or sourcing tools return `redacted` or empty supplier prices.

### Solution:

Verify that your credentials are set in the `.env` file at the directory where you start the server:

- JLCPCB requires `JLCPCB_CLIENT_ID` and `JLCPCB_CLIENT_SECRET` in `approved_api` mode.
- Mouser requires `MOUSER_API_KEY`.
- DigiKey requires `DIGIKEY_CLIENT_ID` and `DIGIKEY_CLIENT_SECRET`.

---

## 4. Remote Relay Misconfiguration

### Symptom:

You set `MCP_BRIDGE_BACKEND=remote_relay`, but remote tool calls fail before reaching EasyEDA Pro or report that no relay session is available.

### Checklist:

Run:

```bash
npx easyeda-mcp-pro doctor --fix
```

The doctor output includes a `Remote backend:` line. For Remote Relay mode it checks whether:

- `TRANSPORT=http` is configured, so `/remote/*` relay endpoints are mounted.
- `MCP_REMOTE_SESSION_ID` is configured, or each MCP request is expected to pass `remoteSessionId`.
- `OAUTH_ENABLED=true` is set for production identity propagation.
- `HTTP_AUTH_DISABLED=true` is not accidentally used outside loopback-only development.

`remote_relay` remains experimental. Use the default `MCP_BRIDGE_BACKEND=local_bridge` unless you are explicitly testing a paired Remote Relay session.

---

## 5. HTTP Transport Blocked by OAuth Safety Check

### Symptom:

The server exits on startup when using `TRANSPORT=http` with the error:
`"SAFETY: HTTP_HOST is not a loopback address but OAUTH_ENABLED is false."`

### Rationale & Solution:

For security, binding the server to an external network interface (e.g. `HTTP_HOST=0.0.0.0`) without active authentication is blocked to prevent exposing your local EasyEDA instance to the public web.
For local development, bind to `127.0.0.1`. Every non-loopback deployment—including development and test processes—must configure `OAUTH_ENABLED=true`, `OAUTH_JWKS_URI`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, and an explicit non-wildcard `ALLOWED_ORIGINS` value.

---

## 6. Stale MCP Client Config

### Symptom:

Running `npx easyeda-mcp-pro setup <client>` (or `setup all`) prints "Stale entry
detected and replaced" for a client instead of "Existing entry was already up to date."

### Rationale & Solution:

This means the client's MCP config file already had an `easyeda-mcp-pro` entry that
differed from the one `setup` just wrote (for example, an entry from an older version
that pointed at a local build path, or one missing a `TOOL_PROFILE` env var). The lines
under "Stale entry detected and replaced" list exactly what changed
(`command`, `args`, or `env`). `setup` always writes the correct current entry, so no
further action is needed — restart the client to pick up the corrected config.

---

## 7. Release Pipeline / NPM Token Failures

### Symptom:

The GitHub Actions release workflow fails on the `Publish to npm` step.

### Solution:

Verify that `NPM_TOKEN` is set in your repository's secrets. The workflow will explicitly check for it and fail with a clear, readable error if it is not configured.
If you get OIDC token failures, verify that your repository is not restricted from fetching OIDC tokens from `registry.npmjs.org` or GitHub's authentication service.
