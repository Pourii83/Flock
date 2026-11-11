---
title: "Quick start"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

On a fresh Ubuntu/Debian server whose domain already points at it:

```bash
curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
```

The script asks for the domain, the TURN relay for calls, the admin account and the rest, then shows a summary to confirm. Open `https://chat.example.com`, sign in as the admin, and share the address with your friends.

Later, run `sudo flockctl` on the server to open the same script again as a menu: update, status, restart, logs, admin password, download mirrors and uninstall ([more](/install/script/#managing-the-server-flockctl)). Read on for the other installation methods and the details.
