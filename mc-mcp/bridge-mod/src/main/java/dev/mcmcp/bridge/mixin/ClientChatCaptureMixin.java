package dev.mcmcp.bridge.mixin;

import dev.mcmcp.bridge.ChatLog;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Records chat that a client-side mod writes straight into the HUD.
 *
 * <p>Everything the server says arrives as a packet, and Fabric's receive events
 * cover that. Client-side mods do not go through the network at all -- Baritone
 * answers {@code #help}, {@code #set} and its pathing progress by calling
 * {@link ChatComponent#addClientSystemMessage} directly. Without this, those
 * replies are on screen but invisible to the agent, so a Baritone command looks
 * like it silently did nothing even when it worked.
 */
@Mixin(ChatComponent.class)
public class ClientChatCaptureMixin {

	@Inject(method = "addClientSystemMessage", at = @At("HEAD"))
	private void mcmcp$captureClientMessage(Component message, CallbackInfo ci) {
		ChatLog.addClientMessage(message);
	}
}
