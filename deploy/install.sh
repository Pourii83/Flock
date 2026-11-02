#!/usr/bin/env bash
# Flock server installer for Linux (no Docker needed).
#
# Online (downloads the latest release from GitHub):
#   curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
#
# Offline (from a downloaded package):
#   tar -xzf flock-server-linux-x64.tar.gz && sudo ./flock-server/install.sh
#   # or: sudo ./install.sh --package /path/to/flock-server-linux-x64.tar.gz
#
# Options:
#   --package FILE    install from a local package (offline)
#   --version TAG     release tag to download (default: latest)
#   --port N          HTTP port (default 4000; only used on first install)
#   --db-url URL      use an existing PostgreSQL database instead of a local one
#   --no-start        install but don't start the service
#
# Re-running the installer upgrades Flock and keeps /etc/flock/flock.env and the database.
# Private repository? Export GITHUB_TOKEN=<token with repo read access> before running.
set -euo pipefail

REPO="${FLOCK_REPO:-Pourii83/Flock}"
PREFIX=/opt/flock
CONF_DIR=/etc/flock
ENV_FILE=$CONF_DIR/flock.env
SERVICE=flock
PACKAGE=""
VERSION="latest"
PORT=4000
DB_URL=""
START=1

info() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --package) PACKAGE="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --db-url) DB_URL="$2"; shift 2 ;;
    --no-start) START=0; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."
[ "$(uname -s)" = "Linux" ] || die "Only Linux is supported."

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "Unsupported CPU architecture: $(uname -m)" ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

random() { head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c "${1:-48}"; }

# ---------- 1. locate the package ----------

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo /nonexistent)"
if [ -z "$PACKAGE" ] && [ -f "$SELF_DIR/node/bin/node" ] && [ -d "$SELF_DIR/server" ]; then
  SRC="$SELF_DIR"
  info "Installing from extracted package at $SRC (offline)"
elif [ -n "$PACKAGE" ]; then
  [ -f "$PACKAGE" ] || die "Package not found: $PACKAGE"
  info "Extracting $PACKAGE (offline)"
  tar -xzf "$PACKAGE" -C "$WORK"
  SRC="$WORK/flock-server"
else
  ASSET="flock-server-linux-$ARCH.tar.gz"
  command -v curl >/dev/null || die "curl is required for online install (or use --package for offline)."
  info "Downloading $ASSET ($VERSION) from github.com/$REPO"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    # Private repository: resolve the asset through the API.
    API="https://api.github.com/repos/$REPO/releases/$([ "$VERSION" = latest ] && echo latest || echo "tags/$VERSION")"
    ASSET_URL="$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" "$API" | tr -d '\n' \
      | grep -o "\"url\": *\"[^\"]*/releases/assets/[0-9]*\"[^}]*\"name\": *\"$ASSET\"" | head -1 | sed 's/.*"url": *"\([^"]*\)".*/\1/')"
    [ -n "$ASSET_URL" ] || die "Release asset $ASSET not found in $REPO ($VERSION)."
    curl -fSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" "$ASSET_URL" -o "$WORK/$ASSET"
  else
    if [ "$VERSION" = latest ]; then URL="https://github.com/$REPO/releases/latest/download/$ASSET"
    else URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"; fi
    curl -fSL "$URL" -o "$WORK/$ASSET" || die "Download failed. Private repo? Set GITHUB_TOKEN, or use --package."
  fi
  tar -xzf "$WORK/$ASSET" -C "$WORK"
  SRC="$WORK/flock-server"
fi
[ -f "$SRC/node/bin/node" ] || die "Invalid package: node runtime missing."
# Packages built on Windows lose the executable bit.
chmod 755 "$SRC/node/bin/node" 2>/dev/null || true
"$SRC/node/bin/node" -e 'process.exit(0)' 2>/dev/null || die "Bundled Node.js can't run here (wrong architecture or glibc too old)."
ok "Package $(head -1 "$SRC/VERSION" 2>/dev/null || echo unknown) for linux-$ARCH"

# ---------- 2. PostgreSQL ----------

cd /  # psql (run as postgres) warns when it cannot read the current directory

pg_installed() {
  command -v psql >/dev/null 2>&1 || return 1
  local f
  for f in /usr/lib/postgresql/*/bin/postgres /usr/bin/postgres /usr/pgsql-*/bin/postgres; do
    [ -x "$f" ] && return 0
  done
  return 1
}

install_postgres() {
  info "Installing PostgreSQL"
  if command -v apt-get >/dev/null; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
  elif command -v dnf >/dev/null || command -v yum >/dev/null; then
    PM="$(command -v dnf || command -v yum)"
    "$PM" install -y -q postgresql-server postgresql >/dev/null
    [ -f /var/lib/pgsql/data/PG_VERSION ] || postgresql-setup --initdb >/dev/null
  else
    die "Couldn't install PostgreSQL automatically. Install it, or pass --db-url."
  fi
}

