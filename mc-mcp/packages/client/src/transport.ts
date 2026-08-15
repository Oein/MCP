import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Written by the Fabric mod on startup so nothing has to be copied by hand. */
export interface Handshake {
  port: number;
  token: string;
  pid?: number;
}

export const DEFAULT_HANDSHAKE_PATH =
  process.env.MCMCP_HANDSHAKE ?? join(homedir(), ".mcmcp", "bridge.json");

export class BridgeUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Cannot reach the Minecraft bridge: ${detail}\n` +
        `Start Minecraft 26.2 with the mcmcp-bridge mod installed, then retry.`,
    );
    this.name = "BridgeUnavailableError";
  }
}

/** An action the bridge rejected, as opposed to a transport failure. */
export class BridgeActionError extends Error {
  constructor(
    readonly action: string,
    message: string,
  ) {
    super(`${action}: ${message}`);
    this.name = "BridgeActionError";
  }
}

export interface TransportOptions {
  /** Path to the handshake file. Defaults to ~/.mcmcp/bridge.json. */
  handshakePath?: string;
  /** Default per-call timeout. */
  timeoutMs?: number;
}

/**
 * Raw JSON transport to the mod's loopback control server.
 *
 * <p>Kept separate from the typed client so tests can drive actions the client
 * has no wrapper for, and so a stale handshake (the game restarted and rotated
 * its port and token) is recovered from in one place.
 */
export class Transport {
  private handshake: Handshake | null = null;
  private readonly handshakePath: string;
  private readonly defaultTimeout: number;

  constructor(opts: TransportOptions = {}) {
    this.handshakePath = opts.handshakePath ?? DEFAULT_HANDSHAKE_PATH;
    this.defaultTimeout = opts.timeoutMs ?? 30_000;
  }

  private async load(force = false): Promise<Handshake> {
    if (this.handshake && !force) return this.handshake;
    let raw: string;
    try {
      raw = await readFile(this.handshakePath, "utf8");
    } catch {
      throw new BridgeUnavailableError(
        `no handshake file at ${this.handshakePath} (the game has not started the bridge yet)`,
      );
    }
    let parsed: Handshake;
    try {
      parsed = JSON.parse(raw) as Handshake;
    } catch {
      throw new BridgeUnavailableError(`handshake file at ${this.handshakePath} is not valid JSON`);
    }
    if (!parsed?.port || !parsed?.token) {
      throw new BridgeUnavailableError(`handshake file at ${this.handshakePath} is malformed`);
    }
    this.handshake = parsed;
    return parsed;
  }

  /** True when a bridge is listening and answering. */
  async healthy(): Promise<boolean> {
    try {
      const hs = await this.load(true);
      const res = await fetch(`http://127.0.0.1:${hs.port}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Forget the cached handshake; the next call re-reads it. */
  reset(): void {
    this.handshake = null;
  }

  async call<T = any>(
    action: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) clean[k] = v;
    }
    return this.request<T>(action, clean, timeoutMs ?? this.defaultTimeout, false);
  }

  private async request<T>(
    action: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    isRetry: boolean,
  ): Promise<T> {
    const hs = await this.load(isRetry);

    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${hs.port}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${hs.token}`,
        },
        body: JSON.stringify({ action, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new Error(
          `'${action}' did not answer within ${timeoutMs}ms. The game may be paused, ` +
            `loading, or stuck on a blocking screen.`,
        );
      }
      // A stale port after a game restart is the common case; re-read once.
      if (!isRetry) return this.request<T>(action, params, timeoutMs, true);
      const cause = err?.cause?.code ?? err?.cause?.message;
      throw new BridgeUnavailableError(
        `${err?.message ?? err}${cause ? ` (${cause})` : ""} connecting to 127.0.0.1:${hs.port}`,
      );
    }

    // 401 usually means the game restarted and rotated its token.
    if (response.status === 401 && !isRetry) {
      return this.request<T>(action, params, timeoutMs, true);
    }

    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`bridge returned non-JSON (HTTP ${response.status}): ${text.slice(0, 400)}`);
    }
    if (!response.ok || body?.ok === false) {
      throw new BridgeActionError(action, body?.error ?? `HTTP ${response.status}`);
    }
    return body as T;
  }
}
