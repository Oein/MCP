package dev.mcmcp.bridge.mixin;

import dev.mcmcp.bridge.UserInputLock;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.CharacterEvent;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Drops real user input while the input lock is on. See {@link UserInputLock}.
 *
 * <p>These five methods are the GLFW callbacks themselves -- everything the OS
 * delivers enters the game through them and nothing else does, so cancelling at
 * their head is both complete and surgical. In particular the bridge's own
 * synthetic input does not pass through here, so an agent's clicks and key
 * presses are unaffected.
 */
public final class UserInputMixin {
	private UserInputMixin() {
	}

	@Mixin(MouseHandler.class)
	public static class Mouse {
		@Inject(method = "onButton", at = @At("HEAD"), cancellable = true)
		private void mcmcp$blockButton(long window, MouseButtonInfo button, int action, CallbackInfo ci) {
			if (UserInputLock.locked()) ci.cancel();
		}

		@Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
		private void mcmcp$blockScroll(long window, double dx, double dy, CallbackInfo ci) {
			if (UserInputLock.locked()) ci.cancel();
		}

		@Inject(method = "onMove", at = @At("HEAD"), cancellable = true)
		private void mcmcp$blockMove(long window, double x, double y, CallbackInfo ci) {
			if (UserInputLock.locked()) ci.cancel();
		}
	}

	@Mixin(net.minecraft.client.KeyboardHandler.class)
	public static class Keyboard {
		@Inject(method = "keyPress", at = @At("HEAD"), cancellable = true)
		private void mcmcp$blockKey(long window, int action, KeyEvent event, CallbackInfo ci) {
			if (UserInputLock.locked()) ci.cancel();
		}

		@Inject(method = "charTyped", at = @At("HEAD"), cancellable = true)
		private void mcmcp$blockChar(long window, CharacterEvent event, CallbackInfo ci) {
			if (UserInputLock.locked()) ci.cancel();
		}
	}
}
