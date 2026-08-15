package dev.mcmcp.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/** Thin helpers over the Gson that Minecraft already ships. */
public final class Json {
	public static final Gson GSON = new Gson();

	private Json() {
	}

	public static JsonObject obj() {
		return new JsonObject();
	}

	public static JsonObject ok() {
		JsonObject o = new JsonObject();
		o.addProperty("ok", true);
		return o;
	}

	public static JsonObject error(String message) {
		JsonObject o = new JsonObject();
		o.addProperty("ok", false);
		o.addProperty("error", message);
		return o;
	}

	public static JsonObject vec(double x, double y, double z) {
		JsonObject o = new JsonObject();
		o.addProperty("x", x);
		o.addProperty("y", y);
		o.addProperty("z", z);
		return o;
	}

	public static JsonArray arr() {
		return new JsonArray();
	}

	// --- typed accessors with defaults -------------------------------------

	public static String str(JsonObject o, String key, String def) {
		JsonElement e = o == null ? null : o.get(key);
		return e == null || e.isJsonNull() ? def : e.getAsString();
	}

	public static String reqStr(JsonObject o, String key) {
		String v = str(o, key, null);
		if (v == null) throw new IllegalArgumentException("missing required parameter: " + key);
		return v;
	}

	public static int i(JsonObject o, String key, int def) {
		JsonElement e = o == null ? null : o.get(key);
		return e == null || e.isJsonNull() ? def : e.getAsInt();
	}

	public static int reqInt(JsonObject o, String key) {
		JsonElement e = o == null ? null : o.get(key);
		if (e == null || e.isJsonNull()) throw new IllegalArgumentException("missing required parameter: " + key);
		return e.getAsInt();
	}

	public static double d(JsonObject o, String key, double def) {
		JsonElement e = o == null ? null : o.get(key);
		return e == null || e.isJsonNull() ? def : e.getAsDouble();
	}

	public static double reqDouble(JsonObject o, String key) {
		JsonElement e = o == null ? null : o.get(key);
		if (e == null || e.isJsonNull()) throw new IllegalArgumentException("missing required parameter: " + key);
		return e.getAsDouble();
	}

	public static boolean bool(JsonObject o, String key, boolean def) {
		JsonElement e = o == null ? null : o.get(key);
		return e == null || e.isJsonNull() ? def : e.getAsBoolean();
	}

	public static boolean has(JsonObject o, String key) {
		return o != null && o.has(key) && !o.get(key).isJsonNull();
	}
}
