package dev.mcmcp.bridge.actions;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Small scheduler for actions that inherently span several client ticks —
 * breaking a block, turning to face something, waiting for a screen.
 *
 * <p>An HTTP worker submits a job and blocks on its future while the job itself
 * runs on the client thread, one step per tick.
 */
final class TickJobs {
	/** A job returns a completed value, or null to keep running next tick. */
	interface Job<T> {
		T step(Minecraft client, int tickIndex) throws Exception;
	}

	private static final List<Runnable> STEPPERS = new CopyOnWriteArrayList<>();
	private static boolean installed;

	private TickJobs() {
	}

	static synchronized void install() {
		if (installed) return;
		installed = true;
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			for (Runnable step : STEPPERS) {
				step.run();
			}
		});
	}

	/**
	 * Runs {@code job} once per client tick until it yields a non-null value or
	 * {@code timeoutMs} elapses.
	 *
	 * @return the job's value, or {@code null} on timeout
	 */
	static <T> T await(Job<T> job, long timeoutMs) {
		install();
		CompletableFuture<T> future = new CompletableFuture<>();
		int[] tick = {0};
		Runnable[] holder = new Runnable[1];

		holder[0] = () -> {
			if (future.isDone()) {
				STEPPERS.remove(holder[0]);
				return;
			}
			try {
				T value = job.step(Minecraft.getInstance(), tick[0]++);
				if (value != null) {
					STEPPERS.remove(holder[0]);
					future.complete(value);
				}
			} catch (Throwable t) {
				STEPPERS.remove(holder[0]);
				future.completeExceptionally(t);
			}
		};
		STEPPERS.add(holder[0]);

		try {
			return future.get(timeoutMs, TimeUnit.MILLISECONDS);
		} catch (TimeoutException e) {
			STEPPERS.remove(holder[0]);
			future.cancel(true);
			return null;
		} catch (ExecutionException e) {
			Throwable cause = e.getCause() == null ? e : e.getCause();
			if (cause instanceof RuntimeException re) throw re;
			throw new RuntimeException(cause);
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			STEPPERS.remove(holder[0]);
			throw new RuntimeException("interrupted", e);
		}
	}
}
