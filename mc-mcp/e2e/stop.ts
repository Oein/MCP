#!/usr/bin/env node
// Stops the Minecraft client the e2e suite leaves running between runs.
import { stopRunningGame } from "@mc-mcp/client";

const pid = await stopRunningGame();
console.log(pid ? `stopped the client (pid ${pid})` : "no client was running");
