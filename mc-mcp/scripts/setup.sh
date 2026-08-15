#!/usr/bin/env bash
# Prepares everything mc-mcp needs: Java 25, the bridge mod, Baritone, WorldEdit
# and the MCP server. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/bridge-mod"
MODS="$BRIDGE/run/mods"
MC_VERSION="26.2"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# --- Java 25 ----------------------------------------------------------------
# Minecraft 26.1 onwards requires Java 25; nothing else will start the game.
say "Checking for Java 25"
if [[ -z "${JAVA_HOME:-}" ]]; then
	for candidate in \
		"$(/usr/libexec/java_home -v 25 2>/dev/null || true)" \
		"/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home" \
		"/usr/lib/jvm/java-25-openjdk"; do
		if [[ -n "$candidate" && -x "$candidate/bin/java" ]]; then
			export JAVA_HOME="$candidate"
			break
		fi
	done
fi
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
	die "Java 25 not found. Install it with:  brew install openjdk@25"
fi
JAVA_VER="$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
say "Using $JAVA_HOME ($JAVA_VER)"
case "$JAVA_VER" in
	*'"25'*) ;;
	*) warn "expected Java 25, got: $JAVA_VER — Minecraft $MC_VERSION may refuse to start" ;;
esac

mkdir -p "$MODS"

# --- Baritone ---------------------------------------------------------------
# Upstream cabaletta/baritone has an official 26.2 branch, so nothing needs
# porting. The "api" flavour is required: ProGuard obfuscates member names in
# the standalone build, which breaks the bridge's API calls.
say "Setting up Baritone"
BARITONE_SRC="$ROOT/baritone/upstream-26.2"
if [[ ! -d "$BARITONE_SRC" ]]; then
	say "Cloning cabaletta/baritone (branch $MC_VERSION)"
	mkdir -p "$ROOT/baritone"
	git clone --depth 1 --branch "$MC_VERSION" https://github.com/cabaletta/baritone.git "$BARITONE_SRC"
fi
BARITONE_JAR="$(ls -t "$BARITONE_SRC"/dist/baritone-api-fabric-*.jar 2>/dev/null | head -1 || true)"
if [[ -z "$BARITONE_JAR" ]]; then
	say "Building Baritone (this takes a few minutes)"
	(cd "$BARITONE_SRC" && JAVA_HOME="$JAVA_HOME" ./gradlew build)
	BARITONE_JAR="$(ls -t "$BARITONE_SRC"/dist/baritone-api-fabric-*.jar | head -1)"
fi
cp "$BARITONE_JAR" "$MODS/baritone.jar"
mkdir -p "$BRIDGE/libs"
cp "$BARITONE_JAR" "$BRIDGE/libs/baritone-api.jar"
say "Baritone: $(basename "$BARITONE_JAR")"

# --- WorldEdit --------------------------------------------------------------
say "Setting up WorldEdit"
if [[ -f "$MODS/worldedit.jar" ]]; then
	say "WorldEdit already present"
else
	# Ask Modrinth for the newest Fabric build that targets this exact version,
	# rather than pinning a number that will go stale.
	WE_URL="$(curl -fsSL \
		"https://api.modrinth.com/v2/project/worldedit/version?game_versions=%5B%22$MC_VERSION%22%5D&loaders=%5B%22fabric%22%5D" \
		| python3 -c '
import json, sys
versions = json.load(sys.stdin)
if not versions:
    sys.exit("no WorldEdit build published for this Minecraft version")
primary = [f for f in versions[0]["files"] if f.get("primary")] or versions[0]["files"]
print(primary[0]["url"])
')"
	say "Downloading $WE_URL"
	curl -fsSL "$WE_URL" -o "$MODS/worldedit.jar"
fi

# --- Fabric API -------------------------------------------------------------
# The dev runtime resolves Fabric API from Gradle, so nothing to fetch here.

# --- Client options ---------------------------------------------------------
# An agent-driven client should never make noise, and it must keep ticking while
# unfocused: the agent drives it from another process, so the game window is
# almost never focused, and with vanilla's pauseOnLostFocus the client opens the
# pause menu and the singleplayer world stops ticking -- Baritone would never
# take a step. The MCP launcher re-applies both on every launch; doing it here
# as well covers plain `./gradlew runClient`.
say "Muting sound and disabling pause-on-lost-focus"
OPTIONS="$BRIDGE/run/options.txt"
mkdir -p "$(dirname "$OPTIONS")"
touch "$OPTIONS"
python3 - "$OPTIONS" <<'PY'
import sys
path = sys.argv[1]
categories = ["master", "music", "record", "weather", "block",
              "hostile", "neutral", "player", "ambient", "voice"]
forced = {f"soundCategory_{c}": "0.0" for c in categories}
forced["pauseOnLostFocus"] = "false"

with open(path, encoding="utf-8") as fh:
    lines = fh.read().splitlines()

out, seen = [], set()
for line in lines:
    key = line.split(":", 1)[0]
    if key in forced:
        out.append(f"{key}:{forced[key]}")
        seen.add(key)
    elif line.strip():
        out.append(line)
out += [f"{k}:{v}" for k, v in forced.items() if k not in seen]

with open(path, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")
PY

# --- Bridge mod -------------------------------------------------------------
say "Building the bridge mod"
(cd "$BRIDGE" && JAVA_HOME="$JAVA_HOME" ./gradlew build -q)
say "Bridge mod built: $(ls "$BRIDGE"/build/libs/*.jar | head -1)"

# --- MCP server -------------------------------------------------------------
say "Building the MCP server"
(cd "$ROOT/mcp-server" && npm install --silent && npm run build --silent)

say "Done."
cat <<EOF

Mods staged in: $MODS
$(ls -1 "$MODS")

Next:
  scripts/test-server.sh      start a local offline-mode test server
  Register the MCP server with your client (see README.md), then call mc_launch.
EOF
