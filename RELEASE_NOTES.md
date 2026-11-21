Push notifications in the browser, a redesigned look, one-click cloud hosting and two rounds of feedback from people using Flock every day.

> **Upgrading:** run the installer again or install the new package (config and database are kept). Phones need this APK and the Windows app needs this installer for the new client code. The server migrates its database by itself on start. Changing your password now signs your other devices out.

### 🔔 Notifications and voice
- **Push notifications** in browsers and the installed web app (PWA), on computers and phones, even when Flock is closed. The Android app doesn't have them yet.
- Voice messages show a **waveform** that fills smoothly while playing. Hold to record on phones.
- **One voice player** on the web keeps playing while you move between chats, with ±10 s, mute and a speed button that steps 1×, 1.5×, 2×.

### 💬 Chat
- **Block** someone in a one-to-one chat.
- **Group and channel owners can delete other people's messages**, after a warning naming the sender.
- Tap a **quoted reply** to jump to the original message.
- **Selecting messages** works like Telegram: the whole row highlights and a tap anywhere picks or drops a message.
- Files in **secret chats**, encrypted on the device. Files are captioned right in the message box.
- An arrow takes you back to the newest messages.
- Chat preview on Alt+click (desktop) and long-press (phones), with pin, mute and mark as read. Pinned chats can be reordered.
- Shared media, files and links in chat info, with "Show in chat" on every item.

### 📞 Calls
- New messages in the call chat pop up as a **toast** while the chat is closed.
- **Microphone test** and **microphone choice** in Settings; the mic you pick is the one calls use.
- On phones the call bar is Mute, Speaker, Video, Chat, More and Leave (screen sharing is in More); the camera flip sits on your own video. Calls float in **picture-in-picture** when you leave the Android app.
- **USB-C headsets** show up as a sound output in Android calls.
- On wide screens the in-call chat can be pinned to the side, and hang-up sits inside the control panel. A raised hand no longer moves the video.
- Delete calls from your own history. Meeting links show how many people are inside and warn before closing a busy room.
- Coming back from another tab no longer leaves a shared screen stuck on "Playing in picture-in-picture".

### 🎨 Look and feel
- A design refresh across the app: Settings as section cards, a new admin panel with live CPU and memory charts.
- Persian (right to left) spacing fixed in the message box, side panels and badges; tooltips no longer go off the screen edge.
- Contacts on narrow screens keep names readable and open actions on tap, one row at a time.
- Dark accent colors stay readable, including icons on accent buttons.
- Every script, style, font and icon now comes from your own server; nothing is loaded from outside.
- The update notice checks again when you reconnect, come back to the app or get back online.

### 🛡 Admin and security
- The admin can **create users**, optionally forcing a new password on first sign-in, and sees the installed program's size.
- Rate limits for messages, uploads, meeting links, calls and TURN credentials. Changing a password signs out the account's other sessions.
- Channel subscribers no longer see each other in Contacts. Removing a member also takes them out of the chat's call.
- File retention can be 0 (keep forever). The upload limit set in the panel is the only limit (Nginx no longer caps it).

### ☁️ Hosting
- **One-click deploy on Railway and Render**: the server and the web app on one address, with the admin password asked for while deploying.
- Self-update on arm64 servers downloads the arm64 package.
