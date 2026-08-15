#!/usr/bin/env bash
# mcapi.sh — inspect the real (unobfuscated) Minecraft 26.2 API.
#   mcapi.sh find <regex>      : list class names matching regex
#   mcapi.sh sig <class>       : javap public signatures of a class (slash or dot separated)
export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@25)/libexec/openjdk.jdk/Contents/Home}"
JAR="$HOME/.gradle/caches/fabric-loom/26.2/minecraft-client.jar"
case "$1" in
  find) unzip -l "$JAR" | grep -oE '[a-zA-Z0-9/$_]+\.class' | sed 's/\.class$//' | grep -iE "$2" | sort ;;
  sig)  "$JAVA_HOME/bin/javap" -classpath "$JAR" "$(echo "$2" | tr '/' '.')" ;;
  *) echo "usage: mcapi.sh find <regex> | sig <class>"; exit 1 ;;
esac
