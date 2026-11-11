<p align="center">
  <img src="apps/client/assets/images/icon.png" width="120" alt="Flock" />
</p>

# Flock

**English** | [فارسی](README.fa.md)

> Stay together, wherever you are.

Flock is a self-hosted messenger for you and your friends: chats, voice and video calls, screen sharing and meeting links, all on your own server. It runs from one **React Native (Expo)** codebase as a **web app (PWA)**, an **Android app** and a **Windows app**, with a **Node.js + PostgreSQL** server.

<p align="center">
  <img src="docs/screenshots/chats.png" alt="Group chat with replies, reactions and group info with invite link, on desktop" width="100%" />
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/channel.png" alt="A channel with its invite link" /></td>
    <td width="50%"><img src="docs/screenshots/video-call.png" alt="Full-screen video call" /></td>
  </tr>
  <tr>
    <td align="center"><sub>A channel with its invite link</sub></td>
    <td align="center"><sub>Full-screen video call</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/persian.png" alt="Persian interface, right to left" /></td>
    <td width="50%" align="center"><img src="docs/screenshots/mobile.png" alt="Android and mobile web" width="230" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Persian interface, right to left</sub></td>
    <td align="center"><sub>Android and mobile web</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings: noise cancellation, theme and the accent color wheel" width="100%" />
  <br /><sub>Settings: noise cancellation, theme and the accent color wheel</sub>
