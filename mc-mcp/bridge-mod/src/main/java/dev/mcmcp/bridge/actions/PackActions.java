package dev.mcmcp.bridge.actions;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import dev.mcmcp.bridge.ChatLog;
import dev.mcmcp.bridge.ClientTask;
import dev.mcmcp.bridge.Json;
import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.metadata.pack.PackFormat;
import net.minecraft.server.packs.metadata.pack.PackMetadataSection;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.server.packs.repository.PackRepository;
import net.minecraft.util.InclusiveRange;
import net.minecraft.world.level.storage.LevelResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * Authoring datapacks and swapping resource packs.
 *
 * <p>Writing a datapack by hand needs three things the agent cannot get from
 * memory: where this instance keeps its saves, what {@code pack_format} the
 * running version wants, and whether a {@code /reload} actually accepted the
 * result. All three are read from the live game here, which is the point --
 * 26.2's pack format is a major/minor pair, and a number recalled from a 1.21-era
 * tutorial produces a pack the game silently ignores.
 */
final class PackActions {
	private PackActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("get_paths", PackActions::getPaths);
		h.put("create_datapack", PackActions::createDatapack);
		h.put("write_datapack_file", PackActions::writeDatapackFile);
		h.put("list_datapack_files", PackActions::listDatapackFiles);
		h.put("delete_datapack_file", PackActions::deleteDatapackFile);
		h.put("reload_datapacks", PackActions::reloadDatapacks);
		h.put("list_resourcepacks", PackActions::listResourcePacks);
		h.put("set_resourcepack", PackActions::setResourcePack);
		h.put("get_registry", PackActions::getRegistry);
	}

	// --- locations ---------------------------------------------------------

	private static Path gameDir() {
		return net.fabricmc.loader.api.FabricLoader.getInstance().getGameDir();
	}

	/**
	 * The datapacks folder of a world.
	 *
	 * <p>Defaults to the world that is currently open, which is what an agent
	 * iterating on a pack wants. A {@code world} id may be given instead so a
	 * pack can be authored for a save that is not loaded -- useful because a
	 * datapack added to a *running* world still needs {@code /reload}, while one
	 * added before the world opens is picked up on load.
	 */
	private static Path datapacksDir(JsonObject params) {
		String world = Json.str(params, "world", null);
		if (world != null && !world.isBlank()) {
			Path dir = ClientTask.get(() -> Mc.mc().getLevelSource().getLevelPath(world.trim()));
			if (!Files.isDirectory(dir)) {
				throw new IllegalArgumentException("no saved world with id '" + world.trim()
						+ "'; call list_worlds to see what is available");
			}
			return dir.resolve("datapacks");
		}

		Path dir = ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			if (!mc.hasSingleplayerServer() || mc.getSingleplayerServer() == null) return null;
			return mc.getSingleplayerServer().getWorldPath(LevelResource.DATAPACK_DIR);
		});
		if (dir == null) {
			throw new IllegalStateException("not in a singleplayer world. Datapacks live on whichever machine runs "
					+ "the world, so on a multiplayer server they have to be installed server-side "
					+ "(<server>/world/datapacks). Pass 'world' to author a pack for a local save instead.");
		}
		return dir;
	}

	/**
	 * Resolves a caller-supplied relative path inside a root, refusing anything
	 * that climbs out of it. Every path in this class comes from the agent, so
	 * "../../.ssh/id_rsa" has to stop here rather than at the filesystem.
	 */
	private static Path resolveInside(Path root, String relative) {
		if (relative == null || relative.isBlank()) {
			throw new IllegalArgumentException("path is empty");
		}
		Path normalizedRoot = root.toAbsolutePath().normalize();
		Path target = normalizedRoot.resolve(relative).normalize();
		if (!target.startsWith(normalizedRoot)) {
			throw new IllegalArgumentException("path '" + relative + "' escapes " + normalizedRoot
					+ "; give a path relative to the pack, like 'data/mypack/function/hello.mcfunction'");
		}
		return target;
	}

	private static Path datapackRoot(JsonObject params) {
		String name = Json.reqStr(params, "datapack").trim();
		if (name.contains("/") || name.contains("\\") || name.equals("..") || name.equals(".")) {
			throw new IllegalArgumentException("datapack name must be a single folder name, not a path");
		}
		return datapacksDir(params).resolve(name);
	}

	private static JsonObject getPaths(JsonObject params) {
		JsonObject o = Json.ok();
		o.addProperty("gameDir", gameDir().toAbsolutePath().toString());
		o.addProperty("resourcePacksDir",
				ClientTask.get(() -> Mc.mc().getResourcePackDirectory()).toAbsolutePath().toString());
		o.addProperty("savesDir", gameDir().resolve("saves").toAbsolutePath().toString());

		JsonObject world = new JsonObject();
		String id = ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			if (!mc.hasSingleplayerServer() || mc.getSingleplayerServer() == null) return null;
			return mc.getSingleplayerServer().getWorldData().getLevelName();
		});
		if (id != null) {
			Path dir = ClientTask.get(() -> Mc.mc().getSingleplayerServer().getWorldPath(LevelResource.ROOT));
			world.addProperty("name", id);
			world.addProperty("dir", dir.toAbsolutePath().normalize().toString());
			world.addProperty("datapacksDir",
					dir.resolve("datapacks").toAbsolutePath().normalize().toString());
		} else {
			world.addProperty("note", "not in a singleplayer world; datapacks would have to go on the server");
		}
		o.add("currentWorld", world);

		o.addProperty("minecraft", SharedConstants.getCurrentVersion().name());
		o.add("packFormats", packFormatsJson());
		return o;
	}

	/**
	 * The pack_format numbers this exact build wants, read from the game rather
	 * than remembered. 26.2 uses a major/minor pair, so a bare integer recalled
	 * from an older tutorial is not enough.
	 */
	private static JsonObject packFormatsJson() {
		JsonObject formats = new JsonObject();
		for (PackType type : PackType.values()) {
			PackFormat f = SharedConstants.getCurrentVersion().packVersion(type);
			JsonObject j = new JsonObject();
			j.addProperty("major", f.major());
			j.addProperty("minor", f.minor());
			j.addProperty("directory", type.getDirectory());
			formats.add(type == PackType.SERVER_DATA ? "data" : "resource", j);
		}
		return formats;
	}

	/**
	 * Builds pack.mcmeta by running the game's own codec, so the file matches
	 * whatever shape this version expects instead of a hand-written guess.
	 */
	private static JsonObject packMcmeta(PackType type, String description) {
		PackFormat format = SharedConstants.getCurrentVersion().packVersion(type);
		PackMetadataSection section = new PackMetadataSection(
				Component.literal(description), new InclusiveRange<>(format, format));
		var meta = PackMetadataSection.forPackType(type);
		JsonElement encoded = meta.codec()
				.encodeStart(JsonOps.INSTANCE, section)
				.getOrThrow(msg -> new IllegalStateException("could not encode pack.mcmeta: " + msg));
		JsonObject root = new JsonObject();
		root.add(meta.name(), encoded);
		return root;
	}

	// --- datapack authoring ------------------------------------------------

	private static JsonObject createDatapack(JsonObject params) {
		Path root = datapackRoot(params);
		String description = Json.str(params, "description", "Created by mc-mcp");
		boolean overwrite = Json.bool(params, "overwrite", false);

		Path mcmeta = root.resolve("pack.mcmeta");
		if (Files.exists(mcmeta) && !overwrite) {
			JsonObject o = Json.ok();
			o.addProperty("path", root.toString());
			o.addProperty("created", false);
			o.addProperty("note", "pack.mcmeta already exists; pass overwrite:true to rewrite it");
			return o;
		}

		JsonObject mcmetaJson = ClientTask.get(() -> packMcmeta(PackType.SERVER_DATA, description));
		try {
			Files.createDirectories(root);
			Files.writeString(mcmeta, Json.GSON.toJson(mcmetaJson), StandardCharsets.UTF_8);
			// The data folder is where every id-addressed file lives; creating it
			// up front makes the expected layout obvious.
			Files.createDirectories(root.resolve("data"));
		} catch (IOException e) {
			throw new IllegalStateException("could not create the datapack: " + e.getMessage());
		}

		JsonObject o = Json.ok();
		o.addProperty("path", root.toString());
		o.addProperty("created", true);
		o.add("packMcmeta", mcmetaJson);
		o.addProperty("note", "put files under data/<namespace>/<registry>/<name>, then call reload_datapacks. "
				+ "Note the 26.2 folder names are singular: function, dialog, loot_table, recipe, advancement.");
		return o;
	}

	private static JsonObject writeDatapackFile(JsonObject params) {
		Path root = datapackRoot(params);
		String relative = Json.reqStr(params, "path");
		String content = Json.reqStr(params, "content");
		Path target = resolveInside(root, relative);

		// Catch malformed JSON here rather than letting /reload fail with a stack
		// trace that does not name the file.
		String lower = relative.toLowerCase(Locale.ROOT);
		if (lower.endsWith(".json") || lower.endsWith(".mcmeta")) {
			try {
				JsonParser.parseString(content);
			} catch (Exception e) {
				throw new IllegalArgumentException("'" + relative + "' is not valid JSON: " + e.getMessage());
			}
		}

		try {
			Files.createDirectories(target.getParent());
			Files.writeString(target, content, StandardCharsets.UTF_8);
		} catch (IOException e) {
			throw new IllegalStateException("could not write " + target + ": " + e.getMessage());
		}

		JsonObject o = Json.ok();
		o.addProperty("path", target.toString());
		o.addProperty("bytes", content.getBytes(StandardCharsets.UTF_8).length);
		if (!Files.exists(root.resolve("pack.mcmeta"))) {
			o.addProperty("warning", "this pack has no pack.mcmeta, so the game will ignore it; call create_datapack");
		}
		return o;
	}

	private static JsonObject listDatapackFiles(JsonObject params) {
		Path root = Json.has(params, "datapack") ? datapackRoot(params) : datapacksDir(params);
		JsonArray files = new JsonArray();
		if (Files.isDirectory(root)) {
			try (var stream = Files.walk(root)) {
				stream.filter(Files::isRegularFile)
						.sorted()
						.forEach(p -> {
							JsonObject f = new JsonObject();
							f.addProperty("path", root.relativize(p).toString());
							try {
								f.addProperty("bytes", Files.size(p));
							} catch (IOException ignored) {
								// a file that vanished mid-walk is not worth failing over
							}
							files.add(f);
						});
			} catch (IOException e) {
				throw new IllegalStateException("could not list " + root + ": " + e.getMessage());
			}
		}
		JsonObject o = Json.ok();
		o.addProperty("root", root.toString());
		o.add("files", files);
		return o;
	}

	private static JsonObject deleteDatapackFile(JsonObject params) {
		Path root = datapackRoot(params);
		String relative = Json.str(params, "path", null);
		// No path means "delete the whole pack", which is the usual way to undo a
		// bad experiment.
		Path target = relative == null || relative.isBlank() ? root : resolveInside(root, relative);

		if (!Files.exists(target)) {
			throw new IllegalArgumentException("nothing at " + target);
		}
		try {
			if (Files.isDirectory(target)) {
				Files.walkFileTree(target, new SimpleFileVisitor<>() {
					@Override
					public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
						Files.delete(file);
						return FileVisitResult.CONTINUE;
					}

					@Override
					public FileVisitResult postVisitDirectory(Path dir, IOException e) throws IOException {
						Files.delete(dir);
						return FileVisitResult.CONTINUE;
					}
				});
			} else {
				Files.delete(target);
			}
		} catch (IOException e) {
			throw new IllegalStateException("could not delete " + target + ": " + e.getMessage());
		}

		JsonObject o = Json.ok();
		o.addProperty("deleted", target.toString());
		o.addProperty("note", "call reload_datapacks for the game to notice");
		return o;
	}

	/**
	 * Runs {@code /reload} and says whether the datapacks actually came back.
	 *
	 * <p>A failed reload is the normal outcome of authoring a pack, and vanilla
	 * reports it only as a chat line -- the command itself looks like it worked.
	 * Reading the chat back and classifying it is what turns this into a usable
	 * edit/test loop.
	 */
	private static JsonObject reloadDatapacks(JsonObject params) {
		int waitMs = Json.i(params, "waitMs", 5000);
		long cursor = ChatLog.cursor();
		ClientTask.get(() -> {
			var connection = Mc.mc().getConnection();
			if (connection == null) throw new IllegalStateException("not in a world");
			connection.sendCommand("reload");
			return Boolean.TRUE;
		});

		JsonObject chat = ChatLog.waitFor(cursor, 50, waitMs);
		JsonArray messages = chat.getAsJsonArray("messages");

		boolean failed = false;
		JsonArray problems = new JsonArray();
		for (JsonElement e : messages) {
			String text = e.getAsJsonObject().has("text") ? e.getAsJsonObject().get("text").getAsString() : "";
			String lower = text.toLowerCase(Locale.ROOT);
			// Vanilla's wording for a rejected reload, plus the generic command
			// failure that a broken pack file produces.
			if (lower.contains("failed to reload") || lower.contains("reload failed")
					|| lower.contains("error") || lower.contains("could not")
					|| lower.contains("unknown or invalid")) {
				failed = true;
				problems.add(text);
			}
		}

		JsonObject o = failed
				? Json.error("/reload reported a problem; the datapack was not applied. "
						+ "Fix the file it names and reload again.")
				: Json.ok();
		o.add("messages", messages);
		if (problems.size() > 0) o.add("problems", problems);
		o.addProperty("note", "run '/datapack list' to confirm which packs are enabled");
		return o;
	}

	// --- resource packs ----------------------------------------------------

	private static JsonObject packJson(Pack pack, boolean selected) {
		JsonObject o = new JsonObject();
		o.addProperty("id", pack.getId());
		o.addProperty("title", pack.getTitle().getString());
		o.addProperty("description", pack.getDescription().getString());
		o.addProperty("selected", selected);
		return o;
	}

	private static JsonObject listResourcePacks(JsonObject params) {
		return ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			PackRepository repo = mc.getResourcePackRepository();
			repo.reload();
			Set<String> selected = new LinkedHashSet<>(repo.getSelectedIds());

			JsonArray packs = new JsonArray();
			for (Pack pack : repo.getAvailablePacks()) {
				packs.add(packJson(pack, selected.contains(pack.getId())));
			}
			JsonObject o = Json.ok();
			o.addProperty("directory", mc.getResourcePackDirectory().toAbsolutePath().toString());
			o.add("packs", packs);
			JsonArray sel = new JsonArray();
			selected.forEach(sel::add);
			o.add("selected", sel);
			o.addProperty("note", "later entries in 'selected' win over earlier ones");
			return o;
		});
	}

	/**
	 * Switches the active resource pack, installing it from a file path first if
	 * it is not already in the resourcepacks folder.
	 *
	 * <p>Selecting a pack means three separate things in vanilla, and doing only
	 * one of them looks like it silently failed: the repository has to know about
	 * the pack, the selection has to be applied, and it has to be written back to
	 * options.txt or the next reload reverts it. All three happen here, and the
	 * selection is re-read afterwards so a pack the game rejected shows up as
	 * absent rather than as success.
	 */
	private static JsonObject setResourcePack(JsonObject params) {
		String source = Json.str(params, "path", null);
		JsonObject result = Json.ok();

		String installedId = null;
		if (source != null && !source.isBlank()) {
			installedId = installResourcePack(source.trim(), result);
		}

		List<String> explicit = new ArrayList<>();
		boolean idsProvided = params.has("ids") && params.get("ids").isJsonArray();
		if (idsProvided) {
			params.getAsJsonArray("ids").forEach(e -> explicit.add(e.getAsString()));
		}
		// An empty 'ids' is a request, not an omission: it means "select nothing
		// extra", which is how a caller reverts to the default look. Only a call
		// that named neither a path nor an ids list is actually ambiguous.
		if (installedId == null && !idsProvided) {
			throw new IllegalArgumentException("pass 'path' to install and select a pack from disk, "
					+ "or 'ids' to select packs already present (list_resourcepacks shows them). "
					+ "Pass ids:[] to go back to the default look.");
		}

		boolean replace = Json.bool(params, "replace", true);
		String newId = installedId;
		boolean idsGiven = params.has("ids");

		JsonObject applied = ClientTask.get(() -> {
			Minecraft mc = Mc.mc();
			PackRepository repo = mc.getResourcePackRepository();
			repo.reload();

			LinkedHashSet<String> selection = new LinkedHashSet<>();
			if (replace) {
				// Keep the built-ins (vanilla, and whatever the mod loader adds)
				// and swap only the packs that came from the resourcepacks folder,
				// which is what "change the resource pack" means.
				for (String id : repo.getSelectedIds()) {
					if (!id.startsWith("file/")) selection.add(id);
				}
			} else {
				selection.addAll(repo.getSelectedIds());
			}

			List<String> wanted = new ArrayList<>(explicit);
			if (newId != null) wanted.add(newId);
			for (String id : wanted) {
				if (!repo.isAvailable(id)) {
					throw new IllegalArgumentException("no resource pack with id '" + id
							+ "'; call list_resourcepacks for the available ids");
				}
				// Re-adding moves it to the end, i.e. highest priority.
				selection.remove(id);
				selection.add(id);
			}

			repo.setSelected(selection);
			// Persist, or the next resource reload silently reverts the change.
			mc.options.updateResourcePacks(repo);
			mc.options.save();

			JsonObject r = new JsonObject();
			JsonArray req = new JsonArray();
			selection.forEach(req::add);
			r.add("requested", req);
			return r;
		});
		result.add("requested", applied.get("requested"));

		// Reloading is what actually applies the pack, and it is also where a
		// broken pack gets thrown out again.
		ClientTask.get(() -> Mc.mc().reloadResourcePacks()).join();

		JsonObject after = ClientTask.get(() -> {
			PackRepository repo = Mc.mc().getResourcePackRepository();
			JsonObject r = new JsonObject();
			JsonArray sel = new JsonArray();
			repo.getSelectedIds().forEach(sel::add);
			r.add("selected", sel);
			return r;
		});
		JsonArray selectedAfter = after.getAsJsonArray("selected");
		result.add("selected", selectedAfter);

		if (newId != null) {
			boolean survived = false;
			for (JsonElement e : selectedAfter) {
				if (e.getAsString().equals(newId)) survived = true;
			}
			if (!survived) {
				JsonObject err = Json.error("the game rejected '" + newId
						+ "' and dropped it during the resource reload; it is probably not a valid resource pack "
						+ "(a zip or folder with pack.mcmeta at its top level) or targets a different version");
				err.add("selected", selectedAfter);
				return err;
			}
			result.addProperty("applied", newId);
		}
		return result;
	}

	/**
	 * Copies a pack into the resourcepacks folder and returns the id the
	 * repository will know it by. A pack already living there is left alone.
	 */
	private static String installResourcePack(String source, JsonObject result) {
		Path from = Path.of(source).toAbsolutePath().normalize();
		if (!Files.exists(from)) {
			throw new IllegalArgumentException("no such file or folder: " + from);
		}
		boolean isZip = Files.isRegularFile(from) && from.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".zip");
		if (!isZip && !Files.isDirectory(from)) {
			throw new IllegalArgumentException(from + " is neither a .zip nor a folder; a resource pack is one or the other");
		}
		if (Files.isDirectory(from) && !Files.exists(from.resolve("pack.mcmeta"))) {
			throw new IllegalArgumentException(from + " has no pack.mcmeta at its top level, so it is not a resource "
					+ "pack. If the mcmeta is one level down, point at that inner folder instead.");
		}

		Path dir = ClientTask.get(() -> Mc.mc().getResourcePackDirectory()).toAbsolutePath().normalize();
		Path target = dir.resolve(from.getFileName().toString());
		if (from.equals(target)) {
			result.addProperty("installed", false);
			result.addProperty("note", "already in the resourcepacks folder; selecting it as-is");
		} else {
			try {
				Files.createDirectories(dir);
				if (isZip) {
					Files.copy(from, target, StandardCopyOption.REPLACE_EXISTING);
				} else {
					copyTree(from, target);
				}
			} catch (IOException e) {
				throw new IllegalStateException("could not install the pack into " + dir + ": " + e.getMessage());
			}
			result.addProperty("installed", true);
			result.addProperty("installedTo", target.toString());
		}
		// This is the id PackRepository gives folder/zip packs; it is what the
		// caller needs for a later 'ids' call.
		return "file/" + target.getFileName();
	}

	private static void copyTree(Path from, Path to) throws IOException {
		if (Files.exists(to)) {
			try (var stream = Files.walk(to)) {
				List<Path> paths = stream.sorted(Comparator.reverseOrder()).toList();
				for (Path p : paths) Files.delete(p);
			}
		}
		try (var stream = Files.walk(from)) {
			List<Path> paths = stream.toList();
			for (Path p : paths) {
				Path dest = to.resolve(from.relativize(p).toString());
				if (Files.isDirectory(p)) {
					Files.createDirectories(dest);
				} else {
					Files.createDirectories(dest.getParent());
					Files.copy(p, dest, StandardCopyOption.REPLACE_EXISTING);
				}
			}
		}
	}

	// --- registries --------------------------------------------------------

	/**
	 * Lists the ids in one of the server's registries.
	 *
	 * <p>Datapack files are almost entirely references to registry ids, and a
	 * wrong id fails at load with a message that names the file but not the
	 * alternatives. This answers "what may I actually write here" from the
	 * connected server's own registries, including entries datapacks added.
	 */
	private static JsonObject getRegistry(JsonObject params) {
		String name = Json.str(params, "registry", null);
		String filter = Json.str(params, "filter", "").toLowerCase(Locale.ROOT);
		int limit = Json.i(params, "limit", 500);

		return ClientTask.get(() -> {
			var connection = Mc.mc().getConnection();
			if (connection == null) throw new IllegalStateException("not in a world");
			RegistryAccess access = connection.registryAccess();

			if (name == null || name.isBlank()) {
				JsonArray names = new JsonArray();
				access.listRegistryKeys()
						.map(k -> k.identifier().toString())
						.sorted()
						.forEach((String s) -> names.add(s));
				JsonObject o = Json.ok();
				o.add("registries", names);
				o.addProperty("note", "pass one of these as 'registry' to list its entries");
				return o;
			}

			Identifier id = Identifier.tryParse(name.contains(":") ? name : "minecraft:" + name);
			if (id == null) throw new IllegalArgumentException("'" + name + "' is not a valid registry id");
			ResourceKey<? extends Registry<?>> key = ResourceKey.createRegistryKey(id);
			Registry<?> registry = access.lookup(key).orElseThrow(() -> new IllegalArgumentException(
					"no registry '" + id + "' on this server; call get_registry with no arguments to list them"));

			List<String> ids = registry.keySet().stream()
					.map(Identifier::toString)
					.filter(s -> filter.isEmpty() || s.toLowerCase(Locale.ROOT).contains(filter))
					.sorted()
					.toList();

			JsonArray entries = new JsonArray();
			ids.stream().limit(Math.max(0, limit)).forEach(entries::add);

			JsonObject o = Json.ok();
			o.addProperty("registry", id.toString());
			o.addProperty("total", ids.size());
			o.addProperty("truncated", ids.size() > entries.size());
			o.add("entries", entries);
			return o;
		});
	}
}
