#!/usr/bin/env bash
# Flock server installer and manager for Linux (no Docker needed).
#
# Online (downloads the latest release from GitHub):
#   curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
#
# Offline (from a downloaded package):
#   tar -xzf flock-server-linux-x64.tar.gz && sudo ./flock-server/install.sh
#   # or: sudo ./install.sh --package /path/to/flock-server-linux-x64.tar.gz
#
# Once installed, the same script is the `flockctl` command. Run it with no arguments for a menu,
# or give a command:
#   sudo flockctl install | update | status | restart | logs | admin | mirrors | uninstall
#
# Options:
#   --package FILE    install from a local package (offline)
#   --version TAG     release tag to download (default: latest)
#   --port N          HTTP port (default 4000; only used on first install)
#   --db-url URL      use an existing PostgreSQL database instead of a local one
#   --no-start        install but don't start the service
#   --domain NAME     serve Flock on https://NAME via Nginx + Let's Encrypt (certbot)
#                     (DNS must point here and ports 80/443 must be reachable)
#   --email ADDR      email for Let's Encrypt expiry notices (optional)
#   --turn            also install a TURN relay (coturn) so calls work across different networks
#   --upload-mb N     largest file people can send, in MB (default 100)
#   --retention-days N  keep sent files this many days (default 7)
#   --admin NAME      admin account to create (default: admin; asked when interactive)
#   --no-admin        don't create an admin account
#   --github-mirror URL  prefix for github.com downloads (proxy style); empty = default
#   --apt-mirror URL  Ubuntu/Debian package mirror; empty = default (original sources restored)
#   --reset-mirrors   put both mirrors back to the defaults
#   --purge           with uninstall: also delete the database, uploaded files and settings
#   --yes             don't ask questions; use the options and defaults
#
# On a first install the script asks for these settings when it runs in a terminal (also when
# piped from curl): release, domain and certificate email, port, upload limit, retention, open
# sign-up, TURN relay, an existing database, starting the service and the admin account. It shows a
# summary to confirm before installing, and creates the admin account at the end. Passwords are
# stored as bcrypt hashes.
#
# Re-running the installer (or `flockctl update`) upgrades Flock and keeps /etc/flock/flock.env and the database.
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
DOMAIN=""
EMAIL=""
WITH_TURN=0
HTTPS_OK=0
UPLOAD_MB=100
RETENTION=7
OPEN_SIGNUP=1
ADMIN_USER=""
ADMIN_PASS=""
ADMIN_GENERATED=0
NO_ADMIN=0
ASSUME_YES=0
CLI=flockctl
MIRRORS_FILE=$CONF_DIR/mirrors.conf
GITHUB_MIRROR="$(grep -E '^GITHUB_MIRROR=' "$MIRRORS_FILE" 2>/dev/null | cut -d= -f2- || true)"
APT_MIRROR="$(grep -E '^APT_MIRROR=' "$MIRRORS_FILE" 2>/dev/null | cut -d= -f2- || true)"
PURGE=0
VERSION_PASSED=0
MIRROR_ACTION=""
MIRROR_VALUE=""
CMD=""
case "${1:-}" in
  install|update|upgrade|status|restart|logs|admin|mirrors|uninstall|menu) CMD="${1/upgrade/update}"; shift ;;
esac
ARGC=$#
PASSED=" "  # switches given on the command line (not asked again)

info() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --package) PACKAGE="$2"; PASSED+="package "; shift 2 ;;
    --version) VERSION="$2"; VERSION_PASSED=1; PASSED+="version "; shift 2 ;;
    --port) PORT="$2"; PASSED+="port "; shift 2 ;;
    --db-url) DB_URL="$2"; PASSED+="db "; shift 2 ;;
    --no-start) START=0; PASSED+="start "; shift ;;
    --domain) DOMAIN="$2"; PASSED+="domain "; shift 2 ;;
    --email) EMAIL="$2"; PASSED+="email "; shift 2 ;;
    --turn) WITH_TURN=1; PASSED+="turn "; shift ;;
    --upload-mb) UPLOAD_MB="$2"; shift 2 ;;
    --retention-days) RETENTION="$2"; shift 2 ;;
    --admin) ADMIN_USER="$2"; shift 2 ;;
    --no-admin) NO_ADMIN=1; PASSED+="admin "; shift ;;
    --github-mirror) MIRROR_ACTION=github; MIRROR_VALUE="${2:-}"; shift 2 ;;
    --apt-mirror) MIRROR_ACTION=apt; MIRROR_VALUE="${2:-}"; shift 2 ;;
    --reset-mirrors) MIRROR_ACTION=reset; shift ;;
    --purge) PURGE=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]:-$0}" | sed '$d'; exit 0 ;;
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

# ---------- 0. questions (first install only) ----------

FIRST_INSTALL=0
[ -f "$ENV_FILE" ] || FIRST_INSTALL=1
# Questions go to the terminal even when the script itself is piped from curl.
TTY=0
if [ "$ASSUME_YES" = 0 ] && { : </dev/tty; } 2>/dev/null; then TTY=1; fi

