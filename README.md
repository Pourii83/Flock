# Flock

> Stay together, wherever you are.

Flock is a real-time messenger built with **React Native (Expo)**. It runs from one codebase as a **PWA**, an **Android app** and a **desktop app**. It has a Node.js + PostgreSQL backend for chat, presence and WebRTC calls. The UI follows the *Synchronous Flight* design system from Google Stitch: deep-space surfaces, warm amber accents and Inter typography.

**فارسی:** فلاک یک پیام‌رسان بلادرنگ با React Native است که از یک کدبیس، نسخه‌ی وب (PWA)، اندروید و دسکتاپ می‌سازد. بک‌اند با Node.js و PostgreSQL نوشته شده و همه‌چیز با Docker بالا می‌آید.

## Features

- Simple sign-up and login (username + password, JWT)
- Direct and group chats with real-time delivery (Socket.IO)
- Online presence, last seen, typing indicators and read receipts
- Replies, emoji picker, unread counters, pin and mute
- Voice and video calls (WebRTC, peer-to-peer) with incoming-call screen, quick replies, mute, camera, screen share and reactions
- Call history with missed-call filter
- Contacts directory and profile settings
- Responsive layouts: phone (bottom tabs) and desktop (rail + 3-column chat + contact panel)
- Installable PWA with offline app shell

## Repository layout

```
apps/
  client/    Expo app (expo-router) → Android + Web/PWA
  desktop/   Electron shell that packages the web build for Windows/macOS/Linux
server/      Express + Socket.IO + PostgreSQL API
docker-compose.yml
```

## Run everything with Docker

```bash
cp .env.example .env   # then set JWT_SECRET
docker compose up -d --build
docker compose exec server node src/seed.js   # optional demo users (password: flock123)
```

- PWA: http://localhost:8080
- API: http://localhost:4000 (also proxied at `/api` and `/socket.io` by the web container)

## Local development

Requirements: Node 22.13+ and PostgreSQL (or `docker run -d -p 5433:5432 -e POSTGRES_USER=flock -e POSTGRES_PASSWORD=flock -e POSTGRES_DB=flock postgres:17-alpine`).

```bash
# server (defaults to postgres://flock:flock@localhost:5433/flock)
cd server && npm install && npm run seed && npm run dev

# client
cd apps/client && npm install
npm run web        # browser at http://localhost:8081
npm run android    # Android emulator / device (Expo)
```

Point the app at another server with `EXPO_PUBLIC_API_URL` (see `apps/client/.env.example`). The Android emulator reaches your machine at `http://10.0.2.2:4000`.

### Server environment

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `postgres://flock:flock@localhost:5433/flock` | PostgreSQL connection |
| `JWT_SECRET` | random per start | **Set in production** |
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |

## Android

Builds use EAS (Expo's cloud build service), so no local Android SDK is needed:

```bash
cd apps/client
npx eas-cli@latest build -p android --profile preview   # installable APK
```

Set `EXPO_PUBLIC_API_URL` in `eas.json` to your server's address. Calls on Android currently cover signaling and UI only; real audio/video needs `react-native-webrtc` in a development build. Web and desktop calls work fully.

## Desktop

```bash
cd apps/desktop && npm install
npm run build:web   # exports the client into web-dist/
npm start           # run the desktop app
npm run dist:win    # build an installer (also dist:mac / dist:linux)
```

The desktop app connects to `http://localhost:4000` by default. Override it with the `FLOCK_SERVER_URL` env var or `{"serverUrl": "..."}` in `config.json` inside the app's user-data folder.

## Notes

- Calls use STUN by default. For users behind strict NATs, configure a TURN server (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`).
- Messages are private to conversation members and protected by TLS when served over HTTPS. They are not end-to-end encrypted.
