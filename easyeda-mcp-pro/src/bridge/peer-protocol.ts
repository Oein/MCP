import { z } from 'zod';

/**
 * Peer protocol: how two `easyeda-mcp-pro` processes share one EasyEDA bridge.
 *
 * A stdio MCP server is spawned once per client, and every instance tries to
 * host the bridge WebSocket server. Only one can own the port, and the EasyEDA
 * extension only ever connects to one of them — so without this, the second
 * client silently gets a server whose bridge is permanently disconnected.
 *
 * The instance that wins the port is the host. Instances that lose attach to it
 * as peers over that same port and forward their bridge calls, so every client
 * talks to the one extension session. When the host exits, a peer takes the
 * port over.
 *
 * This is deliberately a loopback-only, same-machine mechanism: it exists to
 * de-duplicate processes that the MCP client itself spawned.
 */

export const PEER_PROTOCOL_VERSION = 1;

export const PeerHandshakeSchema = z.object({
  type: z.literal('peer_handshake'),
  peerProtocolVersion: z.number().int().positive(),
  clientName: z.string().max(120).optional(),
  sessionToken: z.string().max(512).optional(),
});

/** Everything a peer needs to answer diagnostics without its own extension. */
export const PeerBridgeSnapshotSchema = z.object({
  bridgeConnected: z.boolean(),
  activePort: z.number().int().nonnegative(),
  easyedaVersion: z.string().optional(),
  extensionVersion: z.string().optional(),
  extensionMethodListHash: z.string().optional(),
  loaderVersion: z.string().optional(),
  lastHeartbeatMs: z.number().nonnegative().optional(),
  connectedAtMs: z.number().nonnegative().optional(),
  lastDisconnectedAtMs: z.number().nonnegative().optional(),
  lastDisconnectReason: z.string().optional(),
});

export const PeerHelloSchema = z.object({
  type: z.literal('peer_hello'),
  peerProtocolVersion: z.number().int().positive(),
  hostVersion: z.string(),
  snapshot: PeerBridgeSnapshotSchema,
});

export const PeerRejectedSchema = z.object({
  type: z.literal('peer_rejected'),
  reason: z.string(),
});

export const PeerStateSchema = z.object({
  type: z.literal('peer_state'),
  snapshot: PeerBridgeSnapshotSchema,
});

export const PeerRequestSchema = z.object({
  type: z.literal('peer_request'),
  id: z.string().min(1).max(120),
  method: z.string().min(1).max(200),
  params: z.unknown().optional(),
  timeoutMs: z.number().int().positive().optional(),
  traceparent: z.string().max(200).optional(),
});

export const PeerResponseSchema = z.object({
  type: z.literal('peer_response'),
  id: z.string().min(1).max(120),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type PeerBridgeSnapshot = z.infer<typeof PeerBridgeSnapshotSchema>;
export type PeerHello = z.infer<typeof PeerHelloSchema>;
export type PeerRequest = z.infer<typeof PeerRequestSchema>;
export type PeerResponse = z.infer<typeof PeerResponseSchema>;

export function isPeerMessageType(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('peer_');
}
