# Flock — developer notes

Shared notes for everyone who works on the Flock code. This folder opens as an Obsidian vault, but plain Markdown
is enough. **Nothing about the production servers lives here** — this repository is public. Server addresses,
deploy steps, keys and credentials stay with the maintainer.

> Conversation with the maintainer is in Persian; code, comments, commit messages and file names are in English.

## What Flock is

A messenger with voice/video calls for a circle of friends, from **one React Native (Expo) codebase** for the web
(PWA), Android and Windows (Electron): one-to-one and group chats with admins, one-to-one and group calls, screen
sharing, in-call chat, meeting links for guests, opt-in end-to-end secret chats. Server: Node + PostgreSQL.
The repository is public under a source-available licence (see `LICENSE`).

## Read at the start of a session

1. [[STATE]] — where the project stands, what is next, what is deferred.
2. [[ADR-0000 - The Decision Register]] — every architecture decision.
3. [[COMMANDS]] — local development, checks, builds, releases.
4. [[Open Questions]]
5. The latest changes: `git log --oneline -10`.

## Layout

```
apps/client/      Expo / React Native (web, Android)
apps/desktop/     Electron (Windows) around the web build
server/           Express + Socket.IO + PostgreSQL
deploy/           install.sh (no Docker: systemd, Nginx, certbot, optional coturn), env example
scripts/          package-server.sh, build-android.sh, build-pwa.sh
site/             the landing page (static, no build)
docs/dev/         these notes
.private/         maintainer-only local secrets (signing key etc.) — never committed, ignored by git
dist/             build output (APK, installer, server package) — ignored by git
```

The end-user install and configuration guide lives in a separate documentation repository kept by the
maintainer; a change to install or config behaviour needs a matching change there — tell the maintainer.

## Stack (measured 2026-11-03)

- **Client:** Expo SDK `~58.0.22`, React Native `0.88.1`, React `19.3.0`, expo-router `~58.0.29`,
  react-native-webrtc `^155.0.1`, React Compiler on.
- **Desktop:** Electron `^45.2.1`, electron-builder `^26.18.0` (NSIS, not code-signed).
- **Server:** Express `^5.3.0`, Socket.IO `^4.8.4`, pg `^8.23.1`, Node 24 LTS (the server package bundles Node),
  PostgreSQL 17 in Docker for development.
- **Android:** Gradle 9.4.1, AGP 9.x, compileSdk 37, targetSdk 36, NDK 27.1, JDK 21; ABIs arm64-v8a and armeabi-v7a.

## Conventions

- Code, comments, commit messages and file names in English.
- Every user-facing string goes through `t()`; English is the i18n key, the Persian translation goes into
  `lib/i18n.ts` in the same change.
- Keep the UI on the design tokens in `src/theme.ts`.
- Before a commit, in `apps/client`: `npx tsc --noEmit -p .` and `npx eslint src --quiet` must be clean.
- Secrets never enter the repo. Use `.env` (ignored) locally; examples go in the `*.example` files.
- Installed apps ship with **no default server address**; never add a real server URL to any default.
- Releases: tag `vX.Y.Z`; the server packages, APK and Windows installer go on the GitHub release (maintainer).
- Android builds only when the maintainer asks.

## Notes in this folder

- `decisions/` — ADRs. A new decision gets the next number and a line in ADR-0000.
- `build-log/` — one note per work session or round: what changed, how it was verified, gotchas.
- [[STATE]] — overwritten, not appended, at the end of a session or milestone.
- [[Open Questions]] — close a question by moving its answer to an ADR, then delete the line.

Do not write server addresses, hostnames of the maintainer's machines, credentials or deploy details into any
note here.
