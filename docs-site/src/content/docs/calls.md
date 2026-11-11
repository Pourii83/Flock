---
title: "Calls across networks (TURN)"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

Calls connect directly between devices. When both people are behind strict NATs (mobile data, office networks), a direct connection isn't possible, so a **TURN relay** forwards the encrypted media. Without one, such calls ring and "connect" but carry no sound or video.

- **Methods 2/3:** answer yes when the installer asks about a TURN relay (or pass `--turn`). It installs coturn, opens its ports and fills in `TURN_URLS` / `TURN_SECRET`. Also open ports 3478, 5349 and 49160–49200/udp in your hosting provider's firewall.
- **Docker, or a relay on another machine** (for example [eturnal](https://eturnal.net), which also runs on Windows): set `TURN_URLS` (or `TURN_EXTRA_URLS`) and `TURN_SECRET` to the relay's address and shared secret.

The relay only ever sees encrypted call traffic. More in [deploy/INSTALL.md](https://github.com/Pourii83/Flock/blob/main/deploy/INSTALL.md#turn-server-for-calls).