ask() { # ask VAR "question" default
  local ans=""
  if [ "$TTY" = 1 ]; then
    printf '\033[1;36m?\033[0m %s [%s]: ' "$2" "$3" >/dev/tty
    # End of input (Ctrl-D) would otherwise loop on a question forever.
    IFS= read -r ans </dev/tty || [ -n "$ans" ] || die "No answer given; nothing was installed."
  fi
  printf -v "$1" '%s' "${ans:-$3}"
}
ask_num() { # ask_num VAR "question" default min max
  while :; do
    ask "$1" "$2" "$3"
    local v="${!1}"
    if [[ "$v" =~ ^[0-9]+$ ]] && [ "$v" -ge "$4" ] && [ "$v" -le "$5" ]; then return; fi
    [ "$TTY" = 1 ] || die "$2: must be a number from $4 to $5"
    echo "  Enter a number from $4 to $5." >/dev/tty
  done
}
ask_yn() { # ask_yn VAR "question" y|n  → VAR=1/0
  local a
  while :; do
    ask a "$2 (y/n)" "$3"
    case "$a" in [Yy]*) printf -v "$1" 1; return ;; [Nn]*) printf -v "$1" 0; return ;; esac
    echo "  Answer y or n." >/dev/tty
  done
}


# ---------- management: flockctl menu and commands ----------

installed_version() { head -1 "$PREFIX/VERSION" 2>/dev/null || true; }
has_systemd() { command -v systemctl >/dev/null && [ -d /run/systemd/system ]; }
need_installed() { [ -f "$ENV_FILE" ] && [ -d "$PREFIX/server" ] || die "Flock isn't installed here. Run: sudo $CLI install"; }
env_get() { { grep -E "^$1=" "$ENV_FILE" 2>/dev/null || true; } | tail -1 | cut -d= -f2-; }
health() { # health PORT → 0 when the API answers
  "$PREFIX/node/bin/node" -e "fetch('http://127.0.0.1:$1/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null
}
pause() { [ "$TTY" = 1 ] || return 0; printf '\nPress Enter to go back to the menu… ' >/dev/tty; IFS= read -r _ </dev/tty || true; }

cmd_status() {
  need_installed
  local port domain conf
  port="$(env_get PORT)"
  conf="$(ls /etc/nginx/sites-available/flock.conf /etc/nginx/conf.d/flock.conf 2>/dev/null | head -1 || true)"
  domain=""
  [ -z "$conf" ] || domain="$(awk '/server_name/ {gsub(";","",$2); print $2; exit}' "$conf" || true)"
  echo
  echo "   Version:      $(installed_version)"
  if has_systemd; then echo "   Service:      $(systemctl is-active $SERVICE 2>/dev/null || true)"; fi
  echo "   Health:       $(health "${port:-4000}" && echo OK || echo "not answering on port ${port:-4000}")"
  echo "   Address:      $([ -n "$domain" ] && echo "https://$domain" || echo "http://<server-ip>:${port:-4000}")"
  echo "   TURN relay:   $([ -n "$(env_get TURN_URLS)$(env_get TURN_EXTRA_URLS)" ] && echo "$(env_get TURN_URLS) $(env_get TURN_EXTRA_URLS)" || echo none)"
  echo "   Config:       $ENV_FILE"
  echo "   GitHub mirror: ${GITHUB_MIRROR:-default}"
  echo "   Apt mirror:    ${APT_MIRROR:-default}"
}

cmd_logs() {
  need_installed
  has_systemd || die "systemd not found."
  journalctl -u $SERVICE -n 100 --no-pager
}

cmd_restart() {
  need_installed
  has_systemd || die "systemd not found."
  info "Restarting Flock"
  systemctl restart $SERVICE
  local port; port="$(env_get PORT)"
  for _ in $(seq 1 30); do health "${port:-4000}" && { ok "Flock is running"; return 0; }; sleep 1; done
  die "Flock didn't come back. See: sudo $CLI logs"
}

cmd_admin() {
  need_installed
  local user="$ADMIN_USER" pass="" again=""
  while :; do
    ask user "Admin username (an existing account is made admin and gets the new password)" "${user:-admin}"
    [[ "$user" =~ ^[a-zA-Z0-9_.]{3,24}$ ]] && break
    [ "$TTY" = 1 ] || die "Admin username must be 3–24 letters, numbers, _ or ."
    echo "  3–24 letters, numbers, _ or ." >/dev/tty
  done
  if [ "$TTY" = 1 ]; then
    while :; do
      printf '\033[1;36m?\033[0m New password (min 8 characters, empty = generate one): ' >/dev/tty
      IFS= read -rs pass </dev/tty || true; echo >/dev/tty
      [ -z "$pass" ] && break
      if [ "${#pass}" -lt 8 ]; then echo "  At least 8 characters." >/dev/tty; continue; fi
      printf '\033[1;36m?\033[0m Repeat the password: ' >/dev/tty
      IFS= read -rs again </dev/tty || true; echo >/dev/tty
      [ "$again" = "$pass" ] && break
      echo "  The passwords don't match." >/dev/tty
    done
  fi
  local generated=0
  [ -n "$pass" ] || { pass="$(random 20)"; generated=1; }
  # The password goes through stdin (never on a command line) and is stored as a bcrypt hash.
  printf '%s\n' "$pass" | runuser -u flock -- env $(grep -Ev '^\s*(#|$)' "$ENV_FILE" | xargs) \
    "$PREFIX/node/bin/node" "$PREFIX/server/src/create-admin.js" "$user" "Admin" >/dev/null \
    || die "Couldn't update the admin account."
  ok "Admin '$user' is ready"
  [ "$generated" = 1 ] && echo "   Password: $pass   ← shown only once; save it"
  return 0
}

