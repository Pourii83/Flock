---
title: "Introduction"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

> Stay together, wherever you are.

Flock is a self-hosted messenger for you and your friends: chats, voice and video calls, screen sharing and meeting links, all on your own server. It runs from one **React Native (Expo)** codebase as a **web app (PWA)**, an **Android app** and a **Windows app**, with a **Node.js + PostgreSQL** server.

<p align="center">
  <img src="/screenshots/chats.png" alt="Group chat with replies and reactions, on desktop" width="100%" />
</p>

<table>
  <tr>
    <td width="50%"><img src="/screenshots/direct-chat.png" alt="Direct chat with a call in the history" /></td>
    <td width="50%"><img src="/screenshots/call.png" alt="Group voice call" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Direct chat with a call in the history</sub></td>
    <td align="center"><sub>Group voice call</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="/screenshots/persian.png" alt="Persian interface, right to left" /></td>
    <td width="50%" align="center"><img src="/screenshots/mobile.png" alt="Android and mobile web" width="230" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Persian interface, right to left</sub></td>
    <td align="center"><sub>Android and mobile web</sub></td>
  </tr>
</table>

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
