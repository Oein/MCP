import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { getLogger } from '../utils/logger.js';
import {
  PEER_PROTOCOL_VERSION,
  PeerHelloSchema,
  PeerRejectedSchema,
  PeerResponseSchema,
  PeerStateSchema,
  type PeerBridgeSnapshot,
} from './peer-protocol.js';

export interface PeerLinkOptions {
  host: string;
  port: number;
  sessionToken?: string;
  clientName?: string;
  connectTimeoutMs: number;
}

interface PendingPeerCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Client half of the peer protocol — see peer-protocol.ts for why it exists.
 * Forwards this process's bridge calls to the instance that owns the port, and
 * mirrors that instance's bridge state so diagnostics stay truthful.
 */
export class PeerBridgeLink extends EventEmitter {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingPeerCall>();
  private counter = 0;
  private closed = false;
  private _snapshot: PeerBridgeSnapshot = { bridgeConnected: false, activePort: 0 };

  constructor(private readonly options: PeerLinkOptions) {
    super();
  }

  get snapshot(): PeerBridgeSnapshot {
    return this._snapshot;
  }

  get attached(): boolean {
    return !this.closed && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Resolves once the host has accepted this peer, rejects if it refuses or
   *  never answers — the caller then falls back to hosting the bridge itself. */
  attach(): Promise<void> {
    const url = `ws://${this.options.host}:${this.options.port}`;
    const ws = new WebSocket(url, { handshakeTimeout: this.options.connectTimeoutMs });
    this.ws = ws;
    // A socket that never completed its handshake still emits errors while it
    // is being torn down; without a listener those reach the process as
    // uncaught exceptions.
    ws.on('error', () => {});

    /** Abandon this socket without letting teardown throw into the caller. */
    const abandon = () => {
      try {
        ws.terminate();
      } catch {
        // already closing
      }
    };

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Peer attach to ${url} timed out`));
        abandon();
      }, this.options.connectTimeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        ws.off('message', onHandshakeMessage);
        ws.off('error', onError);
        ws.off('close', onClose);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        reject(new Error(`Peer attach to ${url} closed before hello`));
      };

      const onHandshakeMessage = (raw: WebSocket.RawData) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const rejected = PeerRejectedSchema.safeParse(parsed);
        if (rejected.success) {
          cleanup();
          reject(new Error(`Peer attach rejected: ${rejected.data.reason}`));
          abandon();
          return;
        }
        const hello = PeerHelloSchema.safeParse(parsed);
        if (!hello.success) return;
        if (hello.data.peerProtocolVersion !== PEER_PROTOCOL_VERSION) {
          cleanup();
          reject(
            new Error(
              `Peer protocol mismatch: host speaks ${hello.data.peerProtocolVersion}, this process speaks ${PEER_PROTOCOL_VERSION}`,
            ),
          );
          abandon();
          return;
        }
        cleanup();
        this._snapshot = hello.data.snapshot;
        this.listen(ws);
        getLogger().info(
          {
            url,
            hostVersion: hello.data.hostVersion,
            bridgeConnected: this._snapshot.bridgeConnected,
          },
          'attached to an existing bridge host as a peer',
        );
        resolve();
      };

      ws.on('message', onHandshakeMessage);
      ws.once('error', onError);
      ws.once('close', onClose);
      ws.once('open', () => {
        ws.send(
          JSON.stringify({
            type: 'peer_handshake',
            peerProtocolVersion: PEER_PROTOCOL_VERSION,
            clientName: this.options.clientName,
            sessionToken: this.options.sessionToken,
          }),
        );
      });
    });
  }

  private listen(ws: WebSocket): void {
    ws.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const state = PeerStateSchema.safeParse(parsed);
      if (state.success) {
        this._snapshot = state.data.snapshot;
        this.emit('state', this._snapshot);
        return;
      }
      const response = PeerResponseSchema.safeParse(parsed);
      if (!response.success) return;
      const entry = this.pending.get(response.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(response.data.id);
      if (response.data.error) entry.reject(new Error(response.data.error));
      else entry.resolve(response.data.result);
    });

    ws.on('close', () => {
      this.rejectAll(new Error('Bridge host closed the peer link'));
      this._snapshot = { ...this._snapshot, bridgeConnected: false };
      this.ws = null;
      if (!this.closed) this.emit('detached');
    });

    ws.on('error', (error) => {
      getLogger().debug({ err: error.message }, 'peer link socket error');
    });
  }

  async call<TResult>(
    method: string,
    params: unknown,
    opts: { timeoutMs: number; traceparent?: string },
  ): Promise<TResult> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Bridge not connected. Cannot call method "${method}".`);
    }
    const id = `peer_${++this.counter}`;
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge peer call "${method}" timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      ws.send(
        JSON.stringify({
          type: 'peer_request',
          id,
          method,
          params,
          timeoutMs: opts.timeoutMs,
          traceparent: opts.traceparent,
        }),
      );
    });
  }

  private rejectAll(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  close(): void {
    this.closed = true;
    this.rejectAll(new Error('Peer link closed'));
    this.ws?.close();
    this.ws = null;
  }
}
