---
title: "Development"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

Requirements: Node 22.13+ and PostgreSQL (or `docker run -d -p 5433:5432 -e POSTGRES_USER=flock -e POSTGRES_PASSWORD=flock -e POSTGRES_DB=flock postgres:17-alpine`).

```bash
# server (defaults to postgres://flock:flock@localhost:5433/flock)
cd server && npm install && npm run seed && npm run dev

# web client
cd apps/client && npm install
npx expo start --web
```

```
apps/
  client/    Expo app (expo-router) → web/PWA + Android
  desktop/   Electron shell around the web build (Windows installer)
server/      Express + Socket.IO + PostgreSQL
deploy/      install.sh, uninstall.sh, systemd unit, Caddyfile, INSTALL.md
scripts/     package-server.sh (offline server package), build-android.sh
```

- **Server package:** `scripts/package-server.sh x64` (or `arm64`) builds `dist/flock-server-linux-x64.tar.gz`. Pushing a tag like `v1.7.0` builds both with GitHub Actions and attaches them to a release.
- **Android:** built locally with Gradle and signed with your own key: `scripts/build-android.sh` (needs the Android SDK and JDK 21). Calls need a real build; Expo Go can't make calls.
- **Windows:** `cd apps/desktop && npm install && npm run dist:win`.
- **Demo PWA:** pushing a release tag also runs `.github/workflows/deploy-pwa.yml`, which moves the `pwa` branch to the release. Vercel builds that branch with `scripts/build-pwa.sh`. The demo server's address is the Vercel project's `PWA_API_URL` variable and is baked into that build only; the Android and Windows apps never get a default server.
