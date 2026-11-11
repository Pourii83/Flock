---
title: "Method 2: Install script, online"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

**Prerequisites:** root access (`sudo`) and internet access on the server. You don't need to install Node.js; it's bundled.

**Step 1: Point your domain at the server** (see [Before you start](/install/#before-you-start)).

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
| `--domain NAME` | Serve Flock on `https://NAME` through Nginx + Let's Encrypt. Use it on a server dedicated to Flock; if Nginx already hosts other sites, see [deploy/INSTALL.md](https://github.com/Pourii83/Flock/blob/main/deploy/INSTALL.md#server-that-already-runs-nginx) |
| `--email ADDR` | Email for certificate expiry notices |
| `--port N` | Port Flock listens on (default `4000`; first install only) |
| `--version TAG` | Install a specific release, e.g. `v1.7.0` (default: latest) |
| `--db-url URL` | Use an existing PostgreSQL database instead of installing one |
| `--turn` | Also install a TURN relay for calls ([why](/calls/)) |
| `--upload-mb N` | Largest file people can send, in MB (default `100`) |
| `--retention-days N` | Keep sent files this many days (default `7`) |
| `--admin NAME` | Admin account to create (default `admin`). On an existing install it resets that account's password and makes it admin |
| `--no-admin` | Don't create an admin account |
| `--yes` | Don't ask questions |
| `--no-start` | Install without starting the service |
| `--github-mirror URL` / `--apt-mirror URL` | Download through mirrors ([details](/install/script/#managing-the-server-flockctl)) |

Without `--domain`, Flock answers on `http://<server-ip>:4000`. That's fine for testing, but calls from the web app won't work without HTTPS.

## Managing the server: `flockctl`

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
