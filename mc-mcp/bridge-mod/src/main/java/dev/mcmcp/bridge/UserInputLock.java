package dev.mcmcp.bridge;

/**
 * Whether real keyboard and mouse input from the person at the computer reaches
 * the game.
 *
 * <p>The client is being driven by an agent, but it is still an ordinary window
 * on someone's desktop: a stray click, a bumped key, or a mouse drag across the
 * window turns the camera, opens a menu or cancels a Baritone path mid-walk, and
 * the agent has no way to tell that happened. Locking the two GLFW callback
 * handlers out makes the run reproducible regardless of what the window
 * receives.
 *
 * <p>This does not touch the way the bridge itself acts. Bridge actions drive
 * {@code KeyMapping} down-states and call {@code Screen.mouseClicked}/{@code
 * keyPressed} directly, none of which pass through the handlers this gates, so
 * the agent keeps full control while the human is locked out.
 *
 * <p>The window manager is deliberately still in charge: closing the window,
 * moving it and switching away all keep working, so the lock can never trap
 * anyone. It is also switchable at runtime through the {@code set_input_lock}
 * action, which is how you hand control back to a human mid-session.
 */
public final class UserInputLock {
	private static volatile boolean locked;

	private UserInputLock() {
	}

	public static boolean locked() {
		return locked;
	}

	public static void set(boolean value) {
		if (locked != value) {
			McMcpBridge.LOG.info("[mc-mcp] user input is now {}",
					value ? "locked out (agent-only control)" : "accepted again");
		}
		locked = value;
	}
}
