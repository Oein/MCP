package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.Map;
import java.util.function.Function;

/** Read-only observation of the player and the world around them. */
final class StateActions {
	private StateActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("list_actions", p -> Actions.listActions());
		h.put("get_state", StateActions::getState);
		h.put("get_block", StateActions::getBlock);
		h.put("scan_blocks", StateActions::scanBlocks);
		h.put("get_entities", StateActions::getEntities);
		h.put("set_input_lock", StateActions::setInputLock);
	}

	/**
	 * Turns the human lockout on or off. Called with no argument it just reports
	 * the current setting, which is the only way to find out.
	 */
	private static JsonObject setInputLock(JsonObject params) {
		if (params.has("locked")) {
			dev.mcmcp.bridge.UserInputLock.set(Json.bool(params, "locked", true));
		}
		JsonObject o = Json.ok();
		o.addProperty("locked", dev.mcmcp.bridge.UserInputLock.locked());
		o.addProperty("note", "when locked, keyboard and mouse input to the game window is ignored; "
				+ "bridge actions are unaffected, and the window can still be moved and closed");
		return o;
	}

	private static JsonObject getState(JsonObject params) {
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			JsonObject o = Json.ok();
			o.addProperty("inWorld", Mc.inWorld());
			o.addProperty("fps", mc.getFps());

			JsonObject screen = new JsonObject();
			var current = mc.gui == null ? null : mc.gui.screen();
			screen.addProperty("open", current != null);
			if (current != null) {
				screen.addProperty("class", current.getClass().getSimpleName());
				screen.addProperty("title", current.getTitle().getString());
			}
			o.add("screen", screen);

			if (!Mc.inWorld()) return o;

			LocalPlayer p = Mc.player();
			ClientLevel level = Mc.level();

			JsonObject player = new JsonObject();
			player.addProperty("name", p.getName().getString());
			player.add("position", Json.vec(p.getX(), p.getY(), p.getZ()));
			player.add("blockPosition", Mc.posJson(p.blockPosition()));
			player.addProperty("yaw", p.getYRot());
			player.addProperty("pitch", p.getXRot());
			player.addProperty("health", p.getHealth());
			player.addProperty("maxHealth", p.getMaxHealth());
			player.addProperty("food", p.getFoodData().getFoodLevel());
			player.addProperty("onGround", p.onGround());
			player.addProperty("sprinting", p.isSprinting());
			player.addProperty("sneaking", p.isShiftKeyDown());
			player.addProperty("gameMode", String.valueOf(mc.gameMode == null ? null : mc.gameMode.getPlayerMode()));
			player.addProperty("selectedSlot", p.getInventory().getSelectedSlot());
			player.add("heldItem", Mc.stackJson(p.getInventory().getSelectedItem()));
			o.add("player", player);

			JsonObject world = new JsonObject();
			world.addProperty("dimension", level.dimension().identifier().toString());
			// 26.2 dropped the client-side day-time accessor; game time is still
			// available, and "/time query time" covers the rest. (Not "query
			// daytime" -- 26.x reworked /time and that argument no longer exists.)
			world.addProperty("gameTime", level.getLevelData().getGameTime());
			world.addProperty("raining", level.isRaining());
			o.add("world", world);

			o.add("crosshair", hitResultJson(mc.hitResult));
			o.addProperty("chatCursor", dev.mcmcp.bridge.ChatLog.cursor());
			return o;
		});
	}

	/** What the player is currently looking at, if anything. */
	static JsonObject hitResultJson(HitResult hit) {
		JsonObject o = new JsonObject();
		if (hit == null || hit.getType() == HitResult.Type.MISS) {
			o.addProperty("type", "miss");
			return o;
		}
		if (hit instanceof BlockHitResult bhr) {
			BlockPos pos = bhr.getBlockPos();
			o.addProperty("type", "block");
			o.add("position", Mc.posJson(pos));
			o.addProperty("face", bhr.getDirection().getName());
			try {
				o.addProperty("block", Mc.blockId(Mc.level().getBlockState(pos)));
			} catch (Exception ignored) {
				// level may be gone between the raycast and this read
			}
			o.addProperty("distance", Math.sqrt(hit.getLocation().distanceToSqr(Mc.player().position())));
		} else if (hit instanceof EntityHitResult ehr) {
			o.addProperty("type", "entity");
			o.add("entity", entityJson(ehr.getEntity()));
		}
		return o;
	}

	private static JsonObject getBlock(JsonObject params) {
		return ClientTask.get(() -> {
			BlockPos pos = Mc.blockPos(params);
			BlockState state = Mc.level().getBlockState(pos);
			JsonObject o = Json.ok();
			o.add("position", Mc.posJson(pos));
			o.addProperty("block", Mc.blockId(state));
			o.addProperty("state", state.toString());
			o.addProperty("air", state.isAir());
			return o;
		});
	}

	/**
	 * Bulk block read over a box. Returns a run-length-ish summary plus the
	 * non-air blocks, so the agent can inspect a build it just made without
	 * pulling tens of thousands of entries through the transport.
	 */
	private static JsonObject scanBlocks(JsonObject params) {
		int x1 = Json.reqInt(params, "x1"), y1 = Json.reqInt(params, "y1"), z1 = Json.reqInt(params, "z1");
		int x2 = Json.reqInt(params, "x2"), y2 = Json.reqInt(params, "y2"), z2 = Json.reqInt(params, "z2");
		boolean includeAir = Json.bool(params, "includeAir", false);
		int limit = Math.min(Json.i(params, "limit", 20000), 200000);

		int minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
		int minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
		int minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);

		long volume = (long) (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
		if (volume > 1_000_000L) {
			throw new IllegalArgumentException("region too large (" + volume + " blocks); scan at most 1,000,000 at a time");
		}

		return ClientTask.get(() -> {
			ClientLevel level = Mc.level();
			JsonArray blocks = Json.arr();
			Map<String, Integer> counts = new java.util.TreeMap<>();
			int emitted = 0;
			boolean truncated = false;

			BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
			for (int y = minY; y <= maxY; y++) {
				for (int z = minZ; z <= maxZ; z++) {
					for (int x = minX; x <= maxX; x++) {
						cursor.set(x, y, z);
						BlockState state = level.getBlockState(cursor);
						boolean air = state.isAir();
						String id = Mc.blockId(state);
						counts.merge(id, 1, Integer::sum);
						if (air && !includeAir) continue;
						if (emitted >= limit) {
							truncated = true;
							continue;
						}
						JsonObject b = new JsonObject();
						b.addProperty("x", x);
						b.addProperty("y", y);
						b.addProperty("z", z);
						b.addProperty("block", id);
						blocks.add(b);
						emitted++;
					}
				}
			}

			JsonObject histogram = new JsonObject();
			counts.forEach(histogram::addProperty);

			JsonObject o = Json.ok();
			o.addProperty("volume", volume);
			o.addProperty("truncated", truncated);
			o.add("counts", histogram);
			o.add("blocks", blocks);
			return o;
		}, 30_000);
	}

	private static JsonObject getEntities(JsonObject params) {
		double radius = Json.d(params, "radius", 16);
		int limit = Json.i(params, "limit", 64);
		return ClientTask.get(() -> {
			LocalPlayer p = Mc.player();
			AABB box = p.getBoundingBox().inflate(radius);
			JsonArray arr = Json.arr();
			for (Entity e : Mc.level().getEntities(p, box, x -> true)) {
				if (arr.size() >= limit) break;
				arr.add(entityJson(e));
			}
			JsonObject o = Json.ok();
			o.add("entities", arr);
			return o;
		});
	}

	static JsonObject entityJson(Entity e) {
		JsonObject o = new JsonObject();
		o.addProperty("id", e.getId());
		o.addProperty("uuid", e.getUUID().toString());
		o.addProperty("type", net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString());
		o.addProperty("name", e.getName().getString());
		o.add("position", Json.vec(e.getX(), e.getY(), e.getZ()));
		if (e instanceof LivingEntity le) {
			o.addProperty("health", le.getHealth());
			o.addProperty("maxHealth", le.getMaxHealth());
		}
		try {
			o.addProperty("distance", Math.sqrt(e.distanceToSqr(Mc.player())));
		} catch (Exception ignored) {
			// no player; distance is meaningless
		}
		return o;
	}
}
