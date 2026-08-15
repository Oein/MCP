package dev.mcmcp.bridge;

import net.minecraft.client.Minecraft;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

/**
 * Bridges the HTTP worker threads onto the Minecraft client thread.
 *
 * <p>Every action that touches game state must go through here: the HTTP server
 * runs on its own executor, and touching {@code Minecraft} off-thread is a
 * reliable way to crash the game.
 */
public final class ClientTask {
	private ClientTask() {
	}

	/** Runs {@code work} on the client thread and waits for its result. */
	public static <T> T get(Supplier<T> work, long timeoutMs) {
		Minecraft mc = Minecraft.getInstance();
		CompletableFuture<T> future = new CompletableFuture<>();
		mc.execute(() -> {
			try {
				future.complete(work.get());
			} catch (Throwable t) {
				future.completeExceptionally(t);
			}
		});
		try {
			return future.get(timeoutMs, TimeUnit.MILLISECONDS);
		} catch (TimeoutException e) {
			throw new RuntimeException("timed out waiting for the client thread after " + timeoutMs + "ms", e);
		} catch (ExecutionException e) {
			Throwable cause = e.getCause() == null ? e : e.getCause();
			if (cause instanceof RuntimeException re) throw re;
			throw new RuntimeException(cause);
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new RuntimeException("interrupted", e);
		}
	}

	public static <T> T get(Supplier<T> work) {
		return get(work, 10_000);
	}

	/** Fire-and-forget onto the client thread. */
	public static void run(Runnable work) {
		Minecraft.getInstance().execute(work);
	}
}
