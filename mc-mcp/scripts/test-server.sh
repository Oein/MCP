#!/usr/bin/env bash
# Starts a local Minecraft 26.2 server in offline mode for the agent to play on.
#
# Offline mode is deliberate and is what the bridge's connection policy expects:
# the agent runs an unauthenticated account, so it can only ever join a server
# like this one. Do not expose this server to the internet -- offline mode means
# anyone can join as anyone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/test-server"
MC_VERSION="26.2"
PORT="${PORT:-25565}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

if [[ -z "${JAVA_HOME:-}" ]]; then
	for candidate in \
		"$(/usr/libexec/java_home -v 25 2>/dev/null || true)" \
		"/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home"; do
		if [[ -n "$candidate" && -x "$candidate/bin/java" ]]; then
			export JAVA_HOME="$candidate"; break
		fi
	done
fi
[[ -x "${JAVA_HOME:-}/bin/java" ]] || die "Java 25 not found. brew install openjdk@25"

mkdir -p "$DIR"
cd "$DIR"

if [[ ! -f server.jar ]]; then
	say "Resolving the $MC_VERSION server download"
	URL="$(curl -fsSL https://launchermeta.mojang.com/mc/game/version_manifest_v2.json \
		| python3 -c "
import json, sys, urllib.request
manifest = json.load(sys.stdin)
target = next((v for v in manifest['versions'] if v['id'] == '$MC_VERSION'), None)
if target is None:
    sys.exit('version $MC_VERSION not found in the manifest')
with urllib.request.urlopen(target['url']) as fh:
    meta = json.load(fh)
print(meta['downloads']['server']['url'])
")"
	say "Downloading $URL"
	curl -fsSL "$URL" -o server.jar
fi

# The EULA still has to be accepted; we surface that rather than deciding for you.
if [[ ! -f eula.txt ]]; then
	cat > eula.txt <<'EOF'
# Accepting the Minecraft EULA (https://aka.ms/MinecraftEULA) for this local test server.
eula=true
EOF
	say "Wrote eula.txt (accepting https://aka.ms/MinecraftEULA)"
fi

if [[ ! -f server.properties ]]; then
	cat > server.properties <<EOF
# Local test server for mc-mcp. Offline mode: keep this on localhost only.
online-mode=false
server-port=$PORT
server-ip=127.0.0.1
motd=mc-mcp test server
gamemode=creative
difficulty=peaceful
allow-cheats=true
spawn-protection=0
max-players=4
view-distance=8
simulation-distance=8
enable-command-block=true
sync-chunk-writes=false
level-type=minecraft\:flat
EOF
	say "Wrote server.properties (offline mode, creative, flat world, bound to 127.0.0.1)"
fi

# Op the agent's account so it can use commands and WorldEdit.
AGENT_NAME="${AGENT_NAME:-Player}"
say "Starting on 127.0.0.1:$PORT — op the agent in the console with:  op $AGENT_NAME"
exec "$JAVA_HOME/bin/java" -Xmx2G -XX:+UseG1GC -jar server.jar nogui
