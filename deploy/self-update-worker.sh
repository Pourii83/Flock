#!/usr/bin/env bash
# Downloads the latest Flock release package from GitHub and installs it with the bundled
# installer. Runs as root in a transient systemd unit; keeps /etc/flock/flock.env and the database.
set -euo pipefail

TAG="${1:-}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid release tag: $TAG" >&2; exit 2; }

LOG=/var/log/flock-self-update.log
exec >>"$LOG" 2>&1
echo "[$(date -Is)] self-update to $TAG started"

REPO="${FLOCK_REPO:-Pourii83/Flock}"
BASE="https://github.com/$REPO/releases/download/$TAG"
ASSET=flock-server-linux-x64.tar.gz
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for attempt in 1 2 3; do
  if curl -fsSL --retry 2 --connect-timeout 15 "$BASE/$ASSET" -o "$TMP/$ASSET"; then break; fi
  echo "[$(date -Is)] download attempt $attempt failed"
  sleep 5
done
[ -s "$TMP/$ASSET" ] || { echo "download failed"; exit 1; }

# The release publishes a sha256 sidecar; verify it before running anything from the package.
if curl -fsSL "$BASE/$ASSET.sha256" -o "$TMP/$ASSET.sha256"; then
  (cd "$TMP" && sha256sum -c "$ASSET.sha256")
else
  echo "warning: no sha256 sidecar for $TAG"
fi

tar -xzf "$TMP/$ASSET" -C "$TMP"
chmod +x "$TMP/flock-server/install.sh" "$TMP/flock-server/uninstall.sh"
bash "$TMP/flock-server/install.sh" --yes
echo "[$(date -Is)] self-update to $TAG finished; VERSION: $(head -1 /opt/flock/VERSION 2>/dev/null || echo unknown)"
