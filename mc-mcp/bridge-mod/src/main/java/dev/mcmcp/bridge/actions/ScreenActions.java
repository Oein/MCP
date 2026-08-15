package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.layouts.LayoutElement;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.ObjectSelectionList;
import net.minecraft.client.gui.components.events.ContainerEventHandler;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.input.MouseButtonInfo;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/**
 * Generic screen interaction, which is also how 26.x server dialogs are driven.
 *
 * <p>A {@code /dialog show} opens an ordinary {@code Screen} whose buttons and
 * inputs are plain widgets, so instead of special-casing the dialog classes we
 * enumerate the widget tree and dispatch real mouse and key events at it. The
 * same actions therefore work for dialogs, inventories, sign editing and any
 * modded GUI.
 */
final class ScreenActions {
	private ScreenActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("get_screen", ScreenActions::getScreen);
		h.put("click_widget", ScreenActions::clickWidget);
		h.put("set_widget_text", ScreenActions::setWidgetText);
		h.put("press_key", ScreenActions::pressKey);
		h.put("close_screen", ScreenActions::closeScreen);
		h.put("open_inventory", ScreenActions::openInventory);
		h.put("wait_for_screen", ScreenActions::waitForScreen);
	}

	private static Screen currentScreen() {
		Minecraft mc = Mc.mc();
		return mc.gui == null ? null : mc.gui.screen();
	}

	private static Screen requireScreen() {
		Screen s = currentScreen();
		if (s == null) throw new IllegalStateException("no screen is open");
		return s;
	}

	/** Depth-first walk of the widget tree, in the order the player would tab through it. */
	private static void collect(GuiEventListener node, List<GuiEventListener> out, int depth) {
		if (depth > 12) return;
		// Rows of a scrolling list are not AbstractWidgets, so without this the
		// world list, server list and resource-pack list would be invisible here
		// -- and an agent could never load an existing world.
		if (node instanceof AbstractWidget || isListEntry(node)) out.add(node);
		if (node instanceof ContainerEventHandler container) {
			for (GuiEventListener child : container.children()) {
				if (child == node) continue;
				collect(child, out, depth + 1);
			}
		}
	}

	/**
	 * A row of a scrolling list.
	 *
	 * <p>Detected structurally rather than by class: {@code AbstractSelectionList.Entry}
	 * is protected, but every entry implements the public {@link LayoutElement},
	 * which is also where its on-screen bounds come from.
	 */
	private static boolean isListEntry(GuiEventListener node) {
		return node instanceof LayoutElement && !(node instanceof AbstractWidget);
	}

	/** Label for a node, whatever kind it is; empty string when it has none. */
	private static String labelOf(GuiEventListener node) {
		if (node instanceof AbstractWidget w) return w.getMessage().getString();
		if (node instanceof ObjectSelectionList.Entry<?> entry) {
			// A list row's narration is its human-readable name -- the world name,
			// the server name -- which is what a caller will match on.
			return entry.getNarration().getString();
		}
		return "";
	}

	/** Screen-space centre of a node, for dispatching a click at it. */
	private static double[] centreOf(GuiEventListener node) {
		if (node instanceof AbstractWidget w) {
			return new double[]{w.getX() + w.getWidth() / 2.0, w.getY() + w.getHeight() / 2.0};
		}
		if (node instanceof LayoutElement e) {
			return new double[]{e.getX() + e.getWidth() / 2.0, e.getY() + e.getHeight() / 2.0};
		}
		throw new IllegalArgumentException("this element cannot be clicked");
	}

	private static List<GuiEventListener> widgets(Screen screen) {
		List<GuiEventListener> out = new ArrayList<>();
		for (GuiEventListener child : screen.children()) {
			collect(child, out, 0);
		}
		return out;
	}

	private static JsonObject widgetJson(GuiEventListener node, int index) {
		JsonObject o = new JsonObject();
		o.addProperty("index", index);
		o.addProperty("class", node.getClass().getSimpleName());
		if (node instanceof AbstractWidget w) {
			o.addProperty("label", w.getMessage().getString());
			o.addProperty("x", w.getX());
			o.addProperty("y", w.getY());
			o.addProperty("width", w.getWidth());
			o.addProperty("height", w.getHeight());
			o.addProperty("active", w.isActive());
			o.addProperty("visible", w.visible);
		}
		if (isListEntry(node) && node instanceof LayoutElement entry) {
			o.addProperty("kind", "listEntry");
			o.addProperty("label", labelOf(node));
			o.addProperty("x", entry.getX());
			o.addProperty("y", entry.getY());
			o.addProperty("width", entry.getWidth());
			o.addProperty("height", entry.getHeight());
			o.addProperty("note", "a row in a scrolling list; some lists need doubleClick:true to activate");
		} else if (node instanceof EditBox box) {
			o.addProperty("kind", "input");
			o.addProperty("value", box.getValue());
		} else if (node instanceof net.minecraft.client.gui.components.AbstractButton) {
			o.addProperty("kind", "button");
		}
		return o;
	}

	private static JsonObject getScreen(JsonObject params) {
		return ClientTask.get(() -> {
			Screen screen = currentScreen();
			JsonObject o = Json.ok();
			o.addProperty("open", screen != null);
			if (screen == null) return o;

			o.addProperty("class", screen.getClass().getSimpleName());
			o.addProperty("qualifiedClass", screen.getClass().getName());
			o.addProperty("title", screen.getTitle().getString());
			// DialogScreen subclasses are how /dialog surfaces; flag it so the
			// caller knows it is looking at a server-driven dialog.
			o.addProperty("isDialog",
					net.minecraft.client.gui.screens.dialog.DialogScreen.class.isAssignableFrom(screen.getClass()));
			o.addProperty("narration", screen.getNarrationMessage().getString());

			JsonArray arr = Json.arr();
			List<GuiEventListener> list = widgets(screen);
			for (int i = 0; i < list.size(); i++) arr.add(widgetJson(list.get(i), i));
			o.add("widgets", arr);
			return o;
		});
	}

	/** Resolves a widget by explicit index, or by (case-insensitive) label match. */
	private static int resolveIndex(List<GuiEventListener> list, JsonObject params) {
		return resolveIndex(list, params, null);
	}

	/**
	 * As above, but when matching by label, only considers widgets of {@code
	 * only} (when given).
	 *
	 * <p>A labelled control is usually two widgets: a caption and the control
	 * itself, both carrying the same text. "Set the box labelled Message" is
	 * unambiguous to a caller and ambiguous to a plain label search, which finds
	 * the caption first because it is drawn first. Filtering by the type the
	 * action can actually act on resolves it the way the caller meant.
	 */
	private static int resolveIndex(List<GuiEventListener> list, JsonObject params, Class<?> only) {
		if (only != null && !Json.has(params, "index")) {
			List<GuiEventListener> matching = new java.util.ArrayList<>();
			List<Integer> positions = new java.util.ArrayList<>();
			for (int i = 0; i < list.size(); i++) {
				if (only.isInstance(list.get(i))) {
					matching.add(list.get(i));
					positions.add(i);
				}
			}
			if (!matching.isEmpty()) {
				return positions.get(resolveIndex(matching, params, null));
			}
			// Fall through: with nothing of that type on screen, the generic
			// lookup produces the better error message.
		}
		if (Json.has(params, "index")) {
			int idx = Json.i(params, "index", -1);
			if (idx < 0 || idx >= list.size()) {
				throw new IllegalArgumentException("widget index " + idx + " out of range (0.." + (list.size() - 1) + ")");
			}
			return idx;
		}
		String label = Json.str(params, "label", null);
		if (label == null) throw new IllegalArgumentException("pass either 'index' or 'label'");

		String needle = label.toLowerCase(Locale.ROOT);
		int exact = -1, partial = -1;
		for (int i = 0; i < list.size(); i++) {
			String text = labelOf(list.get(i)).toLowerCase(Locale.ROOT);
			if (text.isEmpty()) continue;
			if (text.equals(needle) && exact < 0) exact = i;
			else if (text.contains(needle) && partial < 0) partial = i;
		}
		int found = exact >= 0 ? exact : partial;
		if (found < 0) {
			// Say which screen was actually inspected and what was on it. Screens
			// change under the caller (a transient ProgressScreen during a world
			// load has no widgets at all), and a bare "not found" makes that look
			// like a bad label rather than a screen that has moved on.
			Screen screen = currentScreen();
			String where = screen == null ? "no screen" : screen.getClass().getSimpleName();
			StringBuilder available = new StringBuilder();
			for (GuiEventListener node : list) {
				String text = labelOf(node);
				if (text.isEmpty()) continue;
				if (available.length() > 0) available.append(", ");
				available.append('\'').append(text).append('\'');
			}
			throw new IllegalArgumentException("no widget labelled '" + label + "' on " + where
					+ (available.length() == 0
							? "; it has no widgets (the screen may still be loading)"
							: "; available labels: " + available));
		}
		return found;
	}

	private static JsonObject clickWidget(JsonObject params) {
		int button = Json.i(params, "button", 0);
		return ClientTask.get(() -> {
			Screen screen = requireScreen();
			List<GuiEventListener> list = widgets(screen);
			int index = resolveIndex(list, params);
			GuiEventListener node = list.get(index);
			if (node instanceof AbstractWidget w && (!w.isActive() || !w.visible)) {
				throw new IllegalStateException("widget '" + w.getMessage().getString() + "' is disabled or hidden");
			}

			// Click the element's centre, exactly as a mouse would land on it.
			double[] centre = centreOf(node);
			MouseButtonEvent event = new MouseButtonEvent(centre[0], centre[1], new MouseButtonInfo(button, 0));
			screen.mouseClicked(event, false);
			screen.mouseReleased(event);

			// Lists distinguish "select" from "activate": a world row selects on a
			// single click and only loads on a double click, which is what the
			// second argument to mouseClicked signals.
			if (Json.bool(params, "doubleClick", false)) {
				screen.mouseClicked(event, true);
				screen.mouseReleased(event);
			}

			JsonObject o = Json.ok();
			o.add("clicked", widgetJson(node, index));
			Screen after = currentScreen();
			o.addProperty("screenAfter", after == null ? null : after.getClass().getSimpleName());
			return o;
		});
	}

	private static JsonObject setWidgetText(JsonObject params) {
		String text = Json.reqStr(params, "text");
		return ClientTask.get(() -> {
			Screen screen = requireScreen();
			List<GuiEventListener> list = widgets(screen);
			int index = resolveIndex(list, params, EditBox.class);
			if (!(list.get(index) instanceof EditBox box)) {
				throw new IllegalArgumentException("widget " + index + " is not a text input");
			}
			box.setFocused(true);
			box.setValue(text);
			JsonObject o = Json.ok();
			o.add("widget", widgetJson(box, index));
			return o;
		});
	}

	private static final Map<String, Integer> KEYS = Map.ofEntries(
			Map.entry("enter", GLFW.GLFW_KEY_ENTER),
			Map.entry("escape", GLFW.GLFW_KEY_ESCAPE),
			Map.entry("tab", GLFW.GLFW_KEY_TAB),
			Map.entry("backspace", GLFW.GLFW_KEY_BACKSPACE),
			Map.entry("delete", GLFW.GLFW_KEY_DELETE),
			Map.entry("up", GLFW.GLFW_KEY_UP),
			Map.entry("down", GLFW.GLFW_KEY_DOWN),
			Map.entry("left", GLFW.GLFW_KEY_LEFT),
			Map.entry("right", GLFW.GLFW_KEY_RIGHT),
			Map.entry("space", GLFW.GLFW_KEY_SPACE));

	private static JsonObject pressKey(JsonObject params) {
		String name = Json.reqStr(params, "key").toLowerCase(Locale.ROOT);
		Integer code = KEYS.get(name);
		if (code == null) {
			throw new IllegalArgumentException("unknown key '" + name + "'; expected one of " + KEYS.keySet());
		}
		return ClientTask.get(() -> {
			Screen screen = requireScreen();
			KeyEvent event = new KeyEvent(code, 0, 0);
			boolean handled = screen.keyPressed(event);
			JsonObject o = Json.ok();
			o.addProperty("key", name);
			o.addProperty("handled", handled);
			Screen after = currentScreen();
			o.addProperty("screenAfter", after == null ? null : after.getClass().getSimpleName());
			return o;
		});
	}

	private static JsonObject closeScreen(JsonObject params) {
		return ClientTask.get(() -> {
			Screen screen = currentScreen();
			if (screen == null) return Json.ok();
			screen.onClose();
			JsonObject o = Json.ok();
			Screen after = currentScreen();
			o.addProperty("screenAfter", after == null ? null : after.getClass().getSimpleName());
			return o;
		});
	}

	private static JsonObject openInventory(JsonObject params) {
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			Mc.player(); // fail clearly if we are not in a world
			mc.gui.setScreen(new net.minecraft.client.gui.screens.inventory.InventoryScreen(Mc.player()));
			JsonObject o = Json.ok();
			Screen after = currentScreen();
			o.addProperty("screen", after == null ? null : after.getClass().getSimpleName());
			return o;
		});
	}

	/** Blocks until a screen (optionally one whose class name matches) appears. */
	private static JsonObject waitForScreen(JsonObject params) {
		String match = Json.str(params, "classContains", null);
		long timeoutMs = Json.i(params, "timeoutMs", 5000);

		JsonObject found = TickJobs.await((client, tick) -> {
			Screen s = client.gui == null ? null : client.gui.screen();
			if (s == null) return null;
			if (match != null && !s.getClass().getSimpleName().toLowerCase(Locale.ROOT)
					.contains(match.toLowerCase(Locale.ROOT))) {
				return null;
			}
			JsonObject o = Json.ok();
			o.addProperty("class", s.getClass().getSimpleName());
			o.addProperty("title", s.getTitle().getString());
			return o;
		}, timeoutMs);

		if (found == null) return Json.error("no matching screen appeared within " + timeoutMs + "ms");
		return found;
	}
}
