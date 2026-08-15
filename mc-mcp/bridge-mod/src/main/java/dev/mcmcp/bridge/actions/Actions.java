package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.mcmcp.bridge.Json;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/** Action name -> handler registry. */
public final class Actions {
	private static final Map<String, Function<JsonObject, JsonObject>> HANDLERS = new LinkedHashMap<>();

	static {
		StateActions.register(HANDLERS);
		MoveActions.register(HANDLERS);
		InteractActions.register(HANDLERS);
		InventoryActions.register(HANDLERS);
		CommandActions.register(HANDLERS);
		CommandSyntaxActions.register(HANDLERS);
		ScreenActions.register(HANDLERS);
		CaptureActions.register(HANDLERS);
		BaritoneActions.register(HANDLERS);
		SessionActions.register(HANDLERS);
		PackActions.register(HANDLERS);
	}

	private Actions() {
	}

	public static JsonObject dispatch(String action, JsonObject params) {
		Function<JsonObject, JsonObject> handler = HANDLERS.get(action);
		if (handler == null) {
			throw new IllegalArgumentException("unknown action '" + action + "'; call 'list_actions' to see what is available");
		}
		JsonObject result = handler.apply(params);
		return result == null ? Json.ok() : result;
	}

	public static JsonObject listActions() {
		JsonArray names = Json.arr();
		HANDLERS.keySet().forEach(names::add);
		JsonObject o = Json.ok();
		o.add("actions", names);
		return o;
	}
}
