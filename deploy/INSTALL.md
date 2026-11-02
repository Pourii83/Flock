# Installing the Flock server without Docker

You get one Linux service (`flock`) that runs the API, the realtime socket and the web app (PWA) on a single port (default **4000**), backed by PostgreSQL.

Requirements: 64-bit Linux (x64 or arm64) with glibc 2.28+ (Ubuntu 20.04+, Debian 10+, RHEL/Rocky/Alma 8+), systemd, and root access. Node.js is bundled; you don't need to install it.

## Option 1: one-line install from GitHub (online)

```bash
curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
```

The script:
1. downloads the latest `flock-server-linux-<arch>.tar.gz` release
2. installs PostgreSQL if it's missing (apt or dnf/yum) and creates a `flock` database with a random password
3. installs Flock to `/opt/flock`, writes `/etc/flock/flock.env` (random `JWT_SECRET`) and starts the `flock` systemd service

Useful options (after `bash -s --` when piping):

```bash
curl -fsSL .../install.sh | sudo bash -s -- --port 8080
curl -fsSL .../install.sh | sudo bash -s -- --version v1.1.0
curl -fsSL .../install.sh | sudo bash -s -- --db-url postgres://user:pass@db-host:5432/flock
```

> **Private repository:** raw GitHub URLs and release downloads need authentication. Download `install.sh` and run it with a token that can read the repository:
> `sudo GITHUB_TOKEN=ghp_xxx bash install.sh`

## Option 2: offline install from a pre-downloaded package

On a machine with internet access, download from the [Releases](https://github.com/Pourii83/Flock/releases) page:
- `flock-server-linux-x64.tar.gz` (or `-arm64`)
- optionally the `.sha256` file to verify it

Copy the files to the server (USB, `scp`, …), then:

```bash
sha256sum -c flock-server-linux-x64.tar.gz.sha256   # optional
tar -xzf flock-server-linux-x64.tar.gz
sudo ./flock-server/install.sh
```

The package contains everything except PostgreSQL. On a server with **no internet at all**, either:
- install PostgreSQL first from your OS installation media or a local mirror (`apt install postgresql` / `dnf install postgresql-server`), then run the installer; it will create the database for you; or
- point Flock at an existing PostgreSQL server: `sudo ./flock-server/install.sh --db-url postgres://user:pass@host:5432/flock`

## Option 3: manual install (step by step)

```bash
# 1. Unpack
tar -xzf flock-server-linux-x64.tar.gz
sudo mkdir -p /opt/flock /etc/flock
sudo cp -r flock-server/node flock-server/server flock-server/web /opt/flock/

# 2. Database (any PostgreSQL 13+)
sudo -u postgres psql -c "create role flock with login password 'STRONG_PASSWORD'"
sudo -u postgres psql -c "create database flock owner flock"

# 3. Configuration
sudo cp flock-server/flock.env.example /etc/flock/flock.env
sudo nano /etc/flock/flock.env      # set DATABASE_URL and a long random JWT_SECRET (openssl rand -hex 32)

# 4. Service user + systemd unit
sudo useradd --system --home-dir /opt/flock --shell /usr/sbin/nologin flock
sudo chown root:flock /etc/flock/flock.env && sudo chmod 640 /etc/flock/flock.env
sudo cp flock-server/flock.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now flock

# 5. Check
curl http://127.0.0.1:4000/api/health      # {"ok":true}
```

Tables are created automatically on first start.

Without systemd you can run it directly:

```bash
sudo -u flock env $(grep -v '^#' /etc/flock/flock.env | xargs) /opt/flock/node/bin/node /opt/flock/server/src/index.js
```

## After installing

- Web app: `http://<server-ip>:4000`. Android/desktop apps: enter the same address as the server.
- Logs: `journalctl -u flock -f`. Restart: `sudo systemctl restart flock`
- **Upgrade:** run the installer again (online, or with the new package). Your config and database are kept.
- **Uninstall:** `sudo /opt/flock/uninstall.sh` (add `--purge` to also delete config and database)
- **HTTPS:** for production, put Flock behind a reverse proxy with TLS. Example with Caddy:
  ```
  chat.example.com {
      reverse_proxy 127.0.0.1:4000
  }
  ```
  Browsers only allow camera/microphone (calls) on HTTPS or localhost, so HTTPS is required for calls from the web app.

## Building a package yourself

```bash
scripts/package-server.sh x64      # or arm64 → dist/flock-server-linux-x64.tar.gz
```

Pushing a tag like `v1.0.0` builds both architectures with GitHub Actions and attaches them to a release.
