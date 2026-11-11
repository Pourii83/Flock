#!/usr/bin/env bash
# Builds the web client as a standalone PWA in Vercel's Build Output API layout (.vercel/output).
# Vercel runs it as the build command of the `pwa` branch (see .github/workflows/deploy-pwa.yml).
# The server lives elsewhere, so its address is baked in here:
#   scripts/build-pwa.sh <api-url> [version]
# Only this PWA gets a server address; installed apps (Android, Windows) never read it.
set -euo pipefail

API_URL="${1:?usage: build-pwa.sh <api-url> [version]}"
VERSION="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.vercel/output"

rm -rf "$OUT"
mkdir -p "$OUT"

cd "$ROOT/apps/client"
EXPO_PUBLIC_API_URL="${API_URL%/}" EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_BUILD_VERSION="$VERSION" \
  npx expo export --platform web --clear --output-dir "$OUT/static"

# Single-page app: every path that is not a real file (/join/<code>, /meet/<code>, ...) gets index.html.
# The service worker and manifest must not be cached, or new releases reach users late.
cat > "$OUT/config.json" <<'JSON'
{
  "version": 3,
  "routes": [
    { "src": "/(sw\\.js|manifest\\.json)", "headers": { "cache-control": "no-cache" }, "continue": true },
    { "src": "/_expo/static/(.*)", "headers": { "cache-control": "public, max-age=31536000, immutable" }, "continue": true },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
JSON

echo "PWA built in $OUT (API: ${API_URL%/}, version: ${VERSION:-none})"
