package dev.mcmcp.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.minecraft.network.chat.Component;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Rolling buffer of everything the client was told.
 *
 * <p>This is how the agent reads command output: vanilla commands answer through
 * system messages, and WorldEdit / Baritone both report progress the same way.
 * Entries are sequence-numbered so a caller can ask for "everything since N"
 * instead of guessing at timing.
 */
public final class ChatLog {
	private static final int CAPACITY = 500;
	private static final Deque<Entry> ENTRIES = new ArrayDeque<>();
	private static long nextSeq = 1;

	private ChatLog() {
	}

	private record Entry(long seq, long timestamp, String kind, String sender, String text) {
	}

	public static void install() {
		ClientReceiveMessageEvents.GAME.register((message, overlay) ->
				add(overlay ? "overlay" : "system", null, message));
		ClientReceiveMessageEvents.CHAT.register((message, signed, sender, params, receptionTime) ->
				add("chat", sender == null ? null : sender.name(), message));
	}

	/**
	 * Records a message a client-side mod wrote straight into the HUD.
	 *
	 * <p>Kept separate from the packet-driven kinds so a caller can tell where a
	 * line came from: "client" means no server was involved.
	 */
	public static void addClientMessage(Component message) {
		add("client", null, message);
	}

	private static void add(String kind, String sender, Component message) {
		String text;
		try {
			text = message.getString();
		} catch (Exception e) {
			text = String.valueOf(message);
		}
		synchronized (ENTRIES) {
			ENTRIES.addLast(new Entry(nextSeq++, System.currentTimeMillis(), kind, sender, text));
			while (ENTRIES.size() > CAPACITY) ENTRIES.removeFirst();
		}
	}

	/** Sequence number the next message will receive. */
	public static long cursor() {
		synchronized (ENTRIES) {
			return nextSeq;
		}
	}

	/** Messages with {@code seq >= since}, newest last, capped at {@code limit}. */
	public static JsonObject since(long since, int limit) {
		JsonArray items = new JsonArray();
		synchronized (ENTRIES) {
			for (Entry e : ENTRIES) {
				if (e.seq < since) continue;
				JsonObject o = new JsonObject();
				o.addProperty("seq", e.seq);
				o.addProperty("timestamp", e.timestamp);
				o.addProperty("kind", e.kind);
				if (e.sender != null) o.addProperty("sender", e.sender);
				o.addProperty("text", e.text);
				items.add(o);
			}
			while (items.size() > limit) items.remove(0);
			JsonObject out = Json.ok();
			out.add("messages", items);
			out.addProperty("cursor", nextSeq);
			return out;
		}
	}

	/**
	 * Blocks (off the client thread) until at least one message arrives at or
	 * after {@code since}, or the deadline passes. Used to turn "send a command"
	 * into "send a command and tell me what it said".
	 */
	public static JsonObject waitFor(long since, int limit, long timeoutMs) {
		long deadline = System.currentTimeMillis() + timeoutMs;
		// Returning on the very first message truncates anything multi-line: a
		// command that echoes and then answers would report only the echo. So once
		// something arrives, keep going until the output goes quiet.
		final long settleMs = 250;
		long quietUntil = -1;
		long lastSeen = -1;

		while (System.currentTimeMillis() < deadline) {
			long cursorNow;
			synchronized (ENTRIES) {
				cursorNow = nextSeq;
			}
			long now = System.currentTimeMillis();

			if (cursorNow > since) {
				if (cursorNow != lastSeen) {
					// Something new landed; restart the quiet window.
					lastSeen = cursorNow;
					quietUntil = now + settleMs;
				} else if (now >= quietUntil) {
					return since(since, limit);
				}
			}
			try {
				Thread.sleep(25);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				break;
			}
		}
		return since(since, limit);
	}
}
