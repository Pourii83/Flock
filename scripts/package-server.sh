#!/usr/bin/env bash
# Builds a self-contained, offline-installable Flock server package:
#   dist/flock-server-linux-<arch>.tar.gz  containing  node/ server/ web/ install.sh ...
#
# Usage: scripts/package-server.sh [x64|arm64] [version]
#   NODE_VERSION=24.x.y to pin the bundled Node.js (default: latest v24 LTS)
set -euo pipefail

ARCH="${1:-x64}"
VERSION="${2:-$(git describe --tags --always 2>/dev/null || echo dev)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"
NAME="flock-server"
STAGE="$(mktemp -d)/$NAME"
trap 'rm -rf "$(dirname "$STAGE")"' EXIT

case "$ARCH" in x64|arm64) ;; *) echo "arch must be x64 or arm64" >&2; exit 1 ;; esac

if [ -z "${NODE_VERSION:-}" ]; then
  NODE_VERSION="$(curl -fsSL https://nodejs.org/dist/index.json \
    | node -e 'const l=JSON.parse(require("fs").readFileSync(0));console.log(l.find(r=>r.version.startsWith("v24.")).version.slice(1))')"
fi
echo "==> Flock $VERSION for linux-$ARCH (Node $NODE_VERSION)"
mkdir -p "$STAGE" "$OUT"

echo "==> Building web app (PWA)"
(
  cd "$ROOT/apps/client"
  [ -d node_modules ] || npm ci
  # Stamp the exact package version into the bundle so web clients can tell when a new deploy is
  # served (including hotfix builds that keep the same numeric version).
  EXPO_PUBLIC_API_URL= EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_BUILD_VERSION="$VERSION" \
    npx expo export --platform web --clear --output-dir "$STAGE/web"
)

echo "==> Bundling server"
mkdir -p "$STAGE/server"
cp -r "$ROOT/server/src" "$ROOT/server/package.json" "$ROOT/server/package-lock.json" "$STAGE/server/"
# Dependencies are pure JavaScript, so they are portable across OS/arch.
(cd "$STAGE/server" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)

echo "==> Bundling Node.js runtime"
NODE_TGZ="node-v$NODE_VERSION-linux-$ARCH.tar.gz"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TGZ" -o "$STAGE/$NODE_TGZ"
mkdir -p "$STAGE/node/bin"
tar -xzf "$STAGE/$NODE_TGZ" -C "$STAGE" "node-v$NODE_VERSION-linux-$ARCH/bin/node" "node-v$NODE_VERSION-linux-$ARCH/LICENSE"
mv "$STAGE/node-v$NODE_VERSION-linux-$ARCH/bin/node" "$STAGE/node/bin/node"
mv "$STAGE/node-v$NODE_VERSION-linux-$ARCH/LICENSE" "$STAGE/node/LICENSE"
rm -rf "$STAGE/node-v$NODE_VERSION-linux-$ARCH" "$STAGE/$NODE_TGZ"
chmod +x "$STAGE/node/bin/node"

echo "==> Adding installer"
cp "$ROOT/deploy/install.sh" "$ROOT/deploy/uninstall.sh" "$ROOT/deploy/flock.service" "$ROOT/deploy/flock.env.example" "$STAGE/"
cp "$ROOT/deploy/INSTALL.md" "$STAGE/INSTALL.md"
cp "$ROOT/LICENSE" "$STAGE/LICENSE"
chmod +x "$STAGE/install.sh" "$STAGE/uninstall.sh"
printf '%s\n' "$VERSION" > "$STAGE/VERSION"
printf 'node=%s\narch=linux-%s\n' "$NODE_VERSION" "$ARCH" >> "$STAGE/VERSION"

# Changelog of this build, shown by the app after an update (read from /opt/flock/RELEASE_NOTES.md).
echo "==> Writing release notes"
LAST_TAG="$(git -C "$ROOT" describe --tags --abbrev=0 2>/dev/null || true)"
if [ -n "$LAST_TAG" ]; then
  git -C "$ROOT" log --oneline "$LAST_TAG..HEAD" > "$STAGE/RELEASE_NOTES.md" 2>/dev/null || true
else
  git -C "$ROOT" log --oneline -20 > "$STAGE/RELEASE_NOTES.md" 2>/dev/null || true
fi
# Built exactly on the last tag? The range is empty, so fall back to the recent commits.
[ -s "$STAGE/RELEASE_NOTES.md" ] || git -C "$ROOT" log --oneline -20 > "$STAGE/RELEASE_NOTES.md" 2>/dev/null || :

FILE="$OUT/$NAME-linux-$ARCH.tar.gz"
tar -czf "$FILE" -C "$(dirname "$STAGE")" "$NAME"
(cd "$OUT" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256")
echo "==> Done: $FILE ($(du -h "$FILE" | cut -f1))"
