#!/usr/bin/env node
/**
 * Brings the game up before the test runner starts.
 *
 * <p>node:test gives every test file its own process. If each of them decided
 * for itself whether to launch, several would find no bridge during the minute
 * the first client takes to boot and start their own — and two clients cannot
 * hold the same save. Launching here, once, means every test process only ever
 * attaches, so the race cannot happen at all rather than being arbitrated.
 */
import { launchGame } from "@mc-mcp/client";

const headless = process.env.MCMCP_HEADLESS !== "0";
const timeoutMs = Number(process.env.MCMCP_LAUNCH_TIMEOUT_MS ?? 240_000);

const game = await launchGame({ headless, detached: true, timeoutMs });
console.log(
  game.reused
    ? "attached to the client that was already running"
    : `started Minecraft (${headless ? "headless" : "windowed"}); it stays up between runs — npm run e2e:stop to end it`,
);
