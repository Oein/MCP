import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { describe, it, expect } from 'vitest';
import { EnvSchema } from '../../../src/config/env.js';
import { BridgeManager } from '../../../src/bridge/manager.js';
import { BRIDGE_CONTRACT_VERSION } from '../../../src/bridge/protocol.js';
import { SERVER_VERSION } from '../../../src/config/version.js';

/**
 * One EasyEDA extension, several MCP server processes: the instance that wins
 * the port hosts the extension and the others relay through it. Without this,
 * the second stdio client silently gets a permanently disconnected bridge.
 */

function createTestConfig(overrides: Record<string, unknown> = {}) {
  return EnvSchema.parse({ NODE_ENV: 'test', BRIDGE_WAIT_FOR_EDA_MS: 0, ...overrides });
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a local test port')));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

/** Stand-in for the EasyEDA extension: handshakes, then echoes every request. */
async function connectFakeExtension(port: number, methodListHash: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(
    JSON.stringify({
      type: 'handshake',
      protocol: 'easyeda-mcp-pro.bridge',
      protocolVersion: '1.0.0',
      contractVersion: BRIDGE_CONTRACT_VERSION,
      clientName: 'easyeda-mcp-pro',
      extensionVersion: SERVER_VERSION,
      easyedaVersion: '3.2.149',
      methodListHash,
      loaderVersion: SERVER_VERSION,
      devMode: true,
    }),
  );
  await new Promise<void>((resolve) => ws.once('message', () => resolve()));
  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString()) as { type?: string; id?: string; method?: string };
    if (data.type !== 'request') return;
    ws.send(
      JSON.stringify({ type: 'response', id: data.id, ok: true, result: { echoed: data.method } }),
    );
  });
  return ws;
}

/** Retries because the takeover binds the port a moment after it detaches. */
async function connectFakeExtensionWhenListening(
  port: number,
  methodListHash: string,
): Promise<WebSocket> {
  const deadline = Date.now() + 4000;
  for (;;) {
    try {
      return await connectFakeExtension(port, methodListHash);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition not met before timeout');
}

describe('bridge sharing between server instances', () => {
  it('relays a second instance through the one that owns the port', async () => {
    const port = await getFreePort();
    const config = createTestConfig({ BRIDGE_HOST: '127.0.0.1', BRIDGE_PORT_SCAN: String(port) });
    const host = new BridgeManager(config);
    await host.connect();
    const extension = await connectFakeExtension(port, host.methodRegistryHash);
    await waitFor(() => host.connected);

    const peer = new BridgeManager(config);
    await peer.connect();

    try {
      expect(peer.isPeer).toBe(true);
      expect(host.isPeer).toBe(false);
      expect(peer.activePort).toBe(port);
      expect(peer.connected).toBe(true);

      // The peer never talks to the extension itself; the host runs the call.
      await expect(peer.call('board.getDimensions', {})).resolves.toEqual({
        echoed: 'board.getDimensions',
      });

      // Diagnostics mirror the host so health_check stays truthful on a peer.
      expect(peer.extensionVersion).toBe(SERVER_VERSION);
      expect(peer.easyedaVersion).toBe('3.2.149');
      expect(peer.registryMismatch).toBe(false);
    } finally {
      peer.disconnect('test complete');
      extension.close();
      host.disconnect('test complete');
    }
  });

  it('reports the extension going away to peers instead of leaving them optimistic', async () => {
    const port = await getFreePort();
    const config = createTestConfig({ BRIDGE_HOST: '127.0.0.1', BRIDGE_PORT_SCAN: String(port) });
    const host = new BridgeManager(config);
    await host.connect();
    const extension = await connectFakeExtension(port, host.methodRegistryHash);
    await waitFor(() => host.connected);

    const peer = new BridgeManager(config);
    await peer.connect();
    expect(peer.connected).toBe(true);

    try {
      extension.close();
      await waitFor(() => !peer.connected);
      expect(peer.connected).toBe(false);
      await expect(peer.call('board.getDimensions', {})).rejects.toThrow();
    } finally {
      peer.disconnect('test complete');
      host.disconnect('test complete');
    }
  });

  it('lets a peer take the port over when the host process exits', async () => {
    const port = await getFreePort();
    const config = createTestConfig({ BRIDGE_HOST: '127.0.0.1', BRIDGE_PORT_SCAN: String(port) });
    const host = new BridgeManager(config);
    await host.connect();
    const extension = await connectFakeExtension(port, host.methodRegistryHash);
    await waitFor(() => host.connected);

    const peer = new BridgeManager(config);
    await peer.connect();
    expect(peer.isPeer).toBe(true);

    try {
      extension.close();
      host.disconnect('host process exiting');

      // The surviving instance stops relaying and starts hosting, so the
      // extension has something to reconnect to.
      await waitFor(() => !peer.isPeer && peer.activePort === port);
      expect(peer.isPeer).toBe(false);

      const rejoined = await connectFakeExtensionWhenListening(port, peer.methodRegistryHash);
      await waitFor(() => peer.connected);
      expect(peer.connected).toBe(true);
      rejoined.close();
    } finally {
      peer.disconnect('test complete');
    }
  });
});