# --- mirrors ---------------------------------------------------------------
# GitHub mirror: a prefix put in front of github.com download links (proxy style, e.g.
# https://gh-proxy.example.com/https://github.com/...). Apt mirror: replaces the Ubuntu/Debian
# archive hosts in the apt sources; the original files are backed up and restored on reset.

APT_BACKUP=/var/backups/flock-apt
apt_files() { ls /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true; }

save_mirrors() {
  mkdir -p "$CONF_DIR"
  { echo "# Download mirrors, managed by: sudo $CLI mirrors"
    echo "GITHUB_MIRROR=$GITHUB_MIRROR"
    echo "APT_MIRROR=$APT_MIRROR"; } > "$MIRRORS_FILE"
  chmod 644 "$MIRRORS_FILE"
}

apt_restore() {
  [ -d "$APT_BACKUP" ] || return 0
  local f
  while IFS= read -r f; do cp -a "$APT_BACKUP/files$f" "$f"; done < "$APT_BACKUP/list"
  rm -rf "$APT_BACKUP"
}

apt_set_mirror() { # apt_set_mirror URL
  command -v apt-get >/dev/null || die "The apt mirror is only for Ubuntu/Debian."
  local url="${1%/}" f
  apt_restore
  mkdir -p "$APT_BACKUP"
  apt_files > "$APT_BACKUP/list"
  while IFS= read -r f; do mkdir -p "$APT_BACKUP/files$(dirname "$f")"; cp -a "$f" "$APT_BACKUP/files$f"; done < "$APT_BACKUP/list"
  while IFS= read -r f; do
    sed -i -E \
      -e "s#https?://([a-z0-9-]+\.)?archive\.ubuntu\.com/ubuntu/?#$url/#g" \
      -e "s#https?://security\.ubuntu\.com/ubuntu/?#$url/#g" \
      -e "s#https?://ports\.ubuntu\.com/ubuntu-ports/?#$url/#g" \
      -e "s#https?://deb\.debian\.org/debian/?([[:space:]]|\$)#$url/\1#g" "$f"
  done < "$APT_BACKUP/list"
}

valid_url() { [[ "$1" =~ ^https?://[^[:space:]\#]+$ ]]; }

set_github_mirror() { # value may be empty (= default)
  [ -z "$1" ] || valid_url "$1" || die "Not a URL: $1"
  GITHUB_MIRROR="$1"
  save_mirrors
  ok "GitHub mirror: ${GITHUB_MIRROR:-default}"
}

set_apt_mirror() { # value may be empty (= default)
  if [ -z "$1" ]; then
    apt_restore
    APT_MIRROR=""
    save_mirrors
    ok "Apt sources restored to the defaults"
    return 0
  fi
  valid_url "$1" || die "Not a URL: $1"
  apt_set_mirror "$1"
  APT_MIRROR="$1"
  save_mirrors
  info "Checking the apt mirror"
  # apt-get update exits 0 even when sources fail; look at what it printed instead.
  local out; out="$(apt-get update 2>&1 || true)"
  if ! printf '%s
' "$out" | grep -qE '^(Err:|E: |W: Failed)'; then ok "Apt mirror: $APT_MIRROR"
  else warn "apt-get update failed with this mirror. Check the address, or restore the defaults (sudo $CLI mirrors --reset-mirrors)."; fi
}

reset_mirrors() {
  apt_restore
  GITHUB_MIRROR=""
  APT_MIRROR=""
  save_mirrors
  ok "All mirrors are back to the defaults"
}

cmd_mirrors() {
  # Non-interactive: flockctl mirrors --github-mirror URL | --apt-mirror URL | --reset-mirrors (an empty URL means default)
  if [ "$MIRROR_ACTION" = reset ]; then reset_mirrors; return 0; fi
  if [ -n "$MIRROR_ACTION" ]; then
    case "$MIRROR_ACTION" in github) set_github_mirror "$MIRROR_VALUE" ;; apt) set_apt_mirror "$MIRROR_VALUE" ;; esac
    return 0
  fi
  [ "$TTY" = 1 ] || die "Use: $CLI mirrors --github-mirror URL | --apt-mirror URL | --reset-mirrors"
  local choice url
  while :; do
    {
      echo
      echo "  Download mirrors"
      echo "     GitHub (Flock releases): ${GITHUB_MIRROR:-default}"
      echo "     Packages (apt):          ${APT_MIRROR:-default}"
      echo
      echo "  1) Set the GitHub mirror"
      echo "  2) Set the package (apt) mirror"
      echo "  3) Restore all mirrors to the defaults"
      echo "  0) Back"
    } >/dev/tty
    ask choice "Choose" 0
    case "$choice" in
      1) ask url "Prefix for github.com links, e.g. https://gh-proxy.example.com/ (empty = default)" "$GITHUB_MIRROR"
         set_github_mirror "$url" ;;
      2) ask url "Ubuntu/Debian mirror, e.g. https://mirror.example.com/ubuntu (empty = default)" "$APT_MIRROR"
         set_apt_mirror "$url" ;;
      3) reset_mirrors ;;
      0) return 0 ;;
      *) echo "  Choose 0–3." >/dev/tty ;;
    esac
  done
}

