package dev.mcmcp.bridge.actions;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/** Shared accessors and converters used by every action module. */
final class Mc {
	private Mc() {
	}

	static Minecraft mc() {
		return Minecraft.getInstance();
	}

	/** The local player, or a clear error if we are not in a world yet. */
	static LocalPlayer player() {
		LocalPlayer p = mc().player;
		if (p == null) throw new IllegalStateException("not in a world (no local player)");
		return p;
	}

	static ClientLevel level() {
		ClientLevel l = mc().level;
		if (l == null) throw new IllegalStateException("not in a world (no client level)");
		return l;
	}

	static boolean inWorld() {
		return mc().player != null && mc().level != null;
	}

	/** Accepts fractional coordinates and floors them, as the game does. */
	static BlockPos blockPos(JsonObject o) {
		return new BlockPos(
				net.minecraft.util.Mth.floor(dev.mcmcp.bridge.Json.reqDouble(o, "x")),
				net.minecraft.util.Mth.floor(dev.mcmcp.bridge.Json.reqDouble(o, "y")),
				net.minecraft.util.Mth.floor(dev.mcmcp.bridge.Json.reqDouble(o, "z")));
	}

	static JsonObject posJson(BlockPos p) {
		JsonObject o = new JsonObject();
		o.addProperty("x", p.getX());
		o.addProperty("y", p.getY());
		o.addProperty("z", p.getZ());
		return o;
	}

	static JsonObject vecJson(Vec3 v) {
		return dev.mcmcp.bridge.Json.vec(v.x, v.y, v.z);
	}

	static Direction direction(String name, Direction fallback) {
		if (name == null) return fallback;
		Direction d = Direction.byName(name.toLowerCase(java.util.Locale.ROOT));
		return d == null ? fallback : d;
	}

	/** Registry id such as {@code minecraft:stone}. */
	static String blockId(BlockState state) {
		return net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
	}

	static String itemId(ItemStack stack) {
		return net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()).toString();
	}

	/** Registry id, or "" for an empty stack. Handy for comparing hand contents. */
	static String itemIdOrEmpty(ItemStack stack) {
		return stack == null || stack.isEmpty() ? "" : itemId(stack) + "x" + stack.getCount();
	}

	static JsonObject stackJson(ItemStack stack) {
		JsonObject o = new JsonObject();
		if (stack == null || stack.isEmpty()) {
			o.addProperty("empty", true);
			return o;
		}
		o.addProperty("empty", false);
		o.addProperty("id", itemId(stack));
		o.addProperty("count", stack.getCount());
		o.addProperty("name", stack.getHoverName().getString());
		return o;
	}
}
