package dev.mcmcp.bridge.actions;

import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ChatLog;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.fabricmc.loader.api.FabricLoader;

import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/**
 * Baritone-driven navigation: "walk to these coordinates like a player would".
 *
 * <p>Goals are set through Baritone's Java API rather than its chat prefix,
 * because the API is the only way to get a trustworthy completion signal --
 * chat output tells you a path was requested, not that the player arrived.
 * Arbitrary Baritone commands still go through chat, since that surface covers
 * far more than the API does.
 */
final class BaritoneActions {
	/** Baritone's default chat prefix. */
	private static final String PREFIX = "#";

	private BaritoneActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("baritone_goto", BaritoneActions::gotoGoal);
		h.put("baritone_command", BaritoneActions::command);
		h.put("baritone_stop", BaritoneActions::stop);
		h.put("baritone_status", BaritoneActions::status);
		h.put("baritone_wait", BaritoneActions::waitUntilDone);
	}

	static boolean isPresent() {
		return FabricLoader.getInstance().isModLoaded("baritone") || classPresent("baritone.api.BaritoneAPI");
	}

	private static boolean classPresent(String name) {
		try {
			Class.forName(name, false, BaritoneActions.class.getClassLoader());
			return true;
		} catch (Throwable t) {
			return false;
		}
	}

	private static void requirePresent() {
		if (!isPresent()) {
			throw new IllegalStateException("Baritone is not installed in this instance. "
					+ "Put baritone-api-fabric-<version>.jar (the 'api' flavour) into the mods folder.");
		}
		// Done here rather than at mod init: Baritone has to be loaded before its
		// settings exist, and this is the first point where we know it is.
		try {
			BaritoneNative.captureLogger();
		} catch (Throwable t) {
			// Losing Baritone's chat output is not worth failing the action over.
			dev.mcmcp.bridge.McMcpBridge.LOG.warn("[mc-mcp] could not capture Baritone's logger", t);
		}
	}

	/** Wraps a native call so a missing/renamed Baritone reads as a clean error. */
	private static <T> T viaApi(java.util.function.Supplier<T> call) {
		try {
			return call.get();
		} catch (NoClassDefFoundError | NoSuchMethodError e) {
			throw new IllegalStateException("Baritone is present but its API does not match what this bridge "
					+ "was built against (" + e + "). Use the 'api' flavour jar, not 'standalone'.");
		}
	}

	private static JsonObject gotoGoal(JsonObject params) {
		requirePresent();
		String type = Json.str(params, "goal", "block").toLowerCase(Locale.ROOT);

		JsonObject started = ClientTask.get(() -> viaApi(() -> {
			var goal = switch (type) {
				case "block" -> BaritoneNative.goalBlock(
						Json.reqInt(params, "x"), Json.reqInt(params, "y"), Json.reqInt(params, "z"));
				case "near" -> BaritoneNative.goalNear(
						Json.reqInt(params, "x"), Json.reqInt(params, "y"), Json.reqInt(params, "z"),
						Json.i(params, "range", 3));
				// No Y given: Baritone pathfinds far more reliably when it may
				// arrive at any height.
				case "xz" -> BaritoneNative.goalXZ(Json.reqInt(params, "x"), Json.reqInt(params, "z"));
				case "y" -> BaritoneNative.goalY(Json.reqInt(params, "y"));
				default -> throw new IllegalArgumentException(
						"unknown goal type '" + type + "'; expected block, near, xz or y");
			};
			return BaritoneNative.setGoal(goal);
		}));

		JsonObject out = Json.ok();
		out.add("started", started);
		out.addProperty("goalType", type);

		if (!Json.bool(params, "wait", true)) {
			out.addProperty("note", "pathing runs in the background; call baritone_wait or baritone_status");
			return out;
		}

		JsonObject completion = awaitCompletion(Json.i(params, "timeoutMs", 300_000));
		out.add("completion", completion);

		// The whole point of waiting is to find out whether the player arrived,
		// so a path that failed has to fail the call. Reporting ok:true with the
		// failure buried in a nested object is exactly how a caller ends up
		// believing it is somewhere it never reached.
		if (!Json.bool(completion, "ok", false)) {
			out.addProperty("ok", false);
			out.addProperty("error", Json.str(completion, "error", "Baritone did not reach the goal"));
		}
		return out;
	}

	private static JsonObject command(JsonObject params) {
		requirePresent();
		String cmd = Json.reqStr(params, "command").trim();
		if (cmd.startsWith(PREFIX)) cmd = cmd.substring(PREFIX.length());

		String finalCmd = cmd;
		long cursor = ChatLog.cursor();
		ClientTask.get(() -> {
			Mc.player().connection.sendChat(PREFIX + finalCmd);
			return Boolean.TRUE;
		});
		JsonObject out = ChatLog.waitFor(cursor, 30, Json.i(params, "waitMs", 800));
		out.addProperty("sent", PREFIX + finalCmd);
		return out;
	}

	private static JsonObject stop(JsonObject params) {
		requirePresent();
		ClientTask.get(() -> viaApi(() -> {
			BaritoneNative.cancel();
			return Boolean.TRUE;
		}));

		// Cancelling is a request, not an outcome: Baritone unwinds over the next
		// few ticks. Returning while the player is still walking makes "stop"
		// mean "asked to stop", and whatever the caller does next races with it.
		long deadline = System.currentTimeMillis() + Json.i(params, "timeoutMs", 5_000);
		while (System.currentTimeMillis() < deadline) {
			Boolean busy = ClientTask.get(() -> {
				try {
					return BaritoneNative.isBusy();
				} catch (Throwable t) {
					return null;
				}
			});
			if (busy == null || !busy) break;
			sleep(100);
		}
		return status(params);
	}

	private static JsonObject status(JsonObject params) {
		JsonObject o = Json.ok();
		o.addProperty("installed", isPresent());
		if (!isPresent()) return o;

		return ClientTask.get(() -> {
			JsonObject s = Json.ok();
			s.addProperty("installed", true);
			try {
				s.addProperty("busy", BaritoneNative.isBusy());
				s.addProperty("atGoal", BaritoneNative.isAtGoal());
				String goal = BaritoneNative.goalDescription();
				if (goal != null) s.addProperty("goal", goal);
				double eta = BaritoneNative.estimatedTicks();
				if (eta >= 0) s.addProperty("estimatedTicks", eta);
			} catch (NoClassDefFoundError | NoSuchMethodError e) {
				s.addProperty("apiError", String.valueOf(e));
			} catch (IllegalStateException e) {
				s.addProperty("note", e.getMessage());
			}
			if (Mc.inWorld()) s.add("position", Mc.posJson(Mc.player().blockPosition()));
			return s;
		});
	}

	private static JsonObject waitUntilDone(JsonObject params) {
		requirePresent();
		return awaitCompletion(Json.i(params, "timeoutMs", 300_000));
	}

	/**
	 * Waits for pathing to settle and reports whether the goal was actually
	 * reached, so a failed path is not mistaken for an arrival.
	 */
	private static JsonObject awaitCompletion(long timeoutMs) {
		long deadline = System.currentTimeMillis() + timeoutMs;
		// Baritone needs a moment to start calculating; without this grace period
		// the very first poll reports "idle" and we would return immediately.
		sleep(600);

		while (System.currentTimeMillis() < deadline) {
			Boolean busy = ClientTask.get(() -> {
				try {
					return BaritoneNative.isBusy();
				} catch (Throwable t) {
					return null;
				}
			});
			if (busy == null) return Json.error("could not read Baritone state while waiting");
			if (!busy) {
				boolean arrived = settledAtGoal();
				JsonObject o = arrived
						? Json.ok()
						: Json.error("Baritone stopped without reaching the goal (path failed or was cancelled)");
				o.addProperty("busy", false);
				o.addProperty("atGoal", arrived);
				o.add("position", ClientTask.get(() -> Mc.posJson(Mc.player().blockPosition())));
				return o;
			}
			sleep(250);
		}

		JsonObject o = Json.error("still pathing after " + timeoutMs + "ms");
		if (Mc.inWorld()) o.add("position", ClientTask.get(() -> Mc.posJson(Mc.player().blockPosition())));
		return o;
	}

	/**
	 * Whether the player ended up in the goal, allowing a moment for it to settle.
	 *
	 * <p>Baritone stops driving inputs the tick it considers itself arrived, but
	 * the player still carries momentum and may need to finish a fall or slide
	 * back into the goal block. Sampling only the first idle tick therefore
	 * reports a false failure for a walk that plainly succeeded, so we re-check
	 * briefly before concluding the path failed. Each check runs on the client
	 * thread; only the waiting happens here.
	 */
	private static boolean settledAtGoal() {
		for (int attempt = 0; attempt < 8; attempt++) {
			Boolean at = ClientTask.get(() -> {
				try {
					return BaritoneNative.isAtGoal();
				} catch (Throwable t) {
					return Boolean.FALSE;
				}
			});
			if (Boolean.TRUE.equals(at)) return true;
			sleep(200);
		}
		return false;
	}

	private static void sleep(long ms) {
		try {
			Thread.sleep(ms);
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}
}