cmd_uninstall() {
  [ -d "$PREFIX" ] || [ -f "$ENV_FILE" ] || die "Flock isn't installed here."
  local purge="$PURGE" go=1 mirrors=0
  if [ "$TTY" = 1 ]; then
    ask_yn go "Remove Flock from this server?" n
    [ "$go" = 1 ] || { echo "Nothing was removed." >/dev/tty; return 0; }
    [ "$purge" = 1 ] || ask_yn purge "Also delete all data: the database, uploaded files and settings? This can't be undone" n
    if [ -n "$APT_MIRROR" ]; then ask_yn mirrors "Restore the default apt sources?" y; fi
  fi
  info "Removing Flock"
  if has_systemd; then
    systemctl disable --now $SERVICE >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/$SERVICE.service
    systemctl daemon-reload
  fi
  # Nginx site and the coturn setup that the installer added (other sites and configs are left alone).
  if [ -f /etc/nginx/sites-available/flock.conf ] || [ -f /etc/nginx/conf.d/flock.conf ]; then
    rm -f /etc/nginx/sites-enabled/flock.conf /etc/nginx/sites-available/flock.conf /etc/nginx/conf.d/flock.conf
    has_systemd && { nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true; }
  fi
  if [ -f /etc/turnserver.conf ] && grep -q 'generated by Flock' /etc/turnserver.conf; then
    has_systemd && systemctl disable --now coturn >/dev/null 2>&1 || true
    if [ -f /etc/turnserver.conf.orig ]; then mv /etc/turnserver.conf.orig /etc/turnserver.conf; else rm -f /etc/turnserver.conf; fi
    rm -rf /etc/coturn/certs /etc/letsencrypt/renewal-hooks/deploy/flock-coturn.sh
  fi
  rm -rf "$PREFIX"
  if [ "$purge" = 1 ]; then
    if command -v psql >/dev/null && id postgres >/dev/null 2>&1; then
      runuser -u postgres -- psql -qc 'drop database if exists flock' >/dev/null 2>&1 || true
      runuser -u postgres -- psql -qc 'drop role if exists flock' >/dev/null 2>&1 || true
    fi
    rm -rf /var/lib/flock
    [ "$mirrors" = 1 ] && apt_restore
    rm -rf "$CONF_DIR"
    userdel flock 2>/dev/null || true
  elif [ "$mirrors" = 1 ]; then
    apt_restore; APT_MIRROR=""; save_mirrors
  fi
  rm -f "/usr/local/bin/$CLI"
  if [ "$purge" = 1 ]; then ok "Flock removed, with its database, files and settings."
  else ok "Flock removed. The database, uploaded files (/var/lib/flock) and settings ($CONF_DIR) were kept; reinstalling picks them up."; fi
}

# Installs this script as the `flockctl` command (from this file, or the package's copy when piped from curl).
install_cli() {
  local from="" self="${BASH_SOURCE[0]:-}"
  if [ -n "$self" ] && [ -f "$self" ] && grep -q 'Flock server installer' "$self"; then from="$self"
  elif [ -f "${SRC:-}/install.sh" ]; then from="$SRC/install.sh"; fi
  [ -n "$from" ] || return 0
  [ "$(readlink -f "$from")" = "/usr/local/bin/$CLI" ] && return 0
  # A new file, then a rename: a running flockctl keeps reading its old copy safely.
  install -m 755 "$from" "/usr/local/bin/$CLI.new" && mv -f "/usr/local/bin/$CLI.new" "/usr/local/bin/$CLI"
}

menu() {
  local choice v
  while :; do
    v="$(installed_version)"
    {
      echo
      printf '\033[1m  Flock server manager\033[0m  %s\n' "$([ -n "$v" ] && echo "(installed: $v)" || echo "(not installed)")"
      echo
      echo "  1) Install"
      echo "  2) Update"
      echo "  3) Status"
      echo "  4) Restart"
      echo "  5) Logs"
      echo "  6) Reset an admin password"
      echo "  7) Download mirrors"
      echo "  8) Uninstall"
      echo "  0) Exit"
    } >/dev/tty
    ask choice "Choose" 0
    case "$choice" in
      1) if [ -n "$v" ]; then echo "  Flock $v is already installed. Choose 2 to update it." >/dev/tty; continue; fi
         CMD=install; return ;;
      2) if [ -z "$v" ]; then echo "  Flock isn't installed yet. Choose 1." >/dev/tty; continue; fi
         CMD=update; return ;;
      3) ( cmd_status ) || true; pause ;;
      4) ( cmd_restart ) || true; pause ;;
      5) ( cmd_logs ) || true; pause ;;
      6) ( cmd_admin ) || true; pause ;;
      7) ( cmd_mirrors ) || true ;;
      8) cmd_uninstall; exit 0 ;;
      0) exit 0 ;;
      *) echo "  Choose 0–8." >/dev/tty ;;
    esac
  done
}

