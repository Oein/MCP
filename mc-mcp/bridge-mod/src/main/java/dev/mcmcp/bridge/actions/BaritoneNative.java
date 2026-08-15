package dev.mcmcp.bridge.actions;

import baritone.api.BaritoneAPI;
import baritone.api.IBaritone;
import baritone.api.pathing.goals.Goal;
import baritone.api.pathing.goals.GoalBlock;
import baritone.api.pathing.goals.GoalNear;
import baritone.api.pathing.goals.GoalXZ;
import baritone.api.pathing.goals.GoalYLevel;
import baritone.api.process.ICustomGoalProcess;
import com.google.gson.JsonObject;

/**
 * Every direct reference to Baritone's classes lives here and nowhere else.
 *
 * <p>Class loading is lazy, so as long as callers reach this class only after
 * confirming Baritone is installed, the bridge loads cleanly without it. Any
 * method here may throw {@link NoClassDefFoundError} if that rule is broken --
 * {@link BaritoneActions} treats that as "not installed".
 */
final class BaritoneNative {
	private BaritoneNative() {
	}

	/** Set once we have wrapped Baritone's logger, so we never double-wrap it. */
	private static volatile boolean loggerCaptured;

	/**
	 * Routes Baritone's chat output into the bridge's chat log.
	 *
	 * <p>Baritone does not print through the client's message events -- it calls
	 * a {@code Consumer<Component>} held in its own settings -- so everything it
	 * says (command replies, pathing progress, failures) is on screen but
	 * invisible to a caller reading chat. That makes a working command look like
	 * one that silently did nothing.
	 *
	 * <p>Wrapping the setting rather than replacing it keeps the messages in the
	 * game's chat as well, so a human watching still sees what they expect.
	 */
	static synchronized void captureLogger() {
		if (loggerCaptured) return;
		var setting = BaritoneAPI.getSettings().logger;
		java.util.function.Consumer<net.minecraft.network.chat.Component> previous = setting.value;
		setting.value = message -> {
			try {
				dev.mcmcp.bridge.ChatLog.addClientMessage(message);
			} catch (Throwable ignored) {
				// never let logging break Baritone itself
			}
			if (previous != null) previous.accept(message);
		};
		loggerCaptured = true;
	}

	private static IBaritone baritone() {
		IBaritone b = BaritoneAPI.getProvider().getPrimaryBaritone();
		if (b == null) throw new IllegalStateException("Baritone has no primary instance yet (are you in a world?)");
		return b;
	}

	/**
	 * The goal this bridge last asked for.
	 *
	 * <p>Baritone clears the process goal as soon as pathing ends, so by the time
	 * a waiter notices "no longer busy" there is nothing left to test the player
	 * against and {@link #isAtGoal()} would answer {@code false} for a perfectly
	 * successful walk. Remembering the goal ourselves is what makes arrival
	 * detection trustworthy in both directions: arrived, and genuinely failed.
	 */
	private static volatile Goal requestedGoal;

	/** Starts pathing to a goal. Must run on the client thread. */
	static JsonObject setGoal(Goal goal) {
		ICustomGoalProcess process = baritone().getCustomGoalProcess();
		requestedGoal = goal;
		process.setGoalAndPath(goal);
		JsonObject o = new JsonObject();
		o.addProperty("goal", goal.toString());
		return o;
	}

	/** The goal Baritone is holding, or failing that the last one we asked for. */
	private static Goal effectiveGoal(IBaritone b) {
		Goal goal = b.getCustomGoalProcess().getGoal();
		if (goal == null) goal = b.getPathingBehavior().getGoal();
		if (goal == null) goal = requestedGoal;
		return goal;
	}

	static Goal goalBlock(int x, int y, int z) {
		return new GoalBlock(x, y, z);
	}

	static Goal goalNear(int x, int y, int z, int range) {
		return new GoalNear(new net.minecraft.core.BlockPos(x, y, z), range);
	}

	static Goal goalXZ(int x, int z) {
		return new GoalXZ(x, z);
	}

	static Goal goalY(int y) {
		return new GoalYLevel(y);
	}

	/** True while Baritone is calculating or walking a path. */
	static boolean isBusy() {
		IBaritone b = baritone();
		return b.getPathingBehavior().isPathing() || b.getCustomGoalProcess().isActive();
	}

	/** Whether the player currently satisfies the goal. */
	static boolean isAtGoal() {
		IBaritone b = baritone();
		Goal goal = effectiveGoal(b);
		if (goal == null) return false;
		return goal.isInGoal(b.getPlayerContext().playerFeet());
	}

	static String goalDescription() {
		Goal goal = effectiveGoal(baritone());
		return goal == null ? null : goal.toString();
	}

	/** Estimated ticks to the goal, or -1 when Baritone will not say. */
	static double estimatedTicks() {
		return baritone().getPathingBehavior().estimatedTicksToGoal().orElse(-1.0);
	}

	static void cancel() {
		// Drop the remembered goal too, so a cancelled walk cannot later be
		// reported as an arrival just because the player happens to stand there.
		requestedGoal = null;
		baritone().getPathingBehavior().cancelEverything();
	}
}
