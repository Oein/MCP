export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface WaitOptions {
  /** Give up after this long. */
  timeoutMs?: number;
  /** How often to re-check. */
  intervalMs?: number;
  /** Included in the timeout message, so failures say what was being waited for. */
  description?: string;
}

export class WaitTimeoutError extends Error {
  constructor(description: string, timeoutMs: number, lastValue: unknown) {
    super(
      `timed out after ${timeoutMs}ms waiting for ${description}` +
        (lastValue === undefined ? "" : `; last observed: ${JSON.stringify(lastValue)}`),
    );
    this.name = "WaitTimeoutError";
  }
}

/**
 * Polls until {@code produce} yields a value the predicate accepts.
 *
 * <p>Almost everything in Minecraft is asynchronous with respect to a caller --
 * chunks load, the server acknowledges a block change, a path finishes a tick
 * later -- so a test that asserts immediately after acting is flaky by
 * construction. This is the one place that retry lives.
 */
export async function waitFor<T>(
  produce: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: WaitOptions = {},
): Promise<T> {
  const { timeoutMs = 15_000, intervalMs = 200, description = "condition" } = opts;
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;

  for (;;) {
    last = await produce();
    if (predicate(last)) return last;
    if (Date.now() >= deadline) throw new WaitTimeoutError(description, timeoutMs, last);
    await sleep(intervalMs);
  }
}

/**
 * Retries an action that may fail transiently (a chunk not loaded yet, a screen
 * mid-transition). Distinct from {@link waitFor}, which polls a value.
 */
export async function retry<T>(
  action: () => Promise<T>,
  opts: WaitOptions = {},
): Promise<T> {
  const { timeoutMs = 15_000, intervalMs = 250, description = "action" } = opts;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (;;) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (Date.now() >= deadline) {
        throw new Error(
          `${description} kept failing for ${timeoutMs}ms; last error: ${
            (lastError as Error)?.message ?? lastError
          }`,
        );
      }
      await sleep(intervalMs);
    }
  }
}
