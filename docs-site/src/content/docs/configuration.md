---
title: "Configuration"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

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
