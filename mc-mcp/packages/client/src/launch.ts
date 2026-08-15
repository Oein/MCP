import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_HANDSHAKE_PATH, Transport } from "./transport.js";
import { sleep } from "./wait.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The mc-mcp checkout.
 *
 * <p>Found by walking up until a directory contains the bridge mod, rather than
 * by counting {@code ..} segments: this file runs from {@code src/} under a type
 * stripper and from {@code dist/} once built, and those are different depths.
 */
export function projectRoot(): string {
  if (process.env.MCMCP_ROOT) return resolve(process.env.MCMCP_ROOT);

  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "bridge-mod", "gradlew"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate the mc-mcp checkout from ${HERE}. Set MCMCP_ROOT to it.`,
  );
}

export function bridgeModDir(): string {
  return join(projectRoot(), "bridge-mod");
}

export interface LaunchOptions {
  headless?: boolean;
  /** Block until the bridge answers. Default true. */
  waitForBridge?: boolean;
  timeoutMs?: number;
  /** Reuse an already-running client instead of starting one. Default true. */
  reuse?: boolean;
  /**
   * Let the game outlive this process.
   *
   * <p>Required by anything that runs across several Node processes -- a
   * {@code node:test} suite isolates each file in its own process, and an
   * attached child with piped stdio keeps its parent's event loop alive
   * forever. Detaching means the first process starts the game, every later one
   * attaches to it, and none of them hang on exit.
   */
  detached?: boolean;
}

export interface GameHandle {
  /** The process we started, or null when an existing client was reused. */
  readonly pid: number | null;
  readonly reused: boolean;
  /** Tail of the client's output, for diagnosing failures. */
  log(): string;
  stop(): Promise<void>;
}

function javaHome(): string | undefined {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  try {
    const found = execFileSync("/usr/libexec/java_home", ["-v", "25"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (found && existsSync(join(found, "bin", "java"))) return found;
  } catch {
    // not macOS, or no Java 25 registered
  }
  // Homebrew keeps openjdk@25 keg-only, so it never lands on PATH.
  return [
    "/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home",
    "/usr/lib/jvm/java-25-openjdk",
    "/usr/lib/jvm/java-25-openjdk-amd64",
    "/usr/lib/jvm/temurin-25-jdk",
  ].find((dir) => existsSync(join(dir, "bin", "java")));
}

/**
 * Forces client options that an agent-driven session depends on.
 *
 * - all sound categories muted, because a client nobody is watching should be silent
 * - {@code pauseOnLostFocus:false}, which is not cosmetic: the game window is
 *   almost never focused when a script drives it, and with the vanilla default
 *   the client opens the pause menu on focus loss, which stops a singleplayer
 *   world ticking entirely -- movement and pathfinding would simply never
 *   progress.
 */
async function prepareOptions(runDir: string): Promise<void> {
  await mkdir(runDir, { recursive: true });
  const optionsPath = join(runDir, "options.txt");

  const categories = [
    "master", "music", "record", "weather", "block",
    "hostile", "neutral", "player", "ambient", "voice",
  ];
  const forced = new Map(categories.map((c) => [`soundCategory_${c}`, "0.0"]));
  forced.set("pauseOnLostFocus", "false");

  let existing = "";
  try {
    existing = await readFile(optionsPath, "utf8");
  } catch {
    // first launch
  }

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const line of existing.split("\n")) {
    const key = line.split(":")[0] ?? "";
    if (forced.has(key)) {
      lines.push(`${key}:${forced.get(key)}`);
      seen.add(key);
    } else if (line.trim()) {
      lines.push(line);
    }
  }
  for (const [key, value] of forced) {
    if (!seen.has(key)) lines.push(`${key}:${value}`);
  }
  await writeFile(optionsPath, lines.join("\n") + "\n", "utf8");
}

/** Cross-process mutex so exactly one process starts the game. */
const LAUNCH_LOCK = join(dirname(DEFAULT_HANDSHAKE_PATH), "launch.lock");

/** How long a launch lock may sit before it is assumed abandoned. */
const LAUNCH_LOCK_STALE_MS = 10 * 60_000;

async function claimLaunchLock(): Promise<boolean> {
  await mkdir(dirname(LAUNCH_LOCK), { recursive: true });
  try {
    // "wx" fails if the file exists, which makes this atomic between processes.
    await writeFile(LAUNCH_LOCK, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    // A crashed launcher must not block every future run, so an old lock is
    // taken over rather than waited on forever.
    try {
      const age = Date.now() - (await stat(LAUNCH_LOCK)).mtimeMs;
      if (age > LAUNCH_LOCK_STALE_MS) {
        await writeFile(LAUNCH_LOCK, String(process.pid));
        return true;
      }
    } catch {
      // the lock vanished between the two calls; let the caller retry by waiting
    }
    return false;
  }
}

async function releaseLaunchLock(): Promise<void> {
  await rm(LAUNCH_LOCK, { force: true }).catch(() => {});
}

/**
 * Stops whichever client is currently listening, whoever started it.
 *
 * <p>Uses the JVM pid the mod publishes in the handshake, so it works across
 * processes -- a detached game started by one test run can be shut down by
 * another, or from a script.
 *
 * @returns the pid it signalled, or null when nothing was running
 */
export async function stopRunningGame(): Promise<number | null> {
  let pid: number | null = null;
  try {
    const raw = await readFile(DEFAULT_HANDSHAKE_PATH, "utf8");
    pid = (JSON.parse(raw) as { pid?: number }).pid ?? null;
  } catch {
    return null;
  }
  if (!pid) return null;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return null; // already gone
  }

  // Give the client a chance to save and shut down cleanly before insisting.
  const transport = new Transport();
  for (let i = 0; i < 40; i++) {
    if (!(await transport.healthy())) return pid;
    await sleep(500);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // it exited between the check and the signal
  }
  return pid;
}

/**
 * Starts Minecraft with the bridge mod, or attaches to one already running.
 *
 * <p>Reuse is the default because a cold start costs the better part of a
 * minute: an iterating test run should pay that once, not once per file.
 */
export async function launchGame(opts: LaunchOptions = {}): Promise<GameHandle> {
  const {
    headless = false,
    waitForBridge = true,
    timeoutMs = 180_000,
    reuse = true,
    detached = false,
  } = opts;

  const transport = new Transport();
  const attached: GameHandle = {
    pid: null,
    reused: true,
    log: () => "(attached to an already-running client)",
    stop: async () => {
      // Not ours to stop.
    },
  };

  if (reuse && (await transport.healthy())) return attached;

  // Only one process may start the game. Without this, a node:test run --
  // which gives every test file its own process -- has each of them find no
  // bridge and launch its own client, and the second one cannot open the world
  // the first has already locked.
  if (reuse) {
    const claimed = await claimLaunchLock();
    if (!claimed) {
      // Someone else is starting it; wait for their client rather than racing.
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await transport.healthy()) return attached;
        await sleep(1000);
      }
      throw new Error(
        `another process is starting Minecraft but it did not come up within ${timeoutMs}ms. ` +
          `If nothing is running, delete ${LAUNCH_LOCK}.`,
      );
    }
  }

  const modDir = bridgeModDir();
  if (!existsSync(join(modDir, "gradlew"))) {
    await releaseLaunchLock();
    throw new Error(
      `cannot find the bridge mod project at ${modDir}. ` +
        `Set MCMCP_ROOT to the mc-mcp checkout if it lives elsewhere.`,
    );
  }

  const runDir = join(modDir, "run");
  await prepareOptions(runDir);

  const env = { ...process.env };
  const jh = javaHome();
  if (jh) env.JAVA_HOME = jh;
  else if (!process.env.JAVA_HOME) {
    throw new Error(
      "Java 25 was not found. Minecraft 26.2 requires it. Install with: brew install openjdk@25",
    );
  }

  const args = ["runClient", "--no-daemon"];
  if (headless) args.push("-Pheadless=true");

  // Detached runs send output to a file instead of pipes: an attached pipe is
  // exactly what would keep this process alive after its work is done.
  const logPath = join(runDir, "mcmcp-launch.log");
  // Loud on purpose: with a pretest step doing the launching, a spawn from
  // inside a test process means something bypassed it, and two clients fighting
  // over one save is otherwise puzzling to diagnose.
  console.error(`[mc-mcp] starting Minecraft (pid ${process.pid} is the launcher)`);

  const chunks: string[] = [];
  let child: ChildProcess;

  if (detached) {
    const fd = openSync(logPath, "w");
    child = spawn(join(modDir, "gradlew"), args, {
      cwd: modDir,
      env,
      stdio: ["ignore", fd, fd],
      detached: true,
    });
    closeSync(fd);
    child.unref();
  } else {
    child = spawn(join(modDir, "gradlew"), args, {
      cwd: modDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const record = (buf: Buffer) => {
      chunks.push(buf.toString());
      if (chunks.length > 500) chunks.splice(0, chunks.length - 500);
    };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);
  }

  const tail = () => {
    if (!detached) return chunks.join("").slice(-4000);
    try {
      return readFileSync(logPath, "utf8").slice(-4000);
    } catch {
      return `(no output; see ${logPath})`;
    }
  };

  const handle: GameHandle = {
    pid: child.pid ?? null,
    reused: false,
    log: tail,
    stop: async () => {
      // Gradle forks the JVM, so killing the wrapper leaves the game running.
      // Detached runs get their own process group, which can be signalled whole;
      // otherwise fall back to the JVM pid the mod published.
      if (detached && child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          // group already gone
        }
      } else if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
      await stopRunningGame();
      for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(250);
      if (!detached && child.exitCode === null) child.kill("SIGKILL");
    },
  };

  if (!waitForBridge) {
    // Nothing will observe the bridge coming up, so the lock has done its job.
    await releaseLaunchLock();
    return handle;
  }

  const exited = new Promise<never>((_, reject) => {
    child.once("exit", (code) =>
      reject(new Error(`Minecraft exited during startup (code ${code}).\n${tail()}`)),
    );
  });
  const ready = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await transport.healthy()) return;
      await sleep(1000);
    }
    throw new Error(`the bridge did not come up within ${timeoutMs}ms.\n${tail()}`);
  })();

  try {
    await Promise.race([ready, exited]);
  } catch (err) {
    await handle.stop();
    throw err;
  } finally {
    // Released only once the outcome is known: waiters key off the bridge being
    // healthy, and freeing it earlier would let a second process start its own
    // client while this one is still booting.
    await releaseLaunchLock();
  }
  return handle;
}
