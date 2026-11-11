#!/usr/bin/env bash
# Downloads the requested Flock release package from GitHub and installs it with the bundled
# installer. Runs as root from flock-self-update.service, which systemd starts when the Flock server
# (running unprivileged, hardened with NoNewPrivileges) drops a request file:
#   /var/lib/flock/self-update-request   -> one line: the release tag, e.g. v1.10.2
# The file is the only thing the service user controls; the tag is validated here again.
# Keeps /etc/flock/flock.env and the database.
set -euo pipefail

REQUEST=/var/lib/flock/self-update-request
LOG=/var/log/flock-self-update.log
exec >>"$LOG" 2>&1

[ -f "$REQUEST" ] && [ ! -L "$REQUEST" ] || { echo "[$(date -Is)] no update request"; rm -f "$REQUEST"; exit 0; }
TAG="$(head -c 200 "$REQUEST" | sed -n 1p | tr -d '[:space:]')"
REQUESTED_REPO="$(head -c 200 "$REQUEST" | sed -n 2p | tr -d '[:space:]')"
rm -f "$REQUEST" # consume first: a failed update must not retrigger in a loop

echo "[$(date -Is)] self-update to $TAG requested"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid release tag: $TAG"; exit 2; }

# Never go backwards or reinstall the same release.
CURRENT="$(head -1 /opt/flock/VERSION 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)*' | head -1 || true)"
if [ -n "$CURRENT" ] && [ "$(printf '%s\n%s\n' "${TAG#v}" "$CURRENT" | sort -V | tail -1)" != "${TAG#v}" -o "${TAG#v}" = "$CURRENT" ]; then
  echo "Release $TAG is not newer than the installed $CURRENT; nothing to do"
  exit 0
fi

# The repository comes with the request (the admin's mirror, or the main one); it is validated here.
REPO="$REQUESTED_REPO"
[ -n "$REPO" ] || REPO="${FLOCK_REPO:-}"
[ -n "$REPO" ] || REPO="$(grep -E '^FLOCK_REPO=' /etc/flock/flock.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' " || true)"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || REPO=Pourii83/Flock
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

# The release must publish a sha256 sidecar; without a verified checksum nothing is installed.
curl -fsSL --retry 2 --connect-timeout 15 "$BASE/$ASSET.sha256" -o "$TMP/$ASSET.sha256" \
  || { echo "no sha256 sidecar for $TAG: refusing to install"; exit 1; }
(cd "$TMP" && sha256sum -c "$ASSET.sha256") || { echo "checksum mismatch: refusing to install"; exit 1; }

tar -xzf "$TMP/$ASSET" -C "$TMP"
chmod +x "$TMP/flock-server/install.sh" "$TMP/flock-server/uninstall.sh"
bash "$TMP/flock-server/install.sh" --yes
echo "[$(date -Is)] self-update to $TAG finished; VERSION: $(head -1 /opt/flock/VERSION 2>/dev/null || echo unknown)"
