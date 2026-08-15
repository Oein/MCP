package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.tree.CommandNode;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.ClientSuggestionProvider;

import java.util.Map;
import java.util.TreeSet;
import java.util.function.Function;

/**
 * Live command syntax, read from the command tree the server actually sent.
 *
 * <p>This is the antidote to writing 1.21-era syntax against a 26.2 server: the
 * answer here is not documentation, it is the running server's own grammar, so
 * it automatically covers version changes, datapack functions, WorldEdit and any
 * other mod's commands.
 */
final class CommandSyntaxActions {
	private CommandSyntaxActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("get_command_syntax", CommandSyntaxActions::getSyntax);
	}

	private static JsonObject getSyntax(JsonObject params) {
		String wanted = Json.str(params, "command", null);
		int limit = Json.i(params, "limit", 400);

		return ClientTask.get(() -> {
			ClientPacketListener connection = Mc.mc().getConnection();
			if (connection == null) {
				throw new IllegalStateException(
						"not connected: the command tree is sent by the server, so join a world or server first");
			}
			CommandDispatcher<ClientSuggestionProvider> dispatcher = connection.getCommands();
			ClientSuggestionProvider source = connection.getSuggestionsProvider();
			CommandNode<ClientSuggestionProvider> root = dispatcher.getRoot();

			JsonObject o = Json.ok();

			if (wanted == null) {
				// Just the names -- the full tree is enormous.
				JsonArray names = Json.arr();
				new TreeSet<>(root.getChildren().stream().map(CommandNode::getName).toList())
						.forEach(names::add);
				o.add("commands", names);
				o.addProperty("count", names.size());
				o.addProperty("note", "pass 'command' to get the full usage lines for one command");
				return o;
			}

			String name = wanted.startsWith("/") ? wanted.substring(1) : wanted;
			CommandNode<ClientSuggestionProvider> node = root.getChild(name);
			if (node == null) {
				JsonArray suggestions = Json.arr();
				root.getChildren().stream()
						.map(CommandNode::getName)
						.filter(n -> n.startsWith(name.substring(0, Math.min(2, name.length()))))
						.sorted()
						.forEach(suggestions::add);
				JsonObject err = Json.error("this server has no command named '" + name + "'");
				err.add("didYouMean", suggestions);
				return err;
			}

			JsonArray usages = Json.arr();
			String[] all = dispatcher.getAllUsage(node, source, true);
			for (int i = 0; i < all.length && i < limit; i++) {
				usages.add("/" + name + " " + all[i]);
			}

			o.addProperty("command", name);
			o.add("usage", usages);
			o.addProperty("truncated", all.length > limit);
			o.addProperty("total", all.length);
			return o;
		}, 20_000);
	}
}
