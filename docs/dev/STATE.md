# Flock — State

Overwrite, do not append, at the end of a session or milestone. No server or deploy details here.

**Updated:** 2026-11-19
**Last change, always from source:** `git log --oneline -10`
**Last release:** v1.11.0. `main` is ahead of it (deployed to production, not released; no new APK or installer).

## Now (on `main`, after v1.11.0)

- **Web Push** notifications that reach phones; the voice-message waveform fits narrow screens.
- **Android:** calls float in picture-in-picture when leaving the app; hold-to-record survives a long touch.
- **Files in secret chats:** encrypted on the device with NaCl secretbox, the server stores `sealed.bin`;
  name/type/caption/key are sealed in the message text; 50 MB cap; no caption edits. Tested with two Electron users.
- Tooltips render in a body portal (no longer under bubbles); composer icons in a one-line box; channels no longer
  post membership notices (added/removed/left/link/admin).
- **Friends' feedback round (2026-11-18):** phone composer (Enter = new line, emoji panel replaces the keyboard,
  `interactive-widget=resizes-content`), floating emoji panel on desktop, Arrow Up edits, desktop multi-select,
  stepping through several pins, floating date, scroll on send, caption edits, drafts in the chat list,
  "Seen and reactions" dialog (`read_marks` table), group read ticks = furthest reader, read state + missed-call
  badges synced across devices (`user_marks`, `/api/me/marks`, socket `mark`), calls survive 15 s of disconnection
  (`call:rejoin`, ICE restarts 3×5 s), camera flip in the dock + on the web, web picture-in-picture, raise-hand
  sound, future dates no longer "Today", meeting-link row layout, join as guest while signed in, secret chats
  reused per device, web notifications + settings, voice messages, About: clean version + donation wallets,
  username-change warning, `render.yaml` + `server/railway.json`. Checked with an Electron script against a local
  server (11/11).
- **2026-11-12:** sign-in/sign-up rate limits (per account 8 fails/15 min, per IP 40/15 min, sign-ups 10/h per IP,
  429 + Retry-After) and Express `trust proxy` for local/private proxies; offline start keeps the cached user
  (`flock.user`); the service worker (`flock-v3`) precaches the whole build so the installed PWA opens offline;
  message text aligns by its own language (web `[data-bidi='plain']`, Android picked against the UI direction).

## Earlier releases (summary)

- **1.10.x:** message context menu, full emoji picker, in-chat search, edit/delete/forward/pin, staged uploads with
  progress and drag & drop, mobile multi-select, update banner + changelog (Persian too), admin server self-update
  from GitHub releases, branding (app name, repo link), accent color. See
  [[2026-11-10 - Enhancement Round]].
- **1.9.0:** photo/video viewer (`components/media-viewer.tsx`, `expo-video`); full-width shared screen.
- **1.8.0:** reactions, calls in the chat log, Saved Messages, speaker picker, voice meters.
- **1.7.x:** meeting links with guests, secret chats ([[ADR-0005 - Secret Chats Are Per-Device End-to-End Encryption]]),
  light/dark/system theme, admin App settings (`app_settings` table), call screen redesign, installer creates the admin.
- **1.5.x:** groups and mesh group calls ([[ADR-0002 - Group Calls Are a Mesh, Not an SFU]]), relay-only TURN
  ([[ADR-0003 - Calls Relay Only Through One TURN Server]]), local Android builds ([[ADR-0004 - Android Built Locally With Gradle and Our Own Key]]).

Installed apps ship with **no default server**. A public demo exists (web app + demo server, wiped nightly);
its calls use public STUN only.

## Next

- Android: notifications and voice recording/PiP need a new APK to reach users (native modules).
- Not tested in a real call: guest-only meeting links and the four meeting modes.
- Hand-test on a phone/real browser: per-device mic bars and the multi-camera switch with real hardware, WebRTC
  failure guidance (deny the mic/camera), reaction/chat sounds through a chosen speaker, the mobile long-press
  menu, the full-width shared screen, the media viewer (photo, video, back button), the self view in one-to-one
  video, the call chat above the navigation bar, secret chat accept, the light theme.
- Admin: no preview of an app rename before saving; no user management (closing sign-up leaves no way to add people).
- Call-reaction/message sounds are synthesized with WebAudio; no volume control beyond the mute toggles.
- Secret chats: no way to move a secret chat to a new device.
- Rejected uploads (no token, not a member, too large) show nginx 502 instead of Flock's error: Node answers before
  reading the body.

## Deferred

- TLS on 5349 for the TURN relay (for networks that block plain TURN).
- Code signing for the Windows installer (SmartScreen warning).
- An SFU when groups larger than ~6–8 people need calls.
- iOS.
