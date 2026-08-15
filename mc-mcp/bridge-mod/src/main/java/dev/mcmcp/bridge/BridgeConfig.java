package dev.mcmcp.bridge;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * Bridge configuration, persisted next to the other Fabric mod configs.
 *
 * <p>The handshake file at {@code ~/.mcmcp/bridge.json} is how the MCP server
 * discovers the port and auth token without the user copying anything by hand.
 */
public class BridgeConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	/** Loopback port for the control server. 0 picks a free port. */
	public int port = 25599;

	/** Shared secret; every request must present it as {@code Authorization: Bearer <token>}. */
	public String token = "";

	/**
	 * Hosts the agent is allowed to connect to. Loopback and RFC1918 ranges are
	 * always permitted; anything else must be listed here explicitly by the user.
	 * This is the guard that keeps the agent on test servers.
	 */
	public List<String> extraAllowedHosts = new ArrayList<>();

	/**
	 * When true (the default) the bridge refuses to join a server unless the
	 * running account is an offline/local one.
	 */
	public boolean requireOfflineAccount = true;

	/**
	 * When true, real keyboard and mouse input to the game window is ignored, so
	 * nothing a person does at the keyboard can perturb an agent's run. On by
	 * default because the client exists to be driven by the agent; see
	 * {@link UserInputLock}. Switchable at runtime with the {@code
	 * set_input_lock} action.
	 */
	public boolean ignoreUserInput = true;

	public static BridgeConfig load(Path path) {
		BridgeConfig cfg = new BridgeConfig();
		try {
			if (Files.exists(path)) {
				JsonObject o = GSON.fromJson(Files.readString(path), JsonObject.class);
				if (o != null) {
					if (o.has("port")) cfg.port = o.get("port").getAsInt();
					if (o.has("token")) cfg.token = o.get("token").getAsString();
					if (o.has("requireOfflineAccount")) cfg.requireOfflineAccount = o.get("requireOfflineAccount").getAsBoolean();
					if (o.has("ignoreUserInput")) cfg.ignoreUserInput = o.get("ignoreUserInput").getAsBoolean();
					if (o.has("extraAllowedHosts")) {
						cfg.extraAllowedHosts.clear();
						o.getAsJsonArray("extraAllowedHosts").forEach(e -> cfg.extraAllowedHosts.add(e.getAsString()));
					}
				}
			}
		} catch (Exception e) {
			McMcpBridge.LOG.warn("[mc-mcp] could not read config, using defaults", e);
		}

		if (cfg.token == null || cfg.token.isBlank()) {
			byte[] buf = new byte[24];
			new SecureRandom().nextBytes(buf);
			cfg.token = HexFormat.of().formatHex(buf);
		}

		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(cfg));
		} catch (Exception e) {
			McMcpBridge.LOG.warn("[mc-mcp] could not persist config", e);
		}
		return cfg;
	}

	/** Publishes the live port/token so the MCP server can find us. */
	public void writeHandshake(int livePort) {
		try {
			Path dir = Path.of(System.getProperty("user.home"), ".mcmcp");
			Files.createDirectories(dir);
			JsonObject o = new JsonObject();
			o.addProperty("port", livePort);
			o.addProperty("token", token);
			o.addProperty("pid", ProcessHandle.current().pid());
			Path f = dir.resolve("bridge.json");
			Files.writeString(f, GSON.toJson(o));
			try {
				Files.setPosixFilePermissions(f, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
			} catch (UnsupportedOperationException ignored) {
				// non-POSIX filesystem; nothing to tighten
			}
		} catch (Exception e) {
			McMcpBridge.LOG.warn("[mc-mcp] could not write handshake file", e);
		}
	}
}
