---
title: "Method 3: Install script, offline"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

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

It accepts the same options as [method 2](/install/script/). `--domain` needs the server to reach Let's Encrypt; without it, Flock answers on `http://<server-ip>:4000`.

**Updating:** download the new package the same way and run its `install.sh` (or `sudo flockctl update --package /path/to/package.tar.gz`). Configuration and database are kept. `flockctl` works as in [method 2](/install/script/#managing-the-server-flockctl).

For a fully manual installation (no script), see [deploy/INSTALL.md](https://github.com/Pourii83/Flock/blob/main/deploy/INSTALL.md#option-3-manual-install-step-by-step).
