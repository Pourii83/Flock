---
title: "Introduction"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

> Stay together, wherever you are.

Flock is a self-hosted messenger for you and your friends: chats, voice and video calls, screen sharing and meeting links, all on your own server. It runs from one **React Native (Expo)** codebase as a **web app (PWA)**, an **Android app** and a **Windows app**, with a **Node.js + PostgreSQL** server.

<p align="center">
  <img src="https://flock.iranset.online/chats.png" data-fallback="/screenshots/chats.png" alt="Group chat with replies, reactions and group info with invite link, on desktop" width="100%" />
</p>

<table>
  <tr>
    <td width="50%"><img src="https://flock.iranset.online/channel.png" data-fallback="/screenshots/channel.png" alt="A channel with its invite link" /></td>
    <td width="50%"><img src="https://flock.iranset.online/video-call.png" data-fallback="/screenshots/video-call.png" alt="Full-screen video call" /></td>
  </tr>
  <tr>
    <td align="center"><sub>A channel with its invite link</sub></td>
    <td align="center"><sub>Full-screen video call</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://flock.iranset.online/persian.png" data-fallback="/screenshots/persian.png" alt="Persian interface, right to left" /></td>
    <td width="50%" align="center"><img src="https://flock.iranset.online/mobile.png" data-fallback="/screenshots/mobile.png" alt="Android and mobile web" width="230" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Persian interface, right to left</sub></td>
    <td align="center"><sub>Android and mobile web</sub></td>
  </tr>
</table>

<p align="center">
  <img src="https://flock.iranset.online/settings.png" data-fallback="/screenshots/settings.png" alt="Settings: noise cancellation, theme and the accent color wheel" width="100%" />
  <br /><sub>Settings: noise cancellation, theme and the accent color wheel</sub>
</p>

## Features

- **Chats**: direct and group chats with real-time delivery, replies, emoji, clickable links, files up to 100 MB, typing indicators, read receipts, pin and mute
- **Secret chats**: optional end-to-end encryption for a direct chat; the server stores only ciphertext ([details](/privacy/))
- **Groups**: owner and admins, group photo and description, add and remove members
- **Calls**: voice and video calls, one-to-one or in groups, with screen sharing (web and desktop), per-person volume, noise cancellation (an on-device AI filter on web and desktop), floating reactions, a temporary in-call chat and a call that can be minimized and dragged around
- **Meeting links**: create a room, share its link, and anyone can join from a browser, even without an account. The link works until the time you choose or until you close the room
- **Contacts**: only the people you already chat with; anyone else is found by searching their username (3+ characters)
- **Profile**: photo, display name, username (changeable), title and bio
- **Admin**: the server's admin changes sign-up, guest access, upload size and file retention in the app, and sees the server's CPU, memory, disk and usage
- **Light and dark themes**, English and Persian (right-to-left) interfaces
- **Apps**: installable web app (PWA), Android APK and Windows installer, all pointing at your own server
