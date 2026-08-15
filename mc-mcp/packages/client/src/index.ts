export { McClient, type Face, type Hand, type MoveInput, type GotoOptions } from "./client.js";
export {
  Transport,
  BridgeUnavailableError,
  BridgeActionError,
  DEFAULT_HANDSHAKE_PATH,
  type Handshake,
  type TransportOptions,
} from "./transport.js";
export {
  launchGame,
  stopRunningGame,
  projectRoot,
  bridgeModDir,
  type GameHandle,
  type LaunchOptions,
} from "./launch.js";
export { waitFor, retry, sleep, WaitTimeoutError, type WaitOptions } from "./wait.js";
export * from "./types.js";

import { McClient } from "./client.js";
import type { TransportOptions } from "./transport.js";

/**
 * Connects to a running bridge.
 *
 * @throws if no bridge is listening, so a caller finds out here rather than on
 * their first action.
 */
export async function connect(opts: TransportOptions = {}): Promise<McClient> {
  const client = new McClient(opts);
  if (!(await client.transport.healthy())) {
    throw new Error(
      "no Minecraft bridge is listening. Start the game first — " +
        "either scripts/setup.sh && bridge-mod/gradlew runClient, or launchGame() from this package.",
    );
  }
  return client;
}
