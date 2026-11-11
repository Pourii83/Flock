---
title: "After installing"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

1. **Sign in as the admin** and open **Settings → App settings**. There you can:
   - open or close sign-up for new accounts
   - allow or block guests (people without an account) in meeting links
   - set the largest file people can send and how long sent files are kept
   - watch server usage: CPU, memory, disk, Flock's database and files, users, messages and live calls

   Forgot the admin password? Run the installer again with `--admin <name>` (Docker: `docker compose exec server node src/create-admin.js <name>`).
2. **Install the apps** (optional): see [Apps](/apps/). On first start they ask for the server address; enter the same address you use in the browser, e.g. `https://chat.example.com`.
3. **Check calls between different networks** (e.g. Wi-Fi and mobile data). If they connect without audio or video, add a [TURN relay](/calls/).
4. **Service commands** (methods 2 and 3):

   ```bash
   sudo systemctl status flock          # is it running?
   sudo systemctl restart flock         # after editing /etc/flock/flock.env
   journalctl -u flock -f               # live logs
   curl http://127.0.0.1:4000/api/health   # {"ok":true}
   ```
