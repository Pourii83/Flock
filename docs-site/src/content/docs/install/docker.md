---
title: "Method 1: Docker"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

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
