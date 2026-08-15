package dev.mcmcp.bridge.actions;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.NativeImage;
import dev.mcmcp.bridge.Json;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * Screenshots.
 *
 * <p>Captured straight off the main render target rather than by shelling out
 * to the vanilla screenshot key, so nothing is written into the user's
 * screenshots folder and no chat message is emitted. The PNG comes back
 * base64-encoded for the MCP layer to hand to the model as an image.
 */
final class CaptureActions {
	private CaptureActions() {
	}

	static void register(Map<String, Function<JsonObject, JsonObject>> h) {
		h.put("screenshot", CaptureActions::screenshot);
	}

	private static JsonObject screenshot(JsonObject params) {
		long timeoutMs = Json.i(params, "timeoutMs", 10_000);

		Minecraft mc = Minecraft.getInstance();
		CompletableFuture<byte[]> future = new CompletableFuture<>();

		mc.execute(() -> {
			try {
				Screenshot.takeScreenshot(mc.gameRenderer.mainRenderTarget(), image -> {
					// The consumer owns the image; encode and release it here.
					try (NativeImage img = image) {
						Path tmp = Files.createTempFile("mcmcp-shot-", ".png");
						try {
							img.writeToFile(tmp);
							future.complete(Files.readAllBytes(tmp));
						} finally {
							Files.deleteIfExists(tmp);
						}
					} catch (Throwable t) {
						future.completeExceptionally(t);
					}
				});
			} catch (Throwable t) {
				future.completeExceptionally(t);
			}
		});

		byte[] png;
		try {
			png = future.get(timeoutMs, TimeUnit.MILLISECONDS);
		} catch (Exception e) {
			Throwable cause = e.getCause() == null ? e : e.getCause();
			throw new RuntimeException("screenshot failed: " + cause, cause);
		}

		JsonObject o = Json.ok();
		o.addProperty("format", "png");
		o.addProperty("bytes", png.length);
		o.addProperty("width", mc.getWindow().getWidth());
		o.addProperty("height", mc.getWindow().getHeight());
		o.addProperty("data", Base64.getEncoder().encodeToString(png));
		return o;
	}
}