# Mirrors passed as options apply to every command (and are saved for the next run).
if [ -n "$MIRROR_ACTION" ] && [ "$CMD" != mirrors ] && [ "$CMD" != uninstall ]; then cmd_mirrors; fi

[ -z "$CMD" ] && { if [ "$TTY" = 1 ] && [ "$ARGC" = 0 ]; then CMD=menu; else CMD=install; fi; }
[ "$CMD" = menu ] && menu
case "$CMD" in
  status) cmd_status; exit 0 ;;
  logs) cmd_logs; exit 0 ;;
  restart) cmd_restart; exit 0 ;;
  admin) cmd_admin; exit 0 ;;
  mirrors) cmd_mirrors; exit 0 ;;
  uninstall) cmd_uninstall; exit 0 ;;
  update)
    need_installed
    if [ "$TTY" = 1 ] && [ "$VERSION_PASSED" = 0 ] && [ -z "$PACKAGE" ]; then ask VERSION "Release to install" "$VERSION"; fi ;;
  install) ;;
esac

passed() { [[ "$PASSED" == *" $1 "* ]]; }
# Already running from an extracted package (offline)? Then there's nothing to download.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo /nonexistent)"
FROM_PACKAGE=0
[ -f "$HERE/node/bin/node" ] && [ -d "$HERE/server" ] && FROM_PACKAGE=1

# Every option can be answered here instead of passed; options given on the command line aren't asked.
if [ "$FIRST_INSTALL" = 1 ] && [ "$TTY" = 1 ]; then
  info "A few questions — press Enter to keep the value in [brackets]"
  if [ "$FROM_PACKAGE" = 0 ] && ! passed package && ! passed version; then
    ask PACKAGE "Package file for an offline install, e.g. /root/flock-server-linux-$ARCH.tar.gz (empty = download from GitHub)" ""
    if [ -z "$PACKAGE" ]; then ask VERSION "Release to install, e.g. v1.7.2" "$VERSION"; fi
  fi
  if ! passed domain; then ask DOMAIN "Domain for HTTPS, e.g. chat.example.com (empty = no domain, use the IP)" ""; fi
  if [ -n "$DOMAIN" ] && ! passed email; then ask EMAIL "Email for certificate expiry notices (optional)" ""; fi
  if ! passed port; then
    if [ -n "$DOMAIN" ]; then ask_num PORT "Internal port for Flock (Nginx forwards HTTPS to it)" "$PORT" 1 65535
    else ask_num PORT "Port for Flock" "$PORT" 1 65535; fi
  fi
  ask_num UPLOAD_MB "Largest file people can send, in MB" "$UPLOAD_MB" 1 4096
  ask_num RETENTION "Keep sent files for how many days" "$RETENTION" 1 365
  ask_yn OPEN_SIGNUP "Let anyone who reaches the server sign up?" y
  if ! passed turn; then
    ask_yn WITH_TURN "Install a TURN relay (coturn) so calls work between different networks? Needs ports 3478, 5349 and 49160-49200/udp open" y
  fi
  if ! passed db; then
    ask DB_URL "Existing PostgreSQL URL, e.g. postgres://user:pass@host:5432/flock (empty = install PostgreSQL here)" ""
  fi
  if ! passed start; then ask_yn START "Start Flock when the install finishes?" y; fi
  if ! passed admin && [ -z "$ADMIN_USER" ]; then
    ask_yn MAKE_ADMIN "Create an admin account?" y
    [ "$MAKE_ADMIN" = 1 ] || NO_ADMIN=1
  fi
fi
[[ "$UPLOAD_MB" =~ ^[0-9]+$ ]] && [ "$UPLOAD_MB" -ge 1 ] && [ "$UPLOAD_MB" -le 4096 ] || die "--upload-mb must be 1–4096"
[[ "$RETENTION" =~ ^[0-9]+$ ]] && [ "$RETENTION" -ge 1 ] && [ "$RETENTION" -le 365 ] || die "--retention-days must be 1–365"

# The admin account: on a first install (or when --admin is given), created at the very end.
CREATE_ADMIN=0
if [ "$NO_ADMIN" = 0 ] && { [ "$FIRST_INSTALL" = 1 ] || [ -n "$ADMIN_USER" ]; }; then
  CREATE_ADMIN=1
  while :; do
    ask ADMIN_USER "Admin username" "${ADMIN_USER:-admin}"
    [[ "$ADMIN_USER" =~ ^[a-zA-Z0-9_.]{3,24}$ ]] && break
    [ "$TTY" = 1 ] || die "Admin username must be 3–24 letters, numbers, _ or ."
    echo "  3–24 letters, numbers, _ or ." >/dev/tty
  done
  if [ "$TTY" = 1 ]; then
    while :; do
      printf '\033[1;36m?\033[0m Admin password (min 8 characters, empty = generate one): ' >/dev/tty
      IFS= read -rs ADMIN_PASS </dev/tty || true; echo >/dev/tty
      [ -z "$ADMIN_PASS" ] && break
      if [ "${#ADMIN_PASS}" -lt 8 ]; then echo "  At least 8 characters." >/dev/tty; continue; fi
      printf '\033[1;36m?\033[0m Repeat the password: ' >/dev/tty
      IFS= read -rs again </dev/tty || true; echo >/dev/tty
      [ "$again" = "$ADMIN_PASS" ] && break
      echo "  The passwords don't match." >/dev/tty
    done
  fi
  if [ -z "$ADMIN_PASS" ]; then ADMIN_PASS="$(random 20)"; ADMIN_GENERATED=1; fi
