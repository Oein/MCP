import {
  launchGame as launchShared,
  stopRunningGame,
  bridgeModDir,
  type GameHandle,
} from "@mc-mcp/client";
import { join } from "node:path";

/**
 * Game process control for the MCP tools.
 *
 * <p>A thin layer over the shared launcher rather than a second implementation
 * of it. The e2e suite exercises that launcher hard -- the process-start mutex,
 * the detached spawn, the option file it writes -- and a private copy here
 * would mean the path an agent actually takes is the one nobody tested.
 */

let handle: GameHandle | null = null;
/** Why the client died, if it died after a successful launch. */
let exitReason: string | null = null;

export function lastExitReason(): string | null {
  return exitReason;
}

export interface LaunchOptions {
  headless?: boolean;
  waitForBridge?: boolean;
  timeoutMs?: number;
}

export function gameStatus(): Record<string, unknown> {
  return {
    running: handle !== null,
    startedByUs: handle !== null && !handle.reused,
    runDir: join(bridgeModDir(), "run"),
    ...(exitReason ? { exited: exitReason } : {}),
  };
}

export async function launchGame(opts: LaunchOptions = {}): Promise<Record<string, unknown>> {
  const { headless = false, waitForBridge = true, timeoutMs = 180_000 } = opts;

  exitReason = null;
  try {
    // Detached so the game survives an MCP server restart, and so nothing here
    // holds a child handle that would keep this process alive.
    handle = await launchShared({ headless, waitForBridge, timeoutMs, detached: true });
  } catch (err: any) {
    exitReason = String(err?.message ?? err);
    throw err;
  }

  if (handle.reused) {
    return {
      alreadyRunning: true,
      note: "a client was already listening; attached to it instead of starting another",
      ...gameStatus(),
    };
  }
  return {
    started: true,
    headless,
    bridgeReady: waitForBridge,
    note: headless
      ? "running with a hidden window; mc_screenshot still works"
      : "the game window is open",
    ...gameStatus(),
  };
}

export async function stopGame(): Promise<Record<string, unknown>> {
  const pid = await stopRunningGame();
  handle = null;
  if (pid === null) return { stopped: false, note: "no client was running" };
  return { stopped: true, pid };
}
