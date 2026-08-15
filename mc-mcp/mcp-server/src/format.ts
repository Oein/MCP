import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { lastExitReason } from "./launcher.js";

/** Renders a bridge response as a compact JSON text block. */
export function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** Renders a short human sentence plus the raw payload. */
export function summary(line: string, value?: unknown): CallToolResult {
  const text = value === undefined ? line : `${line}\n\n${JSON.stringify(value, null, 2)}`;
  return { content: [{ type: "text", text }] };
}

export function failure(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wraps a handler so bridge errors surface as tool errors, not crashes. */
export function guard<A extends unknown[]>(
  fn: (...args: A) => Promise<CallToolResult>,
): (...args: A) => Promise<CallToolResult> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err: any) {
      let message = String(err?.message ?? err);
      // If the client we started has since died, that is the real explanation
      // for an unreachable bridge -- surface it instead of a bare refusal.
      if (err?.name === "BridgeUnavailableError") {
        const reason = lastExitReason();
        if (reason) message += `\n\n${reason}`;
      }
      return failure(message);
    }
  };
}