</p>

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Installation](#installation)
  - [Before you start](#before-you-start)
  - [Method 1: Docker](#method-1-docker)
  - [Method 2: Install script, online](#method-2-install-script-online)
  - [Method 3: Install script, offline](#method-3-install-script-offline)
  - [After installing](#after-installing)
  - [Configuration](#configuration)
  - [Calls across networks (TURN)](#calls-across-networks-turn)
  - [Troubleshooting](#troubleshooting)
- [Apps](#apps)
- [Privacy and encryption](#privacy-and-encryption)
- [Development](#development)
- [License](#license)

## Features

- **Chats**: direct and group chats with real-time delivery, replies, emoji, clickable links, files up to 100 MB, typing indicators, read receipts, pin and mute
- **Secret chats**: optional end-to-end encryption for a direct chat; the server stores only ciphertext ([details](#privacy-and-encryption))
- **Groups**: owner and admins, group photo and description, add and remove members
- **Calls**: voice and video calls, one-to-one or in groups, with screen sharing (web and desktop), per-person volume, noise cancellation (an on-device AI filter on web and desktop), floating reactions, a temporary in-call chat and a call that can be minimized and dragged around
- **Meeting links**: create a room, share its link, and anyone can join from a browser, even without an account. The link works until the time you choose or until you close the room
- **Contacts**: only the people you already chat with; anyone else is found by searching their username (3+ characters)
- **Profile**: photo, display name, username (changeable), title and bio
- **Admin**: the server's admin changes sign-up, guest access, upload size and file retention in the app, and sees the server's CPU, memory, disk and usage
- **Light and dark themes**, English and Persian (right-to-left) interfaces
- **Apps**: installable web app (PWA), Android APK and Windows installer, all pointing at your own server

## Quick start

On a fresh Ubuntu/Debian server whose domain already points at it:

```bash
curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
```

The script asks for the domain, the TURN relay for calls, the admin account and the rest, then shows a summary to confirm. Open `https://chat.example.com`, sign in as the admin, and share the address with your friends.

Later, run `sudo flockctl` on the server to open the same script again as a menu: update, status, restart, logs, admin password, download mirrors and uninstall ([more](#managing-the-server-flockctl)). Read on for the other installation methods and the details.

## Installation

Pick the method that suits your server:

| | Method 1: Docker | Method 2: Script, online | Method 3: Script, offline |
|---|---|---|---|
| **Best for** | Servers that already run Docker | Most servers (recommended) | Servers without (reliable) internet |
| **Needs on the server** | Docker + Compose | Internet, root | Root; PostgreSQL or a reachable database |
| **What you get** | 3 containers (database, API, web) + optional HTTPS | One `flock` systemd service + PostgreSQL | Same as method 2 |
| **HTTPS** | Built in (Caddy), with `--profile https` | Built in (Nginx + Let's Encrypt), with `--domain` | Same as method 2, if the server can reach Let's Encrypt |
| **Updating** | `git pull` + `docker compose up -d --build` | Run the script again | Run the new package's script |

### Before you start

You need:

1. **A Linux server.** 1 CPU and 1 GB RAM are enough for a group of friends. Methods 2 and 3 support 64-bit x64 or arm64 with glibc 2.28+ (Ubuntu 20.04+, Debian 10+, RHEL/Rocky/Alma 8+).
2. **A domain name** (recommended), for example `chat.example.com`, with an **A record** pointing at the server's IP address. Browsers allow the camera and microphone only over HTTPS, so **calls from the web app need HTTPS**, and HTTPS needs a domain.
3. **Open ports** in the server's firewall and in your hosting provider's panel:

   | Port | Used for |
   |---|---|
   | 80, 443 (TCP) | Web app and API over HTTP/HTTPS |
   | 4000 (TCP) | API without a domain (method 2/3, when you skip `--domain`) |
   | 8080, 4000 (TCP) | Web app and API without a domain (method 1, when you skip the `https` profile) |
   | 3478 (UDP/TCP), 5349 (TCP), 49160–49200 (UDP) | Only if you install the TURN relay ([why](#calls-across-networks-turn)) |

### Method 1: Docker

**Prerequisites:** Docker Engine 24+ with the Compose plugin, and `git`.

**Step 1: Install Docker** (skip if `docker compose version` already works):

```bash
curl -fsSL https://get.docker.com | sudo sh
```

**Step 2: Get Flock**

```bash
git clone https://github.com/Pourii83/Flock.git
cd Flock
```

**Step 3: Configure**

```bash
cp .env.example .env
nano .env
```

Set at least these values:

| Variable | What to put |
|---|---|
| `JWT_SECRET` | A long random string: run `openssl rand -hex 32` and paste the result |
| `POSTGRES_PASSWORD` | A strong database password |
| `DOMAIN` | Your domain, e.g. `chat.example.com` (only for HTTPS in step 4) |

**Step 4: Start**

With HTTPS (recommended; needs `DOMAIN`, DNS and ports 80/443):

```bash
docker compose --profile https up -d --build
```

Without a domain (for testing on a local network):

```bash
docker compose up -d --build
```

The first build takes a few minutes. Check that everything is running:

```bash
docker compose ps        # every service should be "running" or "healthy"
```

**Step 5: Create the admin account.** It asks for a password (at least 8 characters); like every password, it's stored only as a bcrypt hash:

```bash
docker compose exec server node src/create-admin.js admin
```

**Step 6: Open it**: `https://chat.example.com` (with HTTPS) or `http://<server-ip>:8080` (without), and sign in as `admin`.

<details>
<summary>Updating, backups and uninstalling (Docker)</summary>

```bash
# Update to the latest version
git pull
docker compose --profile https up -d --build      # drop "--profile https" if you don't use it

# Back up the database
docker compose exec db pg_dump -U flock flock > flock-backup.sql

# Restore a backup
docker compose exec -T db psql -U flock flock < flock-backup.sql

# Logs
docker compose logs -f server

# Stop and remove the containers (data volumes are kept)
docker compose --profile https down
# ...and also delete all data (database, uploads, certificates)
docker compose --profile https down -v
```

</details>

### Method 2: Install script, online

**Prerequisites:** root access (`sudo`) and internet access on the server. You don't need to install Node.js; it's bundled.

**Step 1: Point your domain at the server** (see [Before you start](#before-you-start)).

**Step 2: Run the installer**

```bash
curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
```

That one line is enough: the script asks for everything else (step 3). You can also pass any answer as an option instead, for example `| sudo bash -s -- --domain chat.example.com --turn`, and it won't ask that question again.

The script:

1. downloads the latest `flock-server-linux-<arch>.tar.gz` from [Releases](https://github.com/Pourii83/Flock/releases)
2. installs PostgreSQL if it's missing, and creates a `flock` database with a random password
3. installs Flock to `/opt/flock`, writes `/etc/flock/flock.env` with a random `JWT_SECRET`, and starts the `flock` service
4. with a domain, it also installs Nginx, gets a Let's Encrypt certificate (renewed automatically) and redirects HTTP to HTTPS
5. with a TURN relay, it installs coturn and connects it to Flock

**Step 3: Answer the questions.** On a first install the script asks for every option, and Enter keeps the default. Options you passed on the command line aren't asked.

| Question | Default | Same as option |
|---|---|---|
| Package file for an offline install | none: download from GitHub | `--package` |
| Release to install | latest | `--version` |
| Domain for HTTPS | none: use the server's IP | `--domain` |
| Email for certificate notices (only with a domain) | none | `--email` |
| Port | `4000` | `--port` |
| Largest file people can send, in MB | `100` | `--upload-mb` |
| Keep sent files for how many days | `7` | `--retention-days` |
| Let anyone sign up? | yes | (Settings → App settings) |
| Install a TURN relay for calls? | yes | `--turn` |
| Existing PostgreSQL URL | none: install PostgreSQL here | `--db-url` |
| Start Flock when the install finishes? | yes | `--no-start` |
| Create an admin account? | yes | `--no-admin` |
| Admin username and password | `admin`, generated password | `--admin` |

Then it shows a **summary** of your answers and installs only when you confirm, so a wrong answer costs nothing: say no and run it again.

At the end it creates the **admin account**. If you left the password empty, it prints a generated one **once**, so save it. All passwords are stored as bcrypt hashes. Use `--yes` to skip the questions: it takes the defaults and the options you passed (without `--turn`, no TURN relay).

**Step 4: Open it**: `https://chat.example.com`, and sign in as the admin. You change most of these settings later in the app, under **Settings → App settings**.

All installer options (add them after `bash -s --`):

| Option | Meaning |
|---|---|
| `--domain NAME` | Serve Flock on `https://NAME` through Nginx + Let's Encrypt. Use it on a server dedicated to Flock; if Nginx already hosts other sites, see [deploy/INSTALL.md](deploy/INSTALL.md#server-that-already-runs-nginx) |
| `--email ADDR` | Email for certificate expiry notices |
| `--port N` | Port Flock listens on (default `4000`; first install only) |
| `--version TAG` | Install a specific release, e.g. `v1.7.0` (default: latest) |
| `--db-url URL` | Use an existing PostgreSQL database instead of installing one |
| `--turn` | Also install a TURN relay for calls ([why](#calls-across-networks-turn)) |
| `--upload-mb N` | Largest file people can send, in MB (default `100`) |
| `--retention-days N` | Keep sent files this many days (default `7`) |
| `--admin NAME` | Admin account to create (default `admin`). On an existing install it resets that account's password and makes it admin |
| `--no-admin` | Don't create an admin account |
| `--yes` | Don't ask questions |
| `--no-start` | Install without starting the service |
| `--github-mirror URL` / `--apt-mirror URL` | Download through mirrors ([details](#managing-the-server-flockctl)) |

Without `--domain`, Flock answers on `http://<server-ip>:4000`. That's fine for testing, but calls from the web app won't work without HTTPS.

#### Managing the server: `flockctl`

The installer adds a `flockctl` command. Run it with no arguments for a menu:

```bash
sudo flockctl
```

```
  Flock server manager  (installed: v1.7.2)

  1) Install
  2) Update
  3) Status
  4) Restart
  5) Logs
  6) Reset an admin password
  7) Download mirrors
  8) Uninstall
  0) Exit
```

Every item is also a command:

| Command | What it does |
|---|---|
| `sudo flockctl update` | Install the latest release (asks which one; `--version v1.7.2` to pick it). Configuration and database are kept |
| `sudo flockctl status` | Version, service, health check, address, TURN relay and mirrors |
| `sudo flockctl restart` | Restart Flock and wait until it answers |
| `sudo flockctl logs` | The last 100 log lines |
| `sudo flockctl admin` | Make an account admin and set its password (forgot the admin password?) |
| `sudo flockctl mirrors` | Download mirrors, see below |
| `sudo flockctl uninstall` | Remove Flock. It asks whether to also delete the database, uploaded files and settings (`--purge` without asking) |

**Download mirrors**, for servers where GitHub or the Ubuntu/Debian archives are slow or blocked:

- **GitHub mirror:** a prefix put in front of github.com download links (proxy style, `https://gh-proxy.example.com/https://github.com/...`). Used for Flock releases.
- **Package (apt) mirror:** replaces the Ubuntu/Debian archive address in the apt sources, used for PostgreSQL, Nginx, certbot and coturn. The original sources are backed up, checked with `apt-get update`, and put back exactly as they were when you restore the defaults.

```bash
sudo flockctl mirrors --github-mirror https://gh-proxy.example.com/
sudo flockctl mirrors --apt-mirror https://mirror.example.com/ubuntu
sudo flockctl mirrors --reset-mirrors          # both back to the defaults
```

The mirror options also work on the first install (`... | sudo bash -s -- --apt-mirror https://mirror.example.com/ubuntu`) and are remembered for later updates.

Back up the database with `sudo -u postgres pg_dump flock > flock-backup.sql`.

### Method 3: Install script, offline

Use this when the server can't download from GitHub (no internet, or GitHub is filtered).

**Step 1: Download the package on another computer**, from [Releases](https://github.com/Pourii83/Flock/releases):

- `flock-server-linux-x64.tar.gz` (most servers) or `flock-server-linux-arm64.tar.gz` (ARM servers; check with `uname -m`)
- the matching `.sha256` file (optional, to verify the download)

**Step 2: Copy them to the server**, for example:

```bash
scp flock-server-linux-x64.tar.gz* user@your-server:~
```

**Step 3: Unpack and verify**

```bash
sha256sum -c flock-server-linux-x64.tar.gz.sha256     # should print "OK"
tar -xzf flock-server-linux-x64.tar.gz
```

**Step 4: Make sure PostgreSQL is available.** The package contains everything except the database. Either:

- let the installer install PostgreSQL. This needs the OS package sources (`apt`/`dnf`), which often work even when GitHub doesn't, or
- install it yourself from local media or a mirror (`sudo apt install postgresql` / `sudo dnf install postgresql-server`), or
- use an existing database with `--db-url postgres://user:pass@host:5432/flock` in the next step.

**Step 5: Install**

```bash
sudo ./flock-server/install.sh --domain chat.example.com
```

It accepts the same options as [method 2](#method-2-install-script-online). `--domain` needs the server to reach Let's Encrypt; without it, Flock answers on `http://<server-ip>:4000`.

**Updating:** download the new package the same way and run its `install.sh` (or `sudo flockctl update --package /path/to/package.tar.gz`). Configuration and database are kept. `flockctl` works as in [method 2](#managing-the-server-flockctl).

For a fully manual installation (no script), see [deploy/INSTALL.md](deploy/INSTALL.md#option-3-manual-install-step-by-step).

### After installing

1. **Sign in as the admin** and open **Settings → App settings**. There you can:
   - open or close sign-up for new accounts
   - allow or block guests (people without an account) in meeting links
   - set the largest file people can send and how long sent files are kept
   - watch server usage: CPU, memory, disk, Flock's database and files, users, messages and live calls

   Forgot the admin password? Run the installer again with `--admin <name>` (Docker: `docker compose exec server node src/create-admin.js <name>`).
2. **Install the apps** (optional): see [Apps](#apps). On first start they ask for the server address; enter the same address you use in the browser, e.g. `https://chat.example.com`.
3. **Check calls between different networks** (e.g. Wi-Fi and mobile data). If they connect without audio or video, add a [TURN relay](#calls-across-networks-turn).
4. **Service commands** (methods 2 and 3):

   ```bash
   sudo systemctl status flock          # is it running?
   sudo systemctl restart flock         # after editing /etc/flock/flock.env
   journalctl -u flock -f               # live logs
   curl http://127.0.0.1:4000/api/health   # {"ok":true}
   ```

### Configuration

Methods 2/3 keep settings in `/etc/flock/flock.env` (restart with `sudo systemctl restart flock` after a change). Docker keeps them in `.env` (apply with `docker compose up -d`).

| Variable | Default | Meaning |
|---|---|---|
| `JWT_SECRET` | random (installer) | Signs login sessions. Changing it signs everyone out |
| `MAX_UPLOAD_MB` | `100` | First value for the largest upload. After that, **App settings** decides |
| `ALLOW_REGISTRATION` | `1` | First value for open sign-up (`0` = closed). After that, **App settings** decides |
| `DATABASE_URL` | set by installer | PostgreSQL connection string |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | Where the server listens (`127.0.0.1` behind Nginx) |
| `CORS_ORIGIN` | `*` | Allowed web origins. Keep `*` for the Android and desktop apps |
| `FILE_RETENTION_DAYS` | `7` | First value for how long uploaded files are kept; the messages stay. After that, **App settings** decides |
| `UPLOAD_DIR` | `/var/lib/flock/uploads` | Where profile photos and files are stored |
| `WEB_DIR` | `/opt/flock/web` | The built web app served by the same process |
| `TURN_URLS` / `TURN_SECRET` | empty | TURN relay for calls (set by `--turn`) |
| `TURN_EXTRA_URLS` | empty | More relays sharing `TURN_SECRET`, tried first (e.g. one on another server) |
| `TURN_RELAY_ONLY` | empty | `1` sends all call media through the relay, which hides users' IP addresses from each other |

### Calls across networks (TURN)

Calls connect directly between devices. When both people are behind strict NATs (mobile data, office networks), a direct connection isn't possible, so a **TURN relay** forwards the encrypted media. Without one, such calls ring and "connect" but carry no sound or video.

- **Methods 2/3:** answer yes when the installer asks about a TURN relay (or pass `--turn`). It installs coturn, opens its ports and fills in `TURN_URLS` / `TURN_SECRET`. Also open ports 3478, 5349 and 49160–49200/udp in your hosting provider's firewall.
- **Docker, or a relay on another machine** (for example [eturnal](https://eturnal.net), which also runs on Windows): set `TURN_URLS` (or `TURN_EXTRA_URLS`) and `TURN_SECRET` to the relay's address and shared secret.

The relay only ever sees encrypted call traffic. More in [deploy/INSTALL.md](deploy/INSTALL.md#turn-server-for-calls).

### Troubleshooting

| Problem | What to check |
|---|---|
| The site doesn't open | `systemctl status flock` / `docker compose ps`. Is port 80/443 (or 4000/8080) open in the provider's firewall? |
| Certificate wasn't issued | The domain's A record must point at this server and port 80 must be reachable, then rerun: `sudo certbot --nginx -d chat.example.com --redirect` (Docker: `docker compose logs caddy`) |
| Camera/microphone blocked in the browser | The web app must be opened over **https://** |
| Calls connect but there's no sound/video | Add a [TURN relay](#calls-across-networks-turn) |
| File upload fails for large files | The limit is in **App settings**. Behind Nginx, `client_max_body_size` must be a bit larger (the installer sets it from your answer); in Docker, edit `apps/client/nginx.conf` |
| Apps say the server isn't reachable | Use the full address including `https://`, and make sure `CORS_ORIGIN` is `*` |
| Something else | Logs: `journalctl -u flock -n 100` or `docker compose logs server` |

## Apps

**Try the demo:** [app.flock.beer](https://app.flock.beer) runs the latest release as a web app on a demo server. Demo data can be wiped at any time; don't use it for anything you want to keep.

Download them from [Releases](https://github.com/Pourii83/Flock/releases):

- **Web app (PWA):** open your server's address. In Chrome/Edge choose *Install app*; on iPhone use *Share → Add to Home Screen*.
- **Android:** `flock-<version>.apk`. Allow installing from your browser when Android asks.
- **Windows:** `flock-<version>-windows-setup.exe`. The installer isn't code-signed yet, so Windows SmartScreen may warn; choose *More info → Run anyway*.

The Android and Windows apps ask for the **server address** on the sign-in screen (e.g. `https://chat.example.com`). You can change it later in **Settings → Server**.

## Privacy and encryption

- **In transit:** with HTTPS everything between the apps and your server is encrypted (TLS).
- **Calls** are encrypted between the participants (WebRTC DTLS-SRTP). A TURN relay only forwards encrypted packets.
- **Normal chats** are stored on your server in readable form, so they work on all your devices with full history and files.
- **Secret chats** are end-to-end encrypted (Curve25519 + XSalsa20-Poly1305, via [TweetNaCl](https://tweetnacl.js.org)). Each device creates its own key pair and only the public key goes to the server, so the server stores only ciphertext. A secret chat lives on one device on each side: it isn't visible on your other devices, and it's lost if you clear the browser data or reinstall the app. Both people see the same *safety code*; compare it in person or on a call to make sure nobody swapped the keys. Files can't be sent in secret chats yet.
- Meeting guests (people without an account) get a pass for that one room only, valid at most until the room expires.

## Development

Requirements: Node 22.13+ and PostgreSQL (or `docker run -d -p 5433:5432 -e POSTGRES_USER=flock -e POSTGRES_PASSWORD=flock -e POSTGRES_DB=flock postgres:17-alpine`).

```bash
# server (defaults to postgres://flock:flock@localhost:5433/flock)
cd server && npm install && npm run seed && npm run dev

# web client
cd apps/client && npm install
npx expo start --web
```

```
apps/
  client/    Expo app (expo-router) → web/PWA + Android
  desktop/   Electron shell around the web build (Windows installer)
server/      Express + Socket.IO + PostgreSQL
deploy/      install.sh, uninstall.sh, systemd unit, Caddyfile, INSTALL.md
scripts/     package-server.sh (offline server package), build-android.sh
```

- **Server package:** `scripts/package-server.sh x64` (or `arm64`) builds `dist/flock-server-linux-x64.tar.gz`. Pushing a tag like `v1.7.0` builds both with GitHub Actions and attaches them to a release.
- **Android:** built locally with Gradle and signed with your own key: `scripts/build-android.sh` (needs the Android SDK and JDK 21). Calls need a real build; Expo Go can't make calls.
- **Windows:** `cd apps/desktop && npm install && npm run dist:win`.
- **Demo PWA:** pushing a release tag also runs `.github/workflows/deploy-pwa.yml`, which moves the `pwa` branch to the release. Vercel builds that branch with `scripts/build-pwa.sh`. The demo server's address is the Vercel project's `PWA_API_URL` variable and is baked into that build only; the Android and Windows apps never get a default server.

## License

Flock is **source-available** under the [Flock Source-Available License](LICENSE): you can use it, self-host it and contribute to it, but you may not republish, redistribute, sell or rebrand it. See [CONTRIBUTING.md](CONTRIBUTING.md).