fi

# Last look before anything is installed.
if [ "$FIRST_INSTALL" = 1 ] && [ "$TTY" = 1 ]; then
  yn() { [ "$1" = 1 ] && echo yes || echo no; }
  {
    echo
    if [ "$FROM_PACKAGE" = 1 ]; then echo "   Install from: this package (offline)"
    elif [ -n "$PACKAGE" ]; then echo "   Install from: $PACKAGE (offline)"
    else echo "   Install from: GitHub, release $VERSION"; fi
    echo "   Address:      $([ -n "$DOMAIN" ] && echo "https://$DOMAIN" || echo "http://<server-ip>:$PORT")"
    [ -n "$DOMAIN" ] && echo "   Cert email:   ${EMAIL:-none}"
    echo "   Uploads:      up to $UPLOAD_MB MB, kept $RETENTION days"
    echo "   Open sign-up: $(yn "$OPEN_SIGNUP")"
    echo "   TURN relay:   $(yn "$WITH_TURN")"
    if [ -n "$DB_URL" ]; then echo "   Database:     existing, $(printf '%s' "$DB_URL" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#')"
    else echo "   Database:     install PostgreSQL here"; fi
    echo "   Admin:        $([ "$CREATE_ADMIN" = 1 ] && echo "$ADMIN_USER" || echo none)"
    echo "   Port:         $PORT"
    echo "   Start now:    $(yn "$START")"
    echo
  } >/dev/tty
  ask_yn GO "Install with these settings?" y
  [ "$GO" = 1 ] || { echo "Nothing was installed." >/dev/tty; exit 0; }
fi

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
    [ -n "$GITHUB_MIRROR" ] && URL="${GITHUB_MIRROR%/}/$URL" && info "Through the mirror $GITHUB_MIRROR"
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

# pkg_install "<apt packages>" "<dnf/yum packages>"
APT_UPDATED=0
pkg_install() {
  if command -v apt-get >/dev/null; then
    if [ "$APT_UPDATED" = 0 ]; then apt-get update -qq >/dev/null 2>&1 || true; APT_UPDATED=1; fi
    # shellcheck disable=SC2086
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $1 >/dev/null
  elif command -v dnf >/dev/null || command -v yum >/dev/null; then
    # shellcheck disable=SC2086
    "$(command -v dnf || command -v yum)" install -y -q $2 >/dev/null
  else
    return 1
  fi
}

