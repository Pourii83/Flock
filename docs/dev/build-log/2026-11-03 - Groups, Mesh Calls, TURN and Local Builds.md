# 2026-11-03 — Groups, Mesh Calls, TURN and Local Builds

Covers the work up to v1.5.1; the project started 2026-11-02, before these notes existed.

## Before the notes (2026-11-02 → 11-03, up to v1.4.0)

- One Expo codebase for PWA, Android and Electron; Express + Socket.IO; SQLite replaced by PostgreSQL ([[ADR-0001 - PostgreSQL, Not SQLite]]).
- Docker-free install (`deploy/install.sh`: online, offline package, Nginx + certbot, optional coturn), GitHub release workflow.
- Persian + RTL; source-available licence; profile photos.
- Calls: camera/screen added mid-call with `replaceTrack`, TURN, one-way audio fixed, screen audio without self-echo,
  ringtones, call ends when a tab closes, RNNoise noise cancellation.

## v1.5.0 — Groups and group calls

- Group roles: owner, admins, members; add/remove members, group photo and description, ownership transfer, system messages.
- Group calls rebuilt as a mesh ([[ADR-0002 - Group Calls Are a Mesh, Not an SFU]]); "Join" banner in the chat; participant grid.
- Calls minimize to a floating window; audio keeps playing.
- E2E with three Electron windows: everyone rings, three-way audio, late join, call survives a leave, minimize, direct-call regression.

## v1.5.1 — Relay-only TURN

- eturnal on a separate server with Flock's TURN secret; relay checked over UDP and TCP.
- `TURN_EXTRA_URLS` and `TURN_RELAY_ONLY` added; the main server removed as a relay entirely ([[ADR-0003 - Calls Relay Only Through One TURN Server]]).
- E2E in relay-only mode: every connection went through the relay.

## Local builds and releases

- APK built with Gradle and Flock's own key ([[ADR-0004 - Android Built Locally With Gradle and Our Own Key]]).
  Four failed builds before it worked: Gradle ignoring the proxy, then Windows' path limit (subst, then CMake
  object-path limits, then `.cxx` moved to a short path).
- Windows installer with electron-builder; fixed the desktop app defaulting to `localhost:4000`.
- APK and installer uploaded to the GitHub release v1.5.1.

## Not verified

- No real call on production after the TURN switch; APK not run on a phone; installer not run.
