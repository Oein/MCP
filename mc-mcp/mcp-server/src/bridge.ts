import { Transport, BridgeUnavailableError } from "@mc-mcp/client";

export { BridgeUnavailableError };

/**
 * The MCP server's handle on the game.
 *
 * <p>Deliberately the same transport the @mc-mcp/client package exposes to
 * scripts and e2e tests, so the tools and the tests exercise one code path
 * rather than two that can drift apart.
 */
export const bridge = new Transport();
