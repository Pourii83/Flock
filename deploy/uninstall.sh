#!/usr/bin/env bash
# Removes the Flock service and program files.
#   sudo /opt/flock/uninstall.sh           keeps /etc/flock and the database
#   sudo /opt/flock/uninstall.sh --purge   also deletes config, the 'flock' database and role
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }

if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
  systemctl disable --now flock >/dev/null 2>&1 || true
  systemctl disable --now flock-self-update.path >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/flock.service /etc/systemd/system/flock-self-update.path /etc/systemd/system/flock-self-update.service
  systemctl daemon-reload
fi
rm -f /etc/sudoers.d/flock-self-update # left by older releases
rm -rf /opt/flock

if [ "${1:-}" = "--purge" ]; then
  rm -rf /etc/flock
  if command -v psql >/dev/null && id postgres >/dev/null 2>&1; then
    runuser -u postgres -- psql -qc 'drop database if exists flock' >/dev/null 2>&1 || true
    runuser -u postgres -- psql -qc 'drop role if exists flock' >/dev/null 2>&1 || true
  fi
  userdel flock 2>/dev/null || true
  echo "Flock removed, including configuration and database."
else
  echo "Flock removed. Configuration (/etc/flock) and database were kept; use --purge to delete them."
fi
