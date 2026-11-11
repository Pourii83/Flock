---
title: "Troubleshooting"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

| Problem | What to check |
|---|---|
| The site doesn't open | `systemctl status flock` / `docker compose ps`. Is port 80/443 (or 4000/8080) open in the provider's firewall? |
| Certificate wasn't issued | The domain's A record must point at this server and port 80 must be reachable, then rerun: `sudo certbot --nginx -d chat.example.com --redirect` (Docker: `docker compose logs caddy`) |
| Camera/microphone blocked in the browser | The web app must be opened over **https://** |
| Calls connect but there's no sound/video | Add a [TURN relay](/calls/) |
| File upload fails for large files | The limit is in **App settings**. Behind Nginx, `client_max_body_size` must be a bit larger (the installer sets it from your answer); in Docker, edit `apps/client/nginx.conf` |
| Apps say the server isn't reachable | Use the full address including `https://`, and make sure `CORS_ORIGIN` is `*` |
| Something else | Logs: `journalctl -u flock -n 100` or `docker compose logs server` |