start_postgres() {
  if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    systemctl enable --now postgresql >/dev/null 2>&1 || true
  elif command -v pg_ctlcluster >/dev/null; then
    for c in /etc/postgresql/*/main; do v="$(basename "$(dirname "$c")")"; pg_ctlcluster "$v" main start 2>/dev/null || true; done
  elif command -v service >/dev/null; then
    service postgresql start >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 30); do runuser -u postgres -- psql -qtAc 'select 1' >/dev/null 2>&1 && return 0; sleep 1; done
  die "PostgreSQL did not start."
}

# Red Hat family defaults to "ident" for TCP logins; Flock connects with a password.
allow_password_auth() {
  HBA="$(runuser -u postgres -- psql -qtAc 'show hba_file' 2>/dev/null || true)"
  if [ -n "$HBA" ] && grep -Eq '^host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+ident' "$HBA"; then
    sed -i -E 's/^(host\s+all\s+all\s+(127\.0\.0\.1\/32|::1\/128)\s+)ident/\1scram-sha-256/' "$HBA"
    runuser -u postgres -- psql -qtAc 'select pg_reload_conf()' >/dev/null
  fi
}

if [ -f "$ENV_FILE" ]; then
  ok "Keeping existing configuration in $ENV_FILE"
elif [ -n "$DB_URL" ]; then
  ok "Using external database"
else
  pg_installed || install_postgres
  start_postgres
  allow_password_auth
  DB_PASS="$(random 32)"
  if runuser -u postgres -- psql -qtAc "select 1 from pg_roles where rolname='flock'" | grep -q 1; then
    runuser -u postgres -- psql -qc "set password_encryption = 'scram-sha-256'; alter role flock with login password '$DB_PASS'" >/dev/null
  else
    runuser -u postgres -- psql -qc "set password_encryption = 'scram-sha-256'; create role flock with login password '$DB_PASS'" >/dev/null
  fi
  if ! runuser -u postgres -- psql -qtAc "select 1 from pg_database where datname='flock'" | grep -q 1; then
    runuser -u postgres -- psql -qc "create database flock owner flock" >/dev/null
  fi
  DB_URL="postgres://flock:$DB_PASS@127.0.0.1:5432/flock"
  ok "PostgreSQL database 'flock' ready"
fi

# ---------- 3. files, user, config ----------

info "Installing to $PREFIX"
id flock >/dev/null 2>&1 || useradd --system --home-dir "$PREFIX" --shell /usr/sbin/nologin flock 2>/dev/null \
  || useradd -r -d "$PREFIX" -s /sbin/nologin flock
mkdir -p "$PREFIX" "$CONF_DIR"
for d in node server web; do
  rm -rf "${PREFIX:?}/$d.new"
  cp -r "$SRC/$d" "$PREFIX/$d.new"
  rm -rf "${PREFIX:?}/$d"
  mv "$PREFIX/$d.new" "$PREFIX/$d"
done
cp "$SRC/VERSION" "$SRC/uninstall.sh" "$PREFIX/" 2>/dev/null || true
chown -R root:root "$PREFIX"
chmod -R a+rX "$PREFIX"
chmod 755 "$PREFIX/node/bin/node" "$PREFIX/uninstall.sh" 2>/dev/null || true

if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat > "$ENV_FILE" <<CONF
# Flock server configuration. Restart after editing: systemctl restart flock
PORT=$PORT
HOST=0.0.0.0
DATABASE_URL=$DB_URL
JWT_SECRET=$(random 64)
WEB_DIR=$PREFIX/web
CORS_ORIGIN=*
CONF
  chown root:flock "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  ok "Wrote $ENV_FILE"
fi
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"

# ---------- 4. service ----------

if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
  cp "$SRC/flock.service" /etc/systemd/system/$SERVICE.service
  systemctl daemon-reload
  systemctl enable $SERVICE >/dev/null 2>&1
  if [ "$START" -eq 1 ]; then
    systemctl restart $SERVICE
    info "Waiting for Flock to start"
    for _ in $(seq 1 30); do
      if "$PREFIX/node/bin/node" -e "fetch('http://127.0.0.1:$PORT/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; then
        break
      fi
      sleep 1
    done
    systemctl is-active --quiet $SERVICE || die "Service failed to start. See: journalctl -u $SERVICE -n 50"
    ok "Service '$SERVICE' is running"
  fi
else
  info "systemd not found — start Flock manually:"
  echo "  sudo -u flock env \$(grep -v '^#' $ENV_FILE | xargs) $PREFIX/node/bin/node $PREFIX/server/src/index.js"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
ok "Flock is installed."
echo "   Web app:     http://${IP:-<server-ip>}:$PORT"
echo "   Mobile/desktop apps: use server address http://${IP:-<server-ip>}:$PORT"
echo "   Config:      $ENV_FILE"
echo "   Logs:        journalctl -u $SERVICE -f"
echo "   Uninstall:   sudo $PREFIX/uninstall.sh"
echo "   Tip: put it behind HTTPS (e.g. Caddy or nginx) for production."
