package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.mcmcp.bridge.BridgeConfig;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import dev.mcmcp.bridge.McMcpBridge;
import net.minecraft.client.Minecraft;
import net.minecraft.client.User;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.world.level.storage.LevelStorageSource;
import net.minecraft.world.level.storage.LevelSummary;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;

/**
 * Joining and leaving servers.
 *
 * <p>Two independent gates keep the agent on test servers:
 *
 * <ol>
 *   <li>the target must resolve to a loopback or private address (or be listed
 *       explicitly by the user in the mod config), and</li>
 *   <li>the running account must be an offline account, which by construction
 *       cannot authenticate against an online-mode server.</li>
 * </ol>
 *
 * <p>Both are checked before any connection attempt, and the refusal explains
 * which gate tripped.
 */
final class SessionActions {
	private SessionActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("connect_server", SessionActions::connect);
		h.put("disconnect", SessionActions::disconnect);
		h.put("get_session", SessionActions::getSession);
		h.put("list_worlds", SessionActions::listWorlds);
		h.put("open_world", SessionActions::openWorld);
	}

	// --- singleplayer ------------------------------------------------------

	/**
	 * Lists the saved singleplayer worlds, with the {@code id} {@link #openWorld}
	 * expects. The id is the save *directory* name, which is not always the
	 * display name -- two worlds called "New World" live in "New World" and
	 * "New World (1)" -- so both are reported.
	 */
	private static JsonObject listWorlds(JsonObject params) {
		LevelStorageSource source = ClientTask.get(() -> Mc.mc().getLevelSource());
		List<LevelSummary> summaries;
		try {
			summaries = source.loadLevelSummaries(source.findLevelCandidates())
					.get(30, TimeUnit.SECONDS);
		} catch (Exception e) {
			throw new IllegalStateException("could not read the saves folder: " + e);
		}

		JsonArray worlds = new JsonArray();
		for (LevelSummary s : summaries) {
			JsonObject w = new JsonObject();
			w.addProperty("id", s.getLevelId());
			w.addProperty("name", s.getLevelName());
			w.addProperty("gameMode", s.getGameMode().getName());
			w.addProperty("hardcore", s.isHardcore());
			w.addProperty("commands", s.hasCommands());
			w.addProperty("lastPlayed", s.getLastPlayed());
			w.addProperty("version", s.getWorldVersionName().getString());
			// Anything the vanilla screen would refuse to launch straight away.
			w.addProperty("playable", s.primaryActionActive() && !s.isDisabled() && !s.isLocked());
			if (s.isLocked()) w.addProperty("blockedBy", "the save is locked by another running instance");
			else if (!s.isCompatible()) w.addProperty("blockedBy", "the save was made by an incompatible version");
			worlds.add(w);
		}

		JsonObject o = Json.ok();
		o.add("worlds", worlds);
		return o;
	}

	/**
	 * Waits for a save's session.lock to be released.
	 *
	 * @return true if the save is free to open, false if it is still held
	 */
	private static boolean awaitUnlocked(java.nio.file.Path levelDir, long timeoutMs) {
		long deadline = System.currentTimeMillis() + timeoutMs;
		while (System.currentTimeMillis() < deadline) {
			try {
				if (!net.minecraft.util.DirectoryLock.isLocked(levelDir)) return true;
			} catch (java.nio.channels.OverlappingFileLockException e) {
				// This *JVM* holds the lock: our own integrated server has not
				// finished shutting down yet. Emphatically not a reason to
				// proceed -- vanilla's own lock attempt is about to throw the very
				// same exception. Keep waiting for it to clear.
			} catch (Exception e) {
				// An unreadable lock file is not something to block on; let the
				// open attempt produce the real error.
				return true;
			}
			try {
				Thread.sleep(200);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				return false;
			}
		}
		return false;
	}

	/**
	 * Loads a singleplayer world directly, without walking the title screen.
	 *
	 * <p>This is the singleplayer counterpart to {@link #connect}: an agent
	 * should not have to click "Singleplayer", find a row in a scrolling list and
	 * double-click it just to get into a world it can already name. It runs
	 * vanilla's own {@code WorldOpenFlows.openWorld}, so the world loads exactly
	 * as it would from the menu -- including the version and datapack checks that
	 * make a broken save fail safely rather than corrupt.
	 */
	private static JsonObject openWorld(JsonObject params) {
		String id = Json.reqStr(params, "id").trim();
		long timeoutMs = Json.i(params, "timeoutMs", 120_000);

		LevelStorageSource source = ClientTask.get(() -> Mc.mc().getLevelSource());
		if (!source.levelExists(id)) {
			throw new IllegalArgumentException("no saved world with id '" + id
					+ "'; call list_worlds to see what is available (the id is the save folder name)");
		}

		// A world cannot be loaded on top of a live connection, and silently
		// dropping the current one would be a surprise.
		if (ClientTask.get(() -> Mc.mc().getConnection() != null ? Boolean.TRUE : Boolean.FALSE)) {
			if (!Json.bool(params, "leaveCurrent", false)) {
				return Json.error("already in a world or connected to a server; "
						+ "pass leaveCurrent:true to leave it first");
			}
			disconnect(Json.obj());
		}

		// Leaving a world returns before the integrated server has finished
		// shutting down, and the save keeps its session.lock until it has. Opening
		// a world in that window -- including reopening the one just left -- dies
		// with OverlappingFileLockException and strands the client on a loading
		// screen, so wait for the lock to actually clear.
		if (!awaitUnlocked(source.getLevelPath(id), Math.min(timeoutMs, 30_000))) {
			return Json.error("world '" + id + "' is still locked. Either another Minecraft has it open, "
					+ "or this client is still shutting the world down. Check get_state, or restart the client.");
		}

		// openWorld hands control to the loading screen and returns immediately;
		// the failure callback is the only signal that it gave up.
		AtomicBoolean failed = new AtomicBoolean(false);
		ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			try {
				mc.createWorldOpenFlows().openWorld(id, () -> {
					failed.set(true);
					// Vanilla's callback is what puts a screen back; without it the
					// client sits on the loading screen with no way out.
					mc.gui.setScreen(new TitleScreen());
				});
			} catch (Throwable t) {
				failed.set(true);
				mc.gui.setScreen(new TitleScreen());
				throw new IllegalStateException("could not open world '" + id + "': " + t, t);
			}
			return Boolean.TRUE;
		});

		boolean autoConfirm = Json.bool(params, "confirm", false);
		long deadline = System.currentTimeMillis() + timeoutMs;
		while (System.currentTimeMillis() < deadline) {
			if (failed.get()) {
				return Json.error("Minecraft refused to open world '" + id
						+ "' (it is locked, incompatible, or needs conversion); call list_worlds for details");
			}
			if (ClientTask.get(() -> Mc.inWorld() ? Boolean.TRUE : Boolean.FALSE)) {
				JsonObject o = Json.ok();
				o.addProperty("world", id);
				o.add("position", ClientTask.get(() -> Mc.posJson(Mc.player().blockPosition())));
				return o;
			}

			// Loading can stop and ask a question -- an experimental-settings
			// warning, a "this world was last played in another version" backup
			// prompt. Waiting for inWorld through one of those just burns the
			// timeout and leaves the client sitting on a screen nobody answered.
			JsonObject prompt = pendingConfirmation();
			if (prompt != null) {
				if (!autoConfirm) {
					JsonObject o = Json.error("opening '" + id + "' is waiting on a confirmation: \""
							+ Json.str(prompt, "title", "?") + "\". Answer it with click_widget, or call "
							+ "open_world again with confirm:true to take the proceed-without-backup option.");
					o.add("needsConfirmation", prompt);
					return o;
				}
				if (!confirmProceed(prompt)) {
					JsonObject o = Json.error("could not answer the confirmation automatically; "
							+ "drive it with get_screen and click_widget");
					o.add("needsConfirmation", prompt);
					return o;
				}
			}

			try {
				Thread.sleep(250);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				break;
			}
		}
		return Json.error("world '" + id + "' did not finish loading within " + timeoutMs + "ms");
	}

	/** The confirmation screen the loading flow is waiting on, or null. */
	private static JsonObject pendingConfirmation() {
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			var screen = mc.gui == null ? null : mc.gui.screen();
			if (!(screen instanceof net.minecraft.client.gui.screens.ConfirmScreen)) return null;

			JsonObject o = new JsonObject();
			o.addProperty("screen", screen.getClass().getSimpleName());
			o.addProperty("title", screen.getTitle().getString());
			JsonArray buttons = Json.arr();
			collectButtonLabels(screen, buttons);
			o.add("buttons", buttons);
			return o;
		});
	}

	private static void collectButtonLabels(net.minecraft.client.gui.screens.Screen screen, JsonArray out) {
		for (var child : screen.children()) {
			if (child instanceof net.minecraft.client.gui.components.AbstractButton b) {
				out.add(b.getMessage().getString());
			}
		}
	}

	/**
	 * Clicks the "carry on" option of a confirmation.
	 *
	 * <p>Deliberately never picks a backup: making a copy of someone's world is a
	 * decision with disk-space consequences, and an agent should not take it on
	 * their behalf without being asked.
	 */
	private static boolean confirmProceed(JsonObject prompt) {
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			var screen = mc.gui == null ? null : mc.gui.screen();
			if (!(screen instanceof net.minecraft.client.gui.screens.ConfirmScreen)) return Boolean.FALSE;

			for (var child : screen.children()) {
				if (!(child instanceof net.minecraft.client.gui.components.AbstractButton b)) continue;
				String label = b.getMessage().getString().toLowerCase(Locale.ROOT);
				if (label.contains("backup") || label.contains("cancel") || label.contains("back")) continue;
				double cx = b.getX() + b.getWidth() / 2.0;
				double cy = b.getY() + b.getHeight() / 2.0;
				var event = new net.minecraft.client.input.MouseButtonEvent(
						cx, cy, new net.minecraft.client.input.MouseButtonInfo(0, 0));
				screen.mouseClicked(event, false);
				screen.mouseReleased(event);
				return Boolean.TRUE;
			}
			return Boolean.FALSE;
		});
	}

	// --- offline account detection -----------------------------------------

	/**
	 * Offline launchers derive the profile id from the name with a v3 UUID over
	 * {@code "OfflinePlayer:<name>"} -- the same rule the vanilla server uses in
	 * offline mode. A matching id means the session has no Mojang authentication
	 * behind it.
	 */
	static boolean isOfflineAccount(User user) {
		if (user == null) return false;
		UUID expected = UUID.nameUUIDFromBytes(
				("OfflinePlayer:" + user.getName()).getBytes(StandardCharsets.UTF_8));
		if (expected.equals(user.getProfileId())) return true;

		// Some launchers leave a placeholder token instead; that is equally unusable online.
		String token = user.getAccessToken();
		return token == null || token.isBlank() || "0".equals(token) || "null".equalsIgnoreCase(token);
	}

	// --- host allowlist ----------------------------------------------------

	/** Loopback, link-local and RFC1918 addresses are considered test targets. */
	private static boolean isPrivateAddress(InetAddress addr) {
		return addr.isLoopbackAddress()
				|| addr.isSiteLocalAddress()
				|| addr.isLinkLocalAddress()
				|| addr.isAnyLocalAddress();
	}

	private record HostCheck(boolean allowed, String reason, JsonArray resolved) {
	}

	private static HostCheck checkHost(String host, BridgeConfig config) {
		String normalized = host.toLowerCase(Locale.ROOT);
		if (config.extraAllowedHosts.stream().anyMatch(a -> a.equalsIgnoreCase(normalized))) {
			return new HostCheck(true, "listed in extraAllowedHosts", new JsonArray());
		}

		InetAddress[] addresses;
		try {
			addresses = InetAddress.getAllByName(host);
		} catch (UnknownHostException e) {
			return new HostCheck(false, "host '" + host + "' could not be resolved", new JsonArray());
		}

		JsonArray resolved = new JsonArray();
		boolean allPrivate = addresses.length > 0;
		for (InetAddress addr : addresses) {
			resolved.add(addr.getHostAddress());
			if (!isPrivateAddress(addr)) allPrivate = false;
		}
		if (allPrivate) return new HostCheck(true, "resolves only to private/loopback addresses", resolved);
		return new HostCheck(false,
				"'" + host + "' resolves to a public address. This bridge only joins local test servers. "
						+ "Add it to extraAllowedHosts in mcmcp-bridge.json if it really is your own test server.",
				resolved);
	}

	// --- actions -----------------------------------------------------------

	private static JsonObject getSession(JsonObject params) {
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			User user = mc.getUser();
			BridgeConfig config = McMcpBridge.config();

			JsonObject account = new JsonObject();
			account.addProperty("name", user == null ? null : user.getName());
			account.addProperty("uuid", user == null ? null : String.valueOf(user.getProfileId()));
			account.addProperty("offline", isOfflineAccount(user));

			JsonObject o = Json.ok();
			o.add("account", account);
			o.addProperty("inWorld", Mc.inWorld());
			o.addProperty("connected", mc.getConnection() != null);

			JsonObject policy = new JsonObject();
			policy.addProperty("requireOfflineAccount", config.requireOfflineAccount);
			JsonArray extra = new JsonArray();
			config.extraAllowedHosts.forEach(extra::add);
			policy.add("extraAllowedHosts", extra);
			o.add("policy", policy);
			return o;
		});
	}

	private static JsonObject connect(JsonObject params) {
		String address = Json.reqStr(params, "address").trim();
		BridgeConfig config = McMcpBridge.config();

		if (!ServerAddress.isValidAddress(address)) {
			throw new IllegalArgumentException("'" + address + "' is not a valid server address");
		}
		ServerAddress parsed = ServerAddress.parseString(address);

		HostCheck check = checkHost(parsed.getHost(), config);
		if (!check.allowed()) {
			JsonObject o = Json.error("refused: " + check.reason());
			o.addProperty("host", parsed.getHost());
			o.add("resolved", check.resolved());
			return o;
		}

		User user = Mc.mc().getUser();
		if (config.requireOfflineAccount && !isOfflineAccount(user)) {
			return Json.error("refused: this client is signed in with an authenticated account, but the bridge is "
					+ "configured to connect only from an offline account. Launch the instance with an offline "
					+ "profile, or set requireOfflineAccount=false in mcmcp-bridge.json if you understand the risk.");
		}

		JsonObject o = ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			ServerData data = new ServerData(
					Json.str(params, "name", "mc-mcp test server"), address, ServerData.Type.OTHER);
			// The trailing TransferState must be null. A non-null one marks the
			// handshake as a server-to-server transfer, and a vanilla server
			// answers that with "This server does not accept transfers" unless
			// accepts-transfers is enabled -- so passing one here made every
			// ordinary join fail. Vanilla's own multiplayer screen passes null.
			ConnectScreen.startConnecting(
					new TitleScreen(),
					mc,
					parsed,
					data,
					false,
					null);

			JsonObject r = Json.ok();
			r.addProperty("connecting", address);
			r.addProperty("host", parsed.getHost());
			r.addProperty("port", parsed.getPort());
			r.addProperty("allowedBecause", check.reason());
			r.add("resolved", check.resolved());
			return r;
		});

		if (!Json.bool(params, "wait", true)) {
			o.addProperty("note", "connection is asynchronous; poll get_state until inWorld is true");
			return o;
		}
		return awaitJoin(o, address, Json.i(params, "timeoutMs", 60_000));
	}

	/**
	 * Blocks until the join succeeds or visibly fails, so callers get one answer
	 * instead of having to poll. A failed connection leaves the client sitting on
	 * a disconnect screen; that is the signal we watch for, since the connection
	 * itself reports nothing back to us.
	 */
	private static JsonObject awaitJoin(JsonObject o, String address, long timeoutMs) {
		long deadline = System.currentTimeMillis() + timeoutMs;
		while (System.currentTimeMillis() < deadline) {
			String failure = ClientTask.get(() -> {
				if (Mc.inWorld()) return "";
				var screen = Mc.mc().gui.screen();
				if (screen instanceof net.minecraft.client.gui.screens.DisconnectedScreen) {
					// The narration carries the headline *and* the server's actual
					// reason; the title alone is a generic "Connection failed".
					return screen.getNarrationMessage().getString();
				}
				return null;
			});
			if ("".equals(failure)) {
				o.addProperty("inWorld", true);
				o.add("position", ClientTask.get(() -> Mc.posJson(Mc.player().blockPosition())));
				return o;
			}
			if (failure != null) {
				JsonObject err = Json.error("could not join " + address + ": " + failure);
				err.addProperty("host", o.get("host").getAsString());
				return err;
			}
			try {
				Thread.sleep(250);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				break;
			}
		}
		JsonObject err = Json.error("still connecting to " + address + " after " + timeoutMs + "ms");
		err.addProperty("host", o.get("host").getAsString());
		return err;
	}

	private static JsonObject disconnect(JsonObject params) {
		// Saving a large singleplayer world can take a while, and the whole
		// sequence runs on the client thread.
		long timeoutMs = Json.i(params, "timeoutMs", 60_000);
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			if (mc.getConnection() == null) return Json.error("not connected");

			// This mirrors vanilla's own "leave world" sequence (see the button
			// DeathScreen uses to return to the menu). The final setScreen is not
			// optional: disconnectWithSavingScreen only puts up the progress
			// screen, and nothing in the game ever takes it back down, so
			// skipping it leaves the client wedged on a blank ProgressScreen with
			// no widgets and no way back.
			if (mc.level != null) {
				mc.level.disconnect(ClientLevel.DEFAULT_QUIT_MESSAGE);
			}
			mc.disconnectWithSavingScreen();
			mc.gui.setScreen(new TitleScreen());

			JsonObject o = Json.ok();
			o.addProperty("screen", mc.gui.screen() == null ? null : mc.gui.screen().getClass().getSimpleName());
			return o;
		}, timeoutMs);
	}
}
