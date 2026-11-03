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
curl -fsSL .../install.sh | sudo bash -s -- --domain chat.example.com --email you@example.com
```

`--domain` installs **Nginx + certbot**, proxies `https://chat.example.com` to Flock (including WebSockets), gets a Let's Encrypt certificate that renews automatically, and keeps Flock itself on `127.0.0.1`. The domain's DNS must point at the server and ports 80/443 must be open. Use it on a **dedicated** server. If Nginx already hosts other sites, follow [Server that already runs Nginx](#server-that-already-runs-nginx) instead.

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
- **HTTPS:** use `--domain` (above) or the Nginx setup below. Browsers only allow camera/microphone (calls) on HTTPS or localhost, so HTTPS is required for calls from the web app.

## Server that already runs Nginx

On a shared server, don't let certbot rewrite Nginx for you. Its generated `listen 443` binds every address, which can clash with sites or proxies bound to a specific IP. Instead:

```bash
# 1. Install Flock without --domain, then keep it local-only
sudo ./flock-server/install.sh
sudo sed -i 's/^HOST=.*/HOST=127.0.0.1/' /etc/flock/flock.env && sudo systemctl restart flock

# 2. HTTP site for the ACME challenge, then the certificate
sudo mkdir -p /var/www/flock-acme
#    (create /etc/nginx/sites-available/flock with only the port-80 server below, link it, nginx -t, reload)
sudo certbot certonly --webroot -w /var/www/flock-acme -d chat.example.com --deploy-hook "systemctl reload nginx"
```

`/etc/nginx/sites-available/flock` (link it into `sites-enabled`, then `sudo nginx -t && sudo systemctl reload nginx`):

```nginx
map $http_upgrade $flock_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name chat.example.com;
    location /.well-known/acme-challenge/ { root /var/www/flock-acme; }
    location / { return 301 https://chat.example.com$request_uri; }
}

server {
    listen 443 ssl http2;            # or <server-ip>:443 to match how your other sites listen
    server_name chat.example.com;
    ssl_certificate     /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $flock_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

The `/.well-known/acme-challenge/` location must stay in place so certbot can renew the certificate automatically.

## Building a package yourself

```bash
scripts/package-server.sh x64      # or arm64 → dist/flock-server-linux-x64.tar.gz
```

Pushing a tag like `v1.0.0` builds both architectures with GitHub Actions and attaches them to a release.

## TURN server for calls

Calls between users on different networks (mobile data, office NATs, …) need a TURN relay. Without one, a call may "connect" with no audio or video.

```bash
sudo ./flock-server/install.sh --domain chat.example.com --turn
# server whose Nginx you configure yourself: give the domain to TURN only
sudo TURN_DOMAIN=chat.example.com ./flock-server/install.sh --turn
```

This installs **coturn** with:
- short-lived credentials: Flock hands them out via `/api/ice` (`use-auth-secret`), so nothing secret ships in the apps
- ports **3478** (UDP/TCP), **5349** (TLS, when a Let's Encrypt certificate exists for the domain) and relay ports **49160–49200/udp**
- relaying to private/internal addresses blocked, and per-user quotas

Open those ports in your hosting provider's firewall as well. The installer sets `TURN_URLS` and `TURN_SECRET` in `/etc/flock/flock.env`. For an existing coturn, set them yourself (`static-auth-secret` must equal `TURN_SECRET`).

A relay on another machine (for example [eturnal](https://eturnal.net), which also runs on Windows) goes in `TURN_EXTRA_URLS`. The installer never overwrites that setting, and those relays are tried first. Set its shared secret to `TURN_SECRET`. To send all call media through the relay, which hides users' IP addresses from each other, add `TURN_RELAY_ONLY=1`. Restart Flock after changing these.
