package dev.mcmcp.bridge.actions;

import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ChatLog;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.multiplayer.ClientPacketListener;

import java.util.Map;
import java.util.function.Function;

/**
 * Chat and commands.
 *
 * <p>Commands go out through the same packet a typed command uses. Because
 * command feedback comes back asynchronously as system messages, each send
 * snapshots the chat cursor first and then waits briefly for the reply, so the
 * caller gets the command's actual output instead of having to poll.
 */
final class CommandActions {
	private CommandActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("send_command", CommandActions::sendCommand);
		h.put("send_chat", CommandActions::sendChat);
		h.put("read_chat", CommandActions::readChat);
		h.put("get_mods", CommandActions::getMods);
	}

	private static ClientPacketListener connection() {
		ClientPacketListener c = Mc.mc().getConnection();
		if (c == null) throw new IllegalStateException("not connected to a server or world");
		return c;
	}

	private static JsonObject sendCommand(JsonObject params) {
		String raw = Json.reqStr(params, "command").trim();
		if (raw.isEmpty()) throw new IllegalArgumentException("command is empty");

		// The chat box strips exactly one leading slash before dispatching, so
		// "/give ..." and "give ..." mean the same thing -- and WorldEdit's
		// "//set stone" correctly becomes the command named "/set".
		String command = raw.startsWith("/") ? raw.substring(1) : raw;
		int waitMs = Json.i(params, "waitMs", 700);
		int limit = Json.i(params, "limit", 50);

		long cursor = ChatLog.cursor();
		ClientTask.get(() -> {
			connection().sendCommand(command);
			return Boolean.TRUE;
		});

		JsonObject out = waitMs > 0 ? ChatLog.waitFor(cursor, limit, waitMs) : ChatLog.since(cursor, limit);
		out.addProperty("sent", command);
		return out;
	}

	private static JsonObject sendChat(JsonObject params) {
		String message = Json.reqStr(params, "message");
		int waitMs = Json.i(params, "waitMs", 400);
		int limit = Json.i(params, "limit", 50);

		long cursor = ChatLog.cursor();
		ClientTask.get(() -> {
			connection().sendChat(message);
			return Boolean.TRUE;
		});

		JsonObject out = waitMs > 0 ? ChatLog.waitFor(cursor, limit, waitMs) : ChatLog.since(cursor, limit);
		out.addProperty("sent", message);
		return out;
	}

	private static JsonObject readChat(JsonObject params) {
		long since = (long) Json.d(params, "since", 0);
		int limit = Json.i(params, "limit", 100);
		int waitMs = Json.i(params, "waitMs", 0);
		return waitMs > 0 ? ChatLog.waitFor(since, limit, waitMs) : ChatLog.since(since, limit);
	}

	/** Which helper mods are actually present, so the agent stops guessing. */
	private static JsonObject getMods(JsonObject params) {
		var loader = FabricLoader.getInstance();
		JsonObject mods = new JsonObject();
		loader.getAllMods().forEach(m ->
				mods.addProperty(m.getMetadata().getId(), m.getMetadata().getVersion().getFriendlyString()));

		JsonObject o = Json.ok();
		o.add("mods", mods);
		o.addProperty("hasBaritone", BaritoneActions.isPresent());
		o.addProperty("hasWorldEdit", loader.isModLoaded("worldedit"));
		return o;
	}
}
