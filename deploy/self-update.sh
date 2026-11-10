#!/usr/bin/env bash
# Root helper for the admin "Update server" button. Invoked as:
#   sudo -n /opt/flock/self-update.sh v1.9.1
# The Flock service runs as the unprivileged 'flock' user; a single sudoers rule allows it to run
# only this script. The real work goes to a transient systemd unit so restarting the Flock service
# (which the installer does) can never kill the updater halfway.
set -euo pipefail

TAG="${1:-}"
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release tag" >&2
  exit 2
fi

exec systemd-run --unit=flock-self-update --collect --no-block \
  --description="Flock self-update to $TAG" \
  /opt/flock/self-update-worker.sh "$TAG"
