package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/** Inventory, hotbar and open-container manipulation. */
final class InventoryActions {
	private InventoryActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("get_inventory", InventoryActions::getInventory);
		h.put("select_slot", InventoryActions::selectSlot);
		h.put("select_item", InventoryActions::selectItem);
		h.put("click_slot", InventoryActions::clickSlot);
		h.put("drop_item", InventoryActions::dropItem);
		h.put("swap_offhand", InventoryActions::swapOffhand);
	}

	private static JsonObject getInventory(JsonObject params) {
		return ClientTask.get(() -> {
			LocalPlayer p = Mc.player();
			Inventory inv = p.getInventory();

			JsonArray items = Json.arr();
			var list = inv.getNonEquipmentItems();
			for (int i = 0; i < list.size(); i++) {
				ItemStack stack = list.get(i);
				if (stack.isEmpty()) continue;
				JsonObject entry = Mc.stackJson(stack);
				entry.addProperty("slot", i);
				entry.addProperty("hotbar", Inventory.isHotbarSlot(i));
				items.add(entry);
			}

			JsonObject o = Json.ok();
			o.addProperty("selectedSlot", inv.getSelectedSlot());
			o.add("selectedItem", Mc.stackJson(inv.getSelectedItem()));
			o.add("offhand", Mc.stackJson(p.getOffhandItem()));
			o.add("items", items);

			// Whatever container is open right now, if any.
			AbstractContainerMenu menu = p.containerMenu;
			if (menu != null && menu != p.inventoryMenu) {
				JsonArray slots = Json.arr();
				for (int i = 0; i < menu.slots.size(); i++) {
					Slot slot = menu.getSlot(i);
					if (!slot.hasItem()) continue;
					JsonObject entry = Mc.stackJson(slot.getItem());
					entry.addProperty("slot", i);
					slots.add(entry);
				}
				JsonObject container = new JsonObject();
				container.addProperty("class", menu.getClass().getSimpleName());
				container.addProperty("containerId", menu.containerId);
				container.addProperty("slotCount", menu.slots.size());
				container.add("slots", slots);
				o.add("openContainer", container);
			}
			return o;
		});
	}

	private static JsonObject selectSlot(JsonObject params) {
		int slot = Json.reqInt(params, "slot");
		if (slot < 0 || slot >= Inventory.getSelectionSize()) {
			throw new IllegalArgumentException("hotbar slot must be 0.." + (Inventory.getSelectionSize() - 1));
		}
		return ClientTask.get(() -> {
			Inventory inv = Mc.player().getInventory();
			inv.setSelectedSlot(slot);
			JsonObject o = Json.ok();
			o.addProperty("selectedSlot", slot);
			o.add("selectedItem", Mc.stackJson(inv.getSelectedItem()));
			return o;
		});
	}

	/**
	 * Convenience: put an item into the hand by registry id, moving it to the
	 * hotbar first if it is only in the main inventory.
	 */
	private static JsonObject selectItem(JsonObject params) {
		String wanted = Json.reqStr(params, "id");
		String normalized = wanted.contains(":") ? wanted : "minecraft:" + wanted;
		return ClientTask.get(() -> {
			Inventory inv = Mc.player().getInventory();
			var list = inv.getNonEquipmentItems();
			int found = -1;
			for (int i = 0; i < list.size(); i++) {
				ItemStack stack = list.get(i);
				if (!stack.isEmpty() && Mc.itemId(stack).equals(normalized)) {
					found = i;
					break;
				}
			}
			if (found < 0) throw new IllegalArgumentException("no '" + normalized + "' in inventory");

			if (Inventory.isHotbarSlot(found)) {
				inv.setSelectedSlot(found);
			} else {
				// Same path as pressing the pick-block key: swaps it into the hotbar.
				inv.pickSlot(found);
			}
			JsonObject o = Json.ok();
			o.addProperty("selectedSlot", inv.getSelectedSlot());
			o.add("selectedItem", Mc.stackJson(inv.getSelectedItem()));
			return o;
		});
	}

	private static JsonObject clickSlot(JsonObject params) {
		int slot = Json.reqInt(params, "slot");
		int button = Json.i(params, "button", 0);
		String typeName = Json.str(params, "type", "PICKUP").toUpperCase(Locale.ROOT);
		ContainerInput type;
		try {
			type = ContainerInput.valueOf(typeName);
		} catch (IllegalArgumentException e) {
			throw new IllegalArgumentException("unknown click type '" + typeName
					+ "'; expected one of PICKUP, QUICK_MOVE, SWAP, CLONE, THROW, QUICK_CRAFT, PICKUP_ALL");
		}

		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			LocalPlayer p = Mc.player();
			if (client.gameMode == null) throw new IllegalStateException("no game mode");
			AbstractContainerMenu menu = p.containerMenu;
			if (menu == null) throw new IllegalStateException("no container menu is open");
			if (slot < 0 || slot >= menu.slots.size()) {
				throw new IllegalArgumentException("slot must be 0.." + (menu.slots.size() - 1) + " for the open container");
			}
			client.gameMode.handleContainerInput(menu.containerId, slot, button, type, p);

			JsonObject o = Json.ok();
			o.addProperty("slot", slot);
			o.addProperty("type", type.name());
			o.add("slotItem", Mc.stackJson(menu.getSlot(slot).getItem()));
			o.add("carried", Mc.stackJson(menu.getCarried()));
			return o;
		});
	}

	private static JsonObject dropItem(JsonObject params) {
		boolean wholeStack = Json.bool(params, "wholeStack", false);
		return ClientTask.get(() -> {
			Minecraft client = Mc.mc();
			LocalPlayer p = Mc.player();
			p.drop(wholeStack);
			JsonObject o = Json.ok();
			o.addProperty("wholeStack", wholeStack);
			o.add("selectedItem", Mc.stackJson(p.getInventory().getSelectedItem()));
			return o;
		});
	}

	private static JsonObject swapOffhand(JsonObject params) {
		String before = ClientTask.get(() -> {
			LocalPlayer p = Mc.player();
			return Mc.itemIdOrEmpty(p.getMainHandItem()) + "|" + Mc.itemIdOrEmpty(p.getOffhandItem());
		});

		ClientTask.get(() -> {
			pressKeybind(Mc.mc().options.keySwapOffhand);
			return Boolean.TRUE;
		});

		// The swap is server-authoritative: the client sends the action and the
		// new contents arrive in a later packet. Waiting a fixed tick reports the
		// hands from before the round trip often enough to be untrustworthy, so
		// wait for the contents to actually change.
		long timeoutMs = Json.i(params, "timeoutMs", 3_000);
		boolean applied = TickJobs.await((client, tick) -> {
			LocalPlayer p = client.player;
			if (p == null) return null;
			String now = Mc.itemIdOrEmpty(p.getMainHandItem()) + "|" + Mc.itemIdOrEmpty(p.getOffhandItem());
			return now.equals(before) ? null : Boolean.TRUE;
		}, timeoutMs) != null;

		return ClientTask.get(() -> {
			LocalPlayer p = Mc.player();
			JsonObject o = applied
					? Json.ok()
					: Json.error("the hands did not change within " + timeoutMs
							+ "ms; the swap may have been rejected (both hands empty?)");
			o.add("mainHand", Mc.stackJson(p.getMainHandItem()));
			o.add("offhand", Mc.stackJson(p.getOffhandItem()));
			return o;
		});
	}

	/**
	 * Registers a single press of a keybind, the way a real key does.
	 *
	 * <p>Held-key actions (walking) read {@code isDown}, but one-shot actions --
	 * swapping hands, dropping, the hotbar keys -- are driven by {@code
	 * consumeClick}, which counts presses. {@code setDown} does not touch that
	 * counter, so toggling it around a one-shot action looks like it should work
	 * and silently does nothing at all.
	 */
	private static void pressKeybind(net.minecraft.client.KeyMapping mapping) {
		// The bound key is not exposed directly, but it round-trips through the
		// same string the options file stores.
		var key = com.mojang.blaze3d.platform.InputConstants.getKey(mapping.saveString());
		net.minecraft.client.KeyMapping.click(key);
	}
}
