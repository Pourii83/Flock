---
title: Try the demo
description: Use Flock in your browser on the public demo server, without installing anything.
---

The public demo runs the latest Flock release. Use it to see how Flock feels before you install your own server.

**Open it:** [app.flock.beer](https://app.flock.beer)

## Everything resets every day

:::caution
All accounts, messages, groups and files on the demo are **deleted every day at 04:30 UTC** (08:00 in Tehran). Don't keep anything there that you want to see again.
:::

The demo server is updated to the newest release during the same nightly reset.

## Getting started

1. Open [app.flock.beer](https://app.flock.beer) and choose **Create an account**.
2. Ask a friend to do the same, then search for each other's username (3 characters or more) to start a chat.
3. Try a group, a voice or video call, or a meeting link that someone without an account can join.

## Using the Android or Windows app

The apps ship without a server address. To use them with the demo:

1. Download the APK or the Windows installer from the [latest release](https://github.com/Pourii83/Flock/releases/latest).
2. On the sign-in screen, enter this server address:

   ```text
   https://api.flock.beer
   ```

You can change the server later in **Settings → Server**, for example when you install your own.

## Limits of the demo

- **Calls:** the demo has no TURN relay, only public STUN. Calls between people on strict networks (some mobile carriers, offices) may not connect. Your own server can add a relay; see [Calls across networks](/calls/).
- **Files:** uploads are limited to 10 MB each.
- **Admin settings** can't be changed by visitors.

When you are ready to run Flock for your own group, start with the [Quick start](/quick-start/).
