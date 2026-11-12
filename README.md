**English** | [فارسی](README.fa.md)

<div align="center">

# <picture><source media="(prefers-color-scheme: dark)" srcset="docs/brand/flock-mark-white.png"><img src="docs/brand/flock-mark-dark.png" alt="" height="36" align="top"></picture> Flock

[![Version](https://img.shields.io/github/v/release/Pourii83/Flock?label=version&color=blue)](https://github.com/Pourii83/Flock/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/Pourii83/Flock/release.yml?label=build)](https://github.com/Pourii83/Flock/actions/workflows/release.yml)
[![Last commit](https://img.shields.io/github/last-commit/Pourii83/Flock)](https://github.com/Pourii83/Flock/commits/main/)
[![License: Source-available](https://img.shields.io/badge/license-source--available-orange)](LICENSE)

**Self-hosted chats and calls for you and your friends**

[Website](https://flock.beer) · [Live demo](https://app.flock.beer) · [Documentation](https://docs.flock.beer)

</div>

<p align="center">
  <img src="docs/screenshots/chats.png" alt="Flock on desktop: a group chat with replies and reactions" width="100%" />
</p>

## Key Features

- 💬 **Chats**: direct messages, groups and channels, with replies, reactions, file sharing (the admin sets the size limit) and read receipts
- 🔗 **Invite links**: anyone can join a group or channel with one tap; the owner can revoke the link
- 🔒 **Secret chats**: optional end-to-end encryption; the server only stores ciphertext
- 📞 **Voice & video calls**: one-to-one or in groups, full-screen video, screen sharing and noise cancellation
- 🎟️ **Meeting links**: guests join a call from their browser, no account needed
- 🛡️ **Admin settings**: sign-up, guest access, upload limits and file retention, right inside the app
- 🎨 **Themes**: light and dark, with any accent color
- 📱 **Every device**: installable web app (PWA), Android and Windows
- 🌍 **i18n**: English and Persian (right to left)

## Quick Start

On a fresh Ubuntu or Debian server whose domain already points at it, run:

```bash
curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
```

The script installs everything (PostgreSQL, Nginx, an HTTPS certificate, the Flock service), asks for your domain and admin account, and shows a summary before it starts. After installation, open the same script as a menu anytime with:

```bash
sudo flockctl
```

> [!TIP]
> Point a domain at your server first: browsers only allow the camera and microphone over HTTPS.

Want to look around first? Try the [live demo](https://app.flock.beer); its data is reset every day.

## Documentation

Full documentation lives at [docs.flock.beer](https://docs.flock.beer):

- [Try the demo](https://docs.flock.beer/demo/)
- [Quick start](https://docs.flock.beer/quick-start/)
- [Choosing an installation method](https://docs.flock.beer/install/)
- [Install with Docker](https://docs.flock.beer/install/docker/)
- [Install script](https://docs.flock.beer/install/script/)
- [Managing the server with `flockctl`](https://docs.flock.beer/install/script/#managing-the-server-flockctl)
- [Offline install](https://docs.flock.beer/install/offline/)
- [After installing](https://docs.flock.beer/after-installing/)
- [Configuration](https://docs.flock.beer/configuration/)
- [Calls across networks (TURN)](https://docs.flock.beer/calls/)
- [Android, Windows and web apps](https://docs.flock.beer/apps/)
- [Troubleshooting](https://docs.flock.beer/troubleshooting/)
- [Privacy and encryption](https://docs.flock.beer/privacy/)
- [Development](https://docs.flock.beer/development/)

## Author

- Maintainer: [@Pourii83](https://github.com/Pourii83)
- Contributors: [@AlirezaNoorizadeh](https://github.com/AlirezaNoorizadeh)

## Contributing

- Contributions are welcome: bug reports, ideas, translations, design feedback and code.
- Before a larger change, open an issue at [github.com/Pourii83/Flock/issues](https://github.com/Pourii83/Flock/issues) so we can agree on it first.
- Read the [contributing guide](CONTRIBUTING.md) before opening a pull request.

## Support

If Flock is useful to you, you can support its development:

### BNB and USDT (BEP-20, BNB Smart Chain)

```
0x33F5E7CEd703f514D08361732aECed623e9DceE0
```

### TRX and USDT (TRC-20, TRON)

```
TWF2qgU9AFHHEf1TdJKnVnNjjZ1fszhitZ
```

### TON

```
UQDDkfbmIFjcGO7tyDahkuzxwJ3-PApAQHiBx6AZzfaxBzwL
```

> [!CAUTION]
> Send each coin only on the network named above it. Coins sent on another network are lost.

## License

Flock is **source-available** under the [Flock Source-Available License](LICENSE): you can use it, self-host it and contribute to it, but you may not republish, redistribute, sell or rebrand it. See [CONTRIBUTING.md](CONTRIBUTING.md).