install_postgres() {
  info "Installing PostgreSQL"
  pkg_install postgresql "postgresql-server postgresql" \
    || die "Couldn't install PostgreSQL (no internet or package sources?). Install it manually, or pass --db-url."
  if [ -d /var/lib/pgsql ] && [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then postgresql-setup --initdb >/dev/null; fi
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
# The release changelog, when the package ships one (the app shows it after an update).
if [ -f "$SRC/RELEASE_NOTES.md" ]; then cp "$SRC/RELEASE_NOTES.md" "$PREFIX/RELEASE_NOTES.md"; fi
if [ -f "$SRC/RELEASE_NOTES.fa.md" ]; then cp "$SRC/RELEASE_NOTES.fa.md" "$PREFIX/RELEASE_NOTES.fa.md"; fi
# Admin self-update worker: run as root by flock-self-update.service when the Flock server (which is
# unprivileged and hardened with NoNewPrivileges, so it cannot use sudo) drops a request file.
if [ -f "$SRC/self-update-worker.sh" ]; then
  # Replace by rename, not in place: the running worker (this very update) keeps reading its old inode.
  cp "$SRC/self-update-worker.sh" "$PREFIX/self-update-worker.sh.new"
  chmod 755 "$PREFIX/self-update-worker.sh.new"
  mv -f "$PREFIX/self-update-worker.sh.new" "$PREFIX/self-update-worker.sh"
fi
# Older releases used a sudoers rule for this; it is no longer needed.
rm -f /etc/sudoers.d/flock-self-update "$PREFIX/self-update.sh"
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
# First defaults; the admin changes these later in the app (Settings → App settings).
FILE_RETENTION_DAYS=$RETENTION
MAX_UPLOAD_MB=$UPLOAD_MB
ALLOW_REGISTRATION=$OPEN_SIGNUP
CONF
  chown root:flock "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  ok "Wrote $ENV_FILE"
fi
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"

# ---------- 4. HTTPS via Nginx + Let's Encrypt (optional) ----------


if [ -n "$DOMAIN" ]; then
  # Flock listens only locally; Nginx terminates TLS on ports 80/443.
  sed -i 's/^HOST=.*/HOST=127.0.0.1/' "$ENV_FILE"
  if ! command -v nginx >/dev/null || ! command -v certbot >/dev/null; then
    info "Installing Nginx and certbot"
    if command -v dnf >/dev/null || command -v yum >/dev/null; then pkg_install "" "epel-release" || true; fi
    pkg_install "nginx certbot python3-certbot-nginx" "nginx certbot python3-certbot-nginx" \
      || die "Couldn't install Nginx/certbot (no internet or package sources?). Install them and re-run, or omit --domain."
  fi
  if [ -d /etc/nginx/sites-available ]; then
    NGINX_CONF=/etc/nginx/sites-available/flock.conf
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/flock.conf
  else
    NGINX_CONF=/etc/nginx/conf.d/flock.conf
  fi
  cat > "$NGINX_CONF" <<NGINX
# Flock — generated by install.sh (certbot adds the HTTPS parts)
map \$http_upgrade \$flock_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    # Largest upload plus room for multipart headers (raise it if you raise the limit in the app).
    client_max_body_size $(( $(grep -E '^MAX_UPLOAD_MB=' "$ENV_FILE" | cut -d= -f2 || echo 100) + 5 ))m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$flock_connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
}
NGINX
  nginx -t >/dev/null 2>&1 || { nginx -t; die "Invalid Nginx configuration."; }
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
    ufw allow 'Nginx Full' >/dev/null 2>&1 || { ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; }
  fi
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd -q --permanent --add-service=http --add-service=https && firewall-cmd -q --reload
  fi
  if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    systemctl enable nginx >/dev/null 2>&1
    systemctl reload-or-restart nginx
  fi
  ok "Nginx serves $DOMAIN"

  info "Requesting a Let's Encrypt certificate for $DOMAIN"
  if [ -n "$EMAIL" ]; then CERT_ACCOUNT=(-m "$EMAIL"); else CERT_ACCOUNT=(--register-unsafely-without-email); fi
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --keep-until-expiring "${CERT_ACCOUNT[@]}" >/tmp/flock-certbot.log 2>&1; then
    HTTPS_OK=1
    ok "HTTPS enabled (certificates renew automatically)"
  else
    warn "Couldn't get a certificate yet — Flock is reachable over plain HTTP for now."
    warn "Check that $DOMAIN points to this server and ports 80/443 are open, then run:"
    echo "     sudo certbot --nginx -d $DOMAIN --redirect"
    echo "     (details: /tmp/flock-certbot.log)"
  fi
fi

# ---------- 5. TURN relay for calls (optional, coturn) ----------

set_env() { # set_env KEY VALUE — replace or append in $ENV_FILE
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}

if [ "$WITH_TURN" = 1 ]; then
  info "Setting up the TURN relay (coturn)"
  # TURN_DOMAIN lets servers whose web proxy is configured by hand still use their domain/certificate.
  TDOMAIN="${TURN_DOMAIN:-$DOMAIN}"
  command -v turnserver >/dev/null || pkg_install coturn coturn \
    || die "Couldn't install coturn (no internet or package sources?)."

  # Which public address to relay on: the domain's address if it is on this machine, else the first public IP.
  TURN_HOST="${TDOMAIN:-}"
  RELAY_IP=""
  if [ -n "$TDOMAIN" ]; then
    DOMAIN_IP="$(getent ahostsv4 "$TDOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
    if [ -n "$DOMAIN_IP" ] && hostname -I | tr ' ' '\n' | grep -qx "$DOMAIN_IP"; then RELAY_IP="$DOMAIN_IP"; fi
  fi
  [ -n "$RELAY_IP" ] || RELAY_IP="$(hostname -I | tr ' ' '\n' | grep -vE '^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)' | grep -v ':' | head -1 || true)"
  PUBLIC_IP="${TURN_PUBLIC_IP:-$RELAY_IP}"
  if [ -z "$RELAY_IP" ]; then
    # Behind NAT (e.g. cloud VMs): relay on the private address, advertise the public one.
    RELAY_IP="$(hostname -I | awk '{print $1}')"
    PUBLIC_IP="${TURN_PUBLIC_IP:-$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || true)}"
    [ -n "$PUBLIC_IP" ] || die "Couldn't detect the public IP; set TURN_PUBLIC_IP=... and re-run."
  fi
  [ -n "$TURN_HOST" ] || TURN_HOST="$PUBLIC_IP"

  TURN_SECRET="$(grep -E '^TURN_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
  [ -n "$TURN_SECRET" ] || TURN_SECRET="$(random 48)"

  TLS_CONF=""
  if [ -n "$TDOMAIN" ] && [ -f "/etc/letsencrypt/live/$TDOMAIN/fullchain.pem" ]; then
    # coturn runs unprivileged and can't read Let's Encrypt keys directly: keep a copy, refreshed on renewal.
    mkdir -p /etc/coturn/certs /etc/letsencrypt/renewal-hooks/deploy
    cat > /etc/letsencrypt/renewal-hooks/deploy/flock-coturn.sh <<HOOK
#!/bin/sh
# Copies the $TDOMAIN certificate for coturn (installed by Flock).
[ -f /etc/letsencrypt/live/$TDOMAIN/fullchain.pem ] || exit 0
install -m 640 -o root -g turnserver /etc/letsencrypt/live/$TDOMAIN/fullchain.pem /etc/coturn/certs/fullchain.pem
install -m 640 -o root -g turnserver /etc/letsencrypt/live/$TDOMAIN/privkey.pem /etc/coturn/certs/privkey.pem
systemctl restart coturn 2>/dev/null || true
HOOK
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/flock-coturn.sh
    /etc/letsencrypt/renewal-hooks/deploy/flock-coturn.sh
    TLS_CONF="tls-listening-port=5349
cert=/etc/coturn/certs/fullchain.pem
pkey=/etc/coturn/certs/privkey.pem
no-tlsv1
no-tlsv1_1"
  fi

  [ -f /etc/turnserver.conf ] && ! grep -q 'generated by Flock' /etc/turnserver.conf && cp /etc/turnserver.conf /etc/turnserver.conf.orig
  cat > /etc/turnserver.conf <<TURN
# TURN relay for Flock calls — generated by Flock install.sh
listening-port=3478
listening-ip=$RELAY_IP
relay-ip=$RELAY_IP
external-ip=$PUBLIC_IP$([ "$PUBLIC_IP" != "$RELAY_IP" ] && echo "/$RELAY_IP")
min-port=49160
max-port=49200
realm=$TURN_HOST
fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET
$TLS_CONF
# Hardening: only relay media to public addresses.
no-multicast-peers
no-cli
no-tcp-relay
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
total-quota=100
user-quota=12
stale-nonce=600
log-file=syslog
TURN
  [ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
    ufw allow 3478 >/dev/null; ufw allow 5349/tcp >/dev/null; ufw allow 49160:49200/udp >/dev/null
  fi
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd -q --permanent --add-port=3478/udp --add-port=3478/tcp --add-port=5349/tcp --add-port=49160-49200/udp && firewall-cmd -q --reload
  fi
  if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    systemctl enable coturn >/dev/null 2>&1
    systemctl restart coturn
  fi

  URLS="turn:$TURN_HOST:3478?transport=udp,turn:$TURN_HOST:3478?transport=tcp"
  [ -n "$TLS_CONF" ] && URLS="$URLS,turns:$TURN_HOST:5349?transport=tcp"
  set_env TURN_URLS "$URLS"
  set_env TURN_SECRET "$TURN_SECRET"
  ok "TURN relay on $TURN_HOST (ports 3478, ${TLS_CONF:+5349, }49160-49200/udp) — open these in your provider's firewall too"
fi

# ---------- 6. service ----------

if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
  cp "$SRC/flock.service" /etc/systemd/system/$SERVICE.service
  if [ -f "$SRC/flock-self-update.path" ] && [ -f "$SRC/flock-self-update.service" ]; then
    cp "$SRC/flock-self-update.path" "$SRC/flock-self-update.service" /etc/systemd/system/
    UPDATE_PATH=1
  fi
  systemctl daemon-reload
  # Watching for the admin "Update server" request; enabling is idempotent and safe mid-update.
  [ "${UPDATE_PATH:-0}" = 1 ] && systemctl enable --now flock-self-update.path >/dev/null 2>&1 || true
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

install_cli

# ---------- 7. admin account ----------

ADMIN_OK=0
if [ "$CREATE_ADMIN" = 1 ]; then
  info "Creating the admin account '$ADMIN_USER'"
  # The password goes through stdin (never on a command line) and is stored as a bcrypt hash.
  if printf '%s\n' "$ADMIN_PASS" | runuser -u flock -- env $(grep -Ev '^\s*(#|$)' "$ENV_FILE" | xargs) \
      "$PREFIX/node/bin/node" "$PREFIX/server/src/create-admin.js" "$ADMIN_USER" "Admin" >/dev/null; then
    ADMIN_OK=1
    ok "Admin account ready"
  else
    warn "Couldn't create the admin account. Later: printf '%s\n' 'PASSWORD' | sudo -u flock env \$(grep -v '^#' $ENV_FILE | xargs) $PREFIX/node/bin/node $PREFIX/server/src/create-admin.js $ADMIN_USER"
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
ok "Flock is installed."
if [ -n "$DOMAIN" ]; then ADDR="$([ "$HTTPS_OK" = 1 ] && echo https || echo http)://$DOMAIN"; else ADDR="http://${IP:-<server-ip>}:$PORT"; fi
echo "   Web app:     $ADDR"
echo "   Mobile/desktop apps: use server address $ADDR"
echo "   Config:      $ENV_FILE"
echo "   Logs:        journalctl -u $SERVICE -f"
echo "   Manage:      sudo $CLI   (update, status, logs, mirrors, uninstall…)"
if [ "$ADMIN_OK" = 1 ]; then
  echo "   Admin:       $ADMIN_USER  (Settings → App settings in the app)"
  [ "$ADMIN_GENERATED" = 1 ] && echo "   Admin password: $ADMIN_PASS   ← shown only once; save it, then change it with: sudo $CLI admin"
fi
[ -n "$DOMAIN" ] || echo "   Tip: re-run with --domain your.domain for automatic HTTPS (needed for calls in browsers)."
