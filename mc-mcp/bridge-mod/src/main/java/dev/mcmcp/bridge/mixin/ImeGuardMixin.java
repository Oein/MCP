package dev.mcmcp.bridge.mixin;

import com.mojang.blaze3d.platform.TextInputManager;
import dev.mcmcp.bridge.UserInputLock;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Stops the game from switching the system input source.
 *
 * <p>Minecraft turns the IME off whenever the player is not typing into a text
 * field, so that letter keys reach the movement controls instead of a
 * composition buffer. On macOS that is not a per-window setting: GLFW implements
 * it by selecting a Roman input source, which changes the input source for the
 * <em>whole system</em>. {@code TextInputManager.tick()} re-applies it every
 * client tick, so while an agent-driven client is running it is impossible to
 * type Korean, Japanese or Chinese anywhere on the machine — pressing the
 * language key switches back for one tick before the game overrides it again.
 *
 * <p>Window focus is deliberately <em>not</em> the condition here. The tick runs
 * regardless of focus, and hiding the window does not stop it, so keying off
 * focus leaves the behaviour intact in exactly the case that matters. Instead
 * this follows {@link UserInputLock}: if the bridge is already ignoring the
 * human's keyboard, the game has no business touching their input source
 * either. Unlock input to play by hand and vanilla IME handling comes back with
 * it — which is what you want, since letter keys then need to reach the
 * movement controls again.
 *
 * <p>{@code -Dmcmcp.imeGuard=false} disables this entirely.
 */
@Mixin(TextInputManager.class)
public class ImeGuardMixin {

	@Inject(method = "setIMEInputMode", at = @At("HEAD"), cancellable = true)
	private void mcmcp$keepSystemImeAlone(boolean enabled, CallbackInfo ci) {
		if ("false".equalsIgnoreCase(System.getProperty("mcmcp.imeGuard"))) return;
		if (UserInputLock.locked()) {
			ci.cancel();
		}
	}
}
