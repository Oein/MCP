package dev.mcmcp.bridge.actions;

import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

import java.util.EnumMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Movement and aiming.
 *
 * <p>Everything here goes through the vanilla {@link KeyMapping} down-states
 * rather than teleporting or writing to the player's position. The client's own
 * input pipeline then produces the exact same movement packets a human would
 * generate, which is what makes the agent indistinguishable from a real player
 * (and keeps it honest on servers with movement checks).
 */
final class MoveActions {
	/** Logical inputs the agent can hold. */
	enum Key {FORWARD, BACKWARD, LEFT, RIGHT, JUMP, SNEAK, SPRINT, ATTACK, USE}

	/** Client-tick deadline per held key; -1 means "hold until told otherwise". */
	private static final Map<Key, Long> HELD_UNTIL = new EnumMap<>(Key.class);
	private static long tickCounter;

	/** Smooth-turn state so the camera sweeps like a hand on a mouse. */
	private static float targetYaw, targetPitch;
	private static int turnTicksLeft;

	private MoveActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		installTicker();
		h.put("set_input", MoveActions::setInput);
		h.put("stop_input", p -> releaseAll());
		h.put("look", MoveActions::look);
		h.put("look_at", MoveActions::lookAt);
	}

	private static void installTicker() {
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			tickCounter++;
			expireHeldKeys(client);
			stepTurn(client);
		});
	}

	private static void expireHeldKeys(Minecraft client) {
		if (HELD_UNTIL.isEmpty()) return;
		HELD_UNTIL.entrySet().removeIf(entry -> {
			long until = entry.getValue();
			if (until >= 0 && tickCounter >= until) {
				apply(client, entry.getKey(), false);
				return true;
			}
			return false;
		});
	}

	private static void stepTurn(Minecraft client) {
		if (turnTicksLeft <= 0 || client.player == null) return;
		LocalPlayer p = client.player;
		float yawDelta = Mth.wrapDegrees(targetYaw - p.getYRot());
		float pitchDelta = targetPitch - p.getXRot();
		p.setYRot(p.getYRot() + yawDelta / turnTicksLeft);
		p.setXRot(Mth.clamp(p.getXRot() + pitchDelta / turnTicksLeft, -90f, 90f));
		turnTicksLeft--;
		if (turnTicksLeft == 0) {
			p.setYRot(targetYaw);
			p.setXRot(Mth.clamp(targetPitch, -90f, 90f));
		}
	}

	private static KeyMapping mapping(Options o, Key key) {
		return switch (key) {
			case FORWARD -> o.keyUp;
			case BACKWARD -> o.keyDown;
			case LEFT -> o.keyLeft;
			case RIGHT -> o.keyRight;
			case JUMP -> o.keyJump;
			case SNEAK -> o.keyShift;
			case SPRINT -> o.keySprint;
			case ATTACK -> o.keyAttack;
			case USE -> o.keyUse;
		};
	}

	private static void apply(Minecraft client, Key key, boolean down) {
		mapping(client.options, key).setDown(down);
	}

	private static JsonObject setInput(JsonObject params) {
		// ms -> client ticks (20/s); 0 or absent means hold indefinitely.
		int durationMs = Json.i(params, "durationMs", 0);

		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			int ticks = durationMs > 0 ? Math.max(1, Math.round(durationMs / 50f)) : 0;
			JsonObject applied = new JsonObject();

			for (Key key : Key.values()) {
				String name = key.name().toLowerCase(java.util.Locale.ROOT);
				if (!Json.has(params, name)) continue;
				boolean down = Json.bool(params, name, false);
				apply(client, key, down);
				if (down) {
					HELD_UNTIL.put(key, ticks > 0 ? tickCounter + ticks : -1L);
				} else {
					HELD_UNTIL.remove(key);
				}
				applied.addProperty(name, down);
			}

			if (applied.isEmpty()) {
				throw new IllegalArgumentException(
						"no inputs given; pass any of: forward, backward, left, right, jump, sneak, sprint, attack, use");
			}

			JsonObject o = Json.ok();
			o.add("applied", applied);
			o.addProperty("durationMs", durationMs);
			return o;
		});
	}

	static JsonObject releaseAll() {
		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			for (Key key : Key.values()) apply(client, key, false);
			HELD_UNTIL.clear();
			turnTicksLeft = 0;
			return Json.ok();
		});
	}

	private static JsonObject look(JsonObject params) {
		// Either axis alone is a real request -- "look down", "turn around" -- so
		// whichever is omitted keeps its current value rather than being required.
		if (!Json.has(params, "yaw") && !Json.has(params, "pitch")) {
			throw new IllegalArgumentException("pass yaw, pitch, or both");
		}
		float yaw = (float) Json.d(params, "yaw", Double.NaN);
		float pitch = (float) Json.d(params, "pitch", Double.NaN);
		int ticks = Json.i(params, "ticks", 4);
		return ClientTask.get(() -> {
			LocalPlayer p = Mc.player();
			targetYaw = Float.isNaN(yaw) ? p.getYRot() : yaw;
			targetPitch = Float.isNaN(pitch) ? p.getXRot() : Mth.clamp(pitch, -90f, 90f);
			turnTicksLeft = Math.max(1, ticks);
			JsonObject o = Json.ok();
			o.addProperty("targetYaw", targetYaw);
			o.addProperty("targetPitch", targetPitch);
			o.addProperty("ticks", turnTicksLeft);
			return o;
		});
	}

	private static JsonObject lookAt(JsonObject params) {
		double tx = Json.reqDouble(params, "x");
		double ty = Json.reqDouble(params, "y");
		double tz = Json.reqDouble(params, "z");
		int ticks = Json.i(params, "ticks", 4);
		return ClientTask.get(() -> {
			LocalPlayer p = Mc.player();
			Vec3 eye = p.getEyePosition();
			double dx = tx - eye.x, dy = ty - eye.y, dz = tz - eye.z;
			double horizontal = Math.sqrt(dx * dx + dz * dz);
			targetYaw = (float) (Mth.atan2(dz, dx) * (180 / Math.PI)) - 90f;
			targetPitch = (float) (-(Mth.atan2(dy, horizontal) * (180 / Math.PI)));
			targetPitch = Mth.clamp(targetPitch, -90f, 90f);
			turnTicksLeft = Math.max(1, ticks);

			JsonObject o = Json.ok();
			o.addProperty("targetYaw", targetYaw);
			o.addProperty("targetPitch", targetPitch);
			o.addProperty("ticks", turnTicksLeft);
			return o;
		});
	}
}
