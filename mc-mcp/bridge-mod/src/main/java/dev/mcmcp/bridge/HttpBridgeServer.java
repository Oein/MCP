package dev.mcmcp.bridge;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import dev.mcmcp.bridge.actions.Actions;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * Loopback-only JSON-RPC-ish endpoint.
 *
 * <p>Deliberately bound to the loopback address and gated behind a per-run
 * bearer token: this API can move the player and run commands, so it must not
 * be reachable from the network.
 */
public class HttpBridgeServer {
	private final BridgeConfig config;
	private HttpServer server;

	public HttpBridgeServer(BridgeConfig config) {
		this.config = config;
	}

	public void start() throws IOException {
		InetSocketAddress addr = new InetSocketAddress(InetAddress.getLoopbackAddress(), config.port);
		server = HttpServer.create(addr, 0);
		server.setExecutor(Executors.newFixedThreadPool(4, r -> {
			Thread t = new Thread(r, "mcmcp-bridge-http");
			t.setDaemon(true);
			return t;
		}));
		server.createContext("/rpc", this::handleRpc);
		server.createContext("/health", this::handleHealth);
		server.start();
		config.writeHandshake(port());
	}

	public int port() {
		return server == null ? config.port : server.getAddress().getPort();
	}

	/** Idempotent: called from both the client lifecycle and the shutdown hook. */
	public synchronized void stop() {
		if (server == null) return;
		server.stop(0);
		server = null;
	}

	private void handleHealth(HttpExchange ex) throws IOException {
		JsonObject o = Json.ok();
		o.addProperty("mod", McMcpBridge.MOD_ID);
		o.addProperty("minecraft", "26.2");
		respond(ex, 200, o);
	}

	private void handleRpc(HttpExchange ex) throws IOException {
		try {
			if (!"POST".equals(ex.getRequestMethod())) {
				respond(ex, 405, Json.error("POST required"));
				return;
			}
			if (!authorized(ex)) {
				respond(ex, 401, Json.error("bad or missing bearer token"));
				return;
			}

			String body;
			try (InputStream in = ex.getRequestBody()) {
				body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
			}

			JsonObject req = body.isBlank() ? Json.obj() : Json.GSON.fromJson(body, JsonObject.class);
			String action = Json.str(req, "action", null);
			if (action == null) {
				respond(ex, 400, Json.error("missing 'action'"));
				return;
			}
			JsonObject params = req.has("params") && req.get("params").isJsonObject()
					? req.getAsJsonObject("params")
					: Json.obj();

			JsonObject result;
			try {
				result = Actions.dispatch(action, params);
			} catch (IllegalArgumentException e) {
				respond(ex, 400, Json.error(e.getMessage()));
				return;
			} catch (Throwable t) {
				McMcpBridge.LOG.warn("[mc-mcp] action '{}' failed", action, t);
				String msg = t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
				respond(ex, 500, Json.error(msg));
				return;
			}
			respond(ex, 200, result);
		} catch (Throwable t) {
			McMcpBridge.LOG.error("[mc-mcp] request handling failed", t);
			try {
				respond(ex, 500, Json.error(String.valueOf(t)));
			} catch (IOException ignored) {
				// client already gone
			}
		}
	}

	private boolean authorized(HttpExchange ex) {
		String header = ex.getRequestHeaders().getFirst("Authorization");
		if (header == null || !header.startsWith("Bearer ")) return false;
		return constantTimeEquals(header.substring(7), config.token);
	}

	private static boolean constantTimeEquals(String a, String b) {
		byte[] x = a.getBytes(StandardCharsets.UTF_8);
		byte[] y = b.getBytes(StandardCharsets.UTF_8);
		return java.security.MessageDigest.isEqual(x, y);
	}

	private static void respond(HttpExchange ex, int status, JsonObject body) throws IOException {
		byte[] bytes = Json.GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		ex.sendResponseHeaders(status, bytes.length);
		try (OutputStream out = ex.getResponseBody()) {
			out.write(bytes);
		}
	}
}
