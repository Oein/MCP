package dev.mcmcp.bridge.actions;

import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/**
 * Block and entity interaction.
 *
 * <p>Each action first aims the camera at the target and only then acts, so the
 * server sees a look packet followed by a plausible interaction — the same
 * ordering a human produces. Actions that take time (mining) run as tick jobs.
 */
final class InteractActions {
	private InteractActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("break_block", InteractActions::breakBlock);
		h.put("use_on_block", InteractActions::useOnBlock);
		h.put("place_block", InteractActions::useOnBlock);
		h.put("use_item", InteractActions::useItem);
		h.put("attack_entity", InteractActions::attackEntity);
		h.put("interact_entity", InteractActions::interactEntity);
		h.put("pick_block", InteractActions::pickBlock);
		h.put("swing", InteractActions::swing);
	}

	private static InteractionHand hand(JsonObject params) {
		return "off".equalsIgnoreCase(Json.str(params, "hand", "main"))
				? InteractionHand.OFF_HAND
				: InteractionHand.MAIN_HAND;
	}

	/** Points the camera at a world position immediately (no easing). */
	private static void aimAt(LocalPlayer p, Vec3 target) {
		Vec3 eye = p.getEyePosition();
		double dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
		double horizontal = Math.sqrt(dx * dx + dz * dz);
		p.setYRot((float) (Mth.atan2(dz, dx) * (180 / Math.PI)) - 90f);
		p.setXRot(Mth.clamp((float) (-(Mth.atan2(dy, horizontal) * (180 / Math.PI))), -90f, 90f));
	}

	private static JsonObject breakBlock(JsonObject params) {
		BlockPos pos = Mc.blockPos(params);
		long timeoutMs = Json.i(params, "timeoutMs", 15_000);
		Direction face = Mc.direction(Json.str(params, "face", null), null);

		JsonObject result = TickJobs.await((client, tick) -> {
			LocalPlayer p = client.player;
			if (p == null || client.level == null || client.gameMode == null) {
				throw new IllegalStateException("not in a world");
			}
			if (client.level.getBlockState(pos).isAir()) {
				JsonObject o = Json.ok();
				o.add("position", Mc.posJson(pos));
				o.addProperty("broken", true);
				o.addProperty("ticks", tick);
				return o;
			}
			if (tick == 0) {
				aimAt(p, Vec3.atCenterOf(pos));
			}
			Direction hitFace = face != null ? face
					: (client.hitResult instanceof BlockHitResult bhr && bhr.getBlockPos().equals(pos)
					? bhr.getDirection()
					: Direction.UP);
			if (tick == 0) {
				client.gameMode.startDestroyBlock(pos, hitFace);
			} else {
				client.gameMode.continueDestroyBlock(pos, hitFace);
			}
			p.swing(InteractionHand.MAIN_HAND);
			return null;
		}, timeoutMs);

		if (result == null) {
			ClientTask.run(() -> {
				Minecraft c = Mc.mc();
				if (c.gameMode != null) c.gameMode.stopDestroyBlock();
			});
			JsonObject o = Json.error("block was not broken within " + timeoutMs + "ms");
			o.add("position", Mc.posJson(pos));
			return o;
		}
		return result;
	}

	private static JsonObject useOnBlock(JsonObject params) {
		BlockPos pos = Mc.blockPos(params);
		Direction face = Mc.direction(Json.str(params, "face", "up"), Direction.UP);
		InteractionHand h = hand(params);
		boolean insideBlock = Json.bool(params, "inside", false);

		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			LocalPlayer p = Mc.player();
			if (client.gameMode == null) throw new IllegalStateException("no game mode");

			// Aim at the centre of the targeted face, which is where a player would click.
			Vec3 hit = Vec3.atCenterOf(pos).add(
					face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
			aimAt(p, hit);

			BlockHitResult bhr = new BlockHitResult(hit, face, pos, insideBlock);
			InteractionResult r = client.gameMode.useItemOn(p, h, bhr);
			if (r.consumesAction()) p.swing(h);

			JsonObject o = Json.ok();
			o.add("position", Mc.posJson(pos));
			o.addProperty("face", face.getName());
			o.addProperty("result", r.getClass().getSimpleName());
			o.addProperty("consumed", r.consumesAction());
			o.add("heldItem", Mc.stackJson(p.getItemInHand(h)));
			return o;
		});
	}

	private static JsonObject useItem(JsonObject params) {
		InteractionHand h = hand(params);
		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			LocalPlayer p = Mc.player();
			if (client.gameMode == null) throw new IllegalStateException("no game mode");
			InteractionResult r = client.gameMode.useItem(p, h);
			if (r.consumesAction()) p.swing(h);
			JsonObject o = Json.ok();
			o.addProperty("result", r.getClass().getSimpleName());
			o.addProperty("consumed", r.consumesAction());
			return o;
		});
	}

	private static Entity requireEntity(Minecraft client, int id) {
		if (client.level == null) throw new IllegalStateException("not in a world");
		Entity e = client.level.getEntity(id);
		if (e == null) throw new IllegalArgumentException("no entity with id " + id + " is loaded");
		return e;
	}

	private static JsonObject attackEntity(JsonObject params) {
		int id = Json.reqInt(params, "entityId");
		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			LocalPlayer p = Mc.player();
			Entity e = requireEntity(client, id);
			if (client.gameMode == null) throw new IllegalStateException("no game mode");
			aimAt(p, e.getBoundingBox().getCenter());
			client.gameMode.attack(p, e);
			p.swing(InteractionHand.MAIN_HAND);
			JsonObject o = Json.ok();
			o.add("entity", StateActions.entityJson(e));
			return o;
		});
	}

	private static JsonObject interactEntity(JsonObject params) {
		int id = Json.reqInt(params, "entityId");
		InteractionHand h = hand(params);
		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			LocalPlayer p = Mc.player();
			Entity e = requireEntity(client, id);
			if (client.gameMode == null) throw new IllegalStateException("no game mode");
			Vec3 center = e.getBoundingBox().getCenter();
			aimAt(p, center);
			InteractionResult r = client.gameMode.interact(p, e, new net.minecraft.world.phys.EntityHitResult(e, center), h);
			if (r.consumesAction()) p.swing(h);
			JsonObject o = Json.ok();
			o.addProperty("result", r.getClass().getSimpleName());
			o.addProperty("consumed", r.consumesAction());
			o.add("entity", StateActions.entityJson(e));
			return o;
		});
	}

	private static JsonObject pickBlock(JsonObject params) {
		BlockPos pos = Mc.blockPos(params);
		boolean withData = Json.bool(params, "withData", false);
		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			if (client.gameMode == null) throw new IllegalStateException("no game mode");
			client.gameMode.handlePickItemFromBlock(pos, withData);
			JsonObject o = Json.ok();
			o.add("position", Mc.posJson(pos));
			o.add("heldItem", Mc.stackJson(Mc.player().getInventory().getSelectedItem()));
			return o;
		});
	}

	private static JsonObject swing(JsonObject params) {
		InteractionHand h = hand(params);
		return ClientTask.get(() -> {
			Mc.player().swing(h);
			JsonObject o = Json.ok();
			o.addProperty("hand", h.name().toLowerCase(Locale.ROOT));
			return o;
		});
	}
}
