package dev.mcmcp.bridge.mixin;

import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/**
 * Headless mode: keeps the game window off screen instead of showing it.
 *
 * <p>Minecraft already creates its GLFW window hidden -- {@code
 * Window.createGlfwWindow} passes {@code glfwWindowHint(GLFW_VISIBLE, false)}
 * itself -- and then reveals it with a single {@code glfwShowWindow} call near
 * the end of the {@code Minecraft} constructor. That call is therefore the only
 * thing that has to be suppressed; setting visibility hints beforehand
 * accomplishes nothing, because the game overwrites them immediately before
 * creating the window.
 *
 * <p>The window and its GL context still exist, so the game renders normally and
 * screenshots keep working -- it simply never appears on screen. That matters
 * because a genuinely render-less client could not satisfy the "look at what you
 * built" half of this project.
 *
 * <p>Enable with {@code -Dmcmcp.headless=true}.
 */
@Mixin(Minecraft.class)
public class HeadlessWindowMixin {
	private static final Logger LOG = LoggerFactory.getLogger("mcmcp-bridge/headless");

	@Redirect(
			method = "<init>",
			at = @At(value = "INVOKE", target = "Lorg/lwjgl/glfw/GLFW;glfwShowWindow(J)V"))
	private void mcmcp$maybeShowWindow(long handle) {
		if (Boolean.getBoolean("mcmcp.headless")) {
			LOG.info("[mc-mcp] headless mode: leaving the game window hidden");
			return;
		}

		// Show the window without activating it.
		//
		// An agent-launched client appears while the person is typing somewhere
		// else, and a window that takes focus takes the keyboard with it. On
		// macOS that also switches the system input source to the newly active
		// app, which drops whatever an IME (Korean, Japanese, Chinese) was
		// composing and leaves input broken in the app the user was actually
		// using. The game does not need focus to run -- the bridge drives it
		// through code, not the keyboard -- so the window is mapped unfocused and
		// only comes forward if the user clicks it.
		//
		// Set -Dmcmcp.focusOnLaunch=true to get vanilla's focus-stealing back.
		if (!Boolean.getBoolean("mcmcp.focusOnLaunch")) {
			GLFW.glfwSetWindowAttrib(handle, GLFW.GLFW_FOCUS_ON_SHOW, GLFW.GLFW_FALSE);
			LOG.info("[mc-mcp] showing the game window without stealing focus");
		}
		GLFW.glfwShowWindow(handle);
	}
}
