#!/usr/bin/env bash
# Builds a signed release APK locally with Gradle (no EAS).
#
#   scripts/build-android.sh [api-url]
#
# Needs JDK 17+ (JAVA_HOME), the Android SDK (ANDROID_HOME) and a signing properties file
# (default .private/android-signing.properties, never committed):
#   storeFile=/path/to/release.jks
#   keyAlias=...
#   storePassword=...
#   keyPassword=...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/apps/client"
API_URL="${1:-${EXPO_PUBLIC_API_URL:-https://flock.ezbug.ir}}"
SIGNING="${ANDROID_SIGNING:-$ROOT/.private/android-signing.properties}"
ABIS="${ANDROID_ABIS:-arm64-v8a,armeabi-v7a}"

[ -n "${JAVA_HOME:-}" ] || { echo "Set JAVA_HOME to a JDK 17+"; exit 1; }
[ -n "${ANDROID_HOME:-}" ] || { echo "Set ANDROID_HOME to the Android SDK"; exit 1; }
[ -f "$SIGNING" ] || { echo "Signing properties not found: $SIGNING"; exit 1; }
prop() { grep -E "^$1=" "$SIGNING" | cut -d= -f2-; }

cd "$CLIENT"
VERSION="$(node -p "require('./app.json').expo.version")"
echo "==> Flock $VERSION for $API_URL ($ABIS)"

# Native project from app.json (android/ is generated, not committed).
CI=1 npx expo prebuild --platform android --no-install
[ -f android/gradlew ] || { echo "Prebuild didn't produce android/"; exit 1; }
printf 'sdk.dir=%s\n' "$(echo "$ANDROID_HOME" | sed 's#\\#/#g')" > android/local.properties

# Upstream captures Android displays at 30 FPS. Capture at 60, then cap the RTP
# sender to the in-call 15/30/60 FPS choice without maintaining a native fork.
SCREEN_CAPTURE="$CLIENT/node_modules/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/ScreenCaptureController.java"
sed -i 's/private static final int DEFAULT_FPS = 30;/private static final int DEFAULT_FPS = 60;/' "$SCREEN_CAPTURE"
grep -q 'DEFAULT_FPS = 60' "$SCREEN_CAPTURE" || { echo "Could not enable 60 FPS screen capture"; exit 1; }

# Java ignores HTTPS_PROXY: hand the proxy to Gradle (Google's Maven isn't reachable everywhere).
PROXY_ARGS=()
PROXY="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"
if [ -n "$PROXY" ]; then
  HOSTPORT="${PROXY#*://}"; HOSTPORT="${HOSTPORT%%/*}"
  for scheme in http https; do
    PROXY_ARGS+=("-D$scheme.proxyHost=${HOSTPORT%:*}" "-D$scheme.proxyPort=${HOSTPORT##*:}")
  done
  PROXY_ARGS+=("-Dhttp.nonProxyHosts=localhost|127.0.0.1")
  echo "==> Using proxy $HOSTPORT"
fi

cd android
EXPO_PUBLIC_API_URL="$API_URL" NODE_ENV=production ./gradlew assembleRelease "${PROXY_ARGS[@]}" \
  --init-script "$ROOT/scripts/android-short-paths.gradle" \
  -PreactNativeArchitectures="$ABIS" \
  -Pandroid.injected.signing.store.file="$(prop storeFile)" \
  -Pandroid.injected.signing.store.password="$(prop storePassword)" \
  -Pandroid.injected.signing.key.alias="$(prop keyAlias)" \
  -Pandroid.injected.signing.key.password="$(prop keyPassword)"

mkdir -p "$ROOT/dist"
OUT="$ROOT/dist/flock-$VERSION.apk"
cp app/build/outputs/apk/release/app-release.apk "$OUT"
echo "==> Done: $OUT"
