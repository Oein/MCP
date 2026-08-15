package dev.mcmcp.bridge;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client entrypoint. Boots the loopback HTTP control server that the mc-mcp
 * MCP server drives.
 */
public class McMcpBridge implements ClientModInitializer {
	public static final String MOD_ID = "mcmcp-bridge";
	public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

	private static BridgeConfig config;
	private static HttpBridgeServer server;

	public static BridgeConfig config() {
		return config;
	}

	@Override
	public void onInitializeClient() {
		config = BridgeConfig.load(FabricLoader.getInstance().getConfigDir().resolve("mcmcp-bridge.json"));
		UserInputLock.set(config.ignoreUserInput);
		ChatLog.install();

		try {
			server = new HttpBridgeServer(config);
			server.start();
			LOG.info("[mc-mcp] bridge listening on 127.0.0.1:{}", server.port());
		} catch (Exception e) {
			LOG.error("[mc-mcp] failed to start bridge server", e);
		}

		// The JDK's HttpServer runs its accept loop on a non-daemon
		// "HTTP-Dispatcher" thread, which keeps the JVM alive after Minecraft's
		// main() returns. Left alone, ClientShutdownWatchdog then decides the
		// client has hung and writes a bogus crash report on every quit, so the
		// server has to come down while the client is still shutting down --
		// a JVM shutdown hook runs far too late to prevent that.
		ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
			if (server != null) server.stop();
		});

		// Belt and braces for exit paths that bypass the client lifecycle.
		Runtime.getRuntime().addShutdownHook(new Thread(() -> {
			if (server != null) server.stop();
		}, "mcmcp-shutdown"));
	}
}
