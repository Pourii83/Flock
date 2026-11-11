---
title: "Installation"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

Pick the method that suits your server:

| | Method 1: Docker | Method 2: Script, online | Method 3: Script, offline |
|---|---|---|---|
| **Best for** | Servers that already run Docker | Most servers (recommended) | Servers without (reliable) internet |
| **Needs on the server** | Docker + Compose | Internet, root | Root; PostgreSQL or a reachable database |
| **What you get** | 3 containers (database, API, web) + optional HTTPS | One `flock` systemd service + PostgreSQL | Same as method 2 |
| **HTTPS** | Built in (Caddy), with `--profile https` | Built in (Nginx + Let's Encrypt), with `--domain` | Same as method 2, if the server can reach Let's Encrypt |
| **Updating** | `git pull` + `docker compose up -d --build` | Run the script again | Run the new package's script |

## Before you start

You need:

1. **A Linux server.** 1 CPU and 1 GB RAM are enough for a group of friends. Methods 2 and 3 support 64-bit x64 or arm64 with glibc 2.28+ (Ubuntu 20.04+, Debian 10+, RHEL/Rocky/Alma 8+).
2. **A domain name** (recommended), for example `chat.example.com`, with an **A record** pointing at the server's IP address. Browsers allow the camera and microphone only over HTTPS, so **calls from the web app need HTTPS**, and HTTPS needs a domain.
3. **Open ports** in the server's firewall and in your hosting provider's panel:

   | Port | Used for |
   |---|---|
   | 80, 443 (TCP) | Web app and API over HTTP/HTTPS |
   | 4000 (TCP) | API without a domain (method 2/3, when you skip `--domain`) |
   | 8080, 4000 (TCP) | Web app and API without a domain (method 1, when you skip the `https` profile) |
   | 3478 (UDP/TCP), 5349 (TCP), 49160–49200 (UDP) | Only if you install the TURN relay ([why](/calls/)) |
