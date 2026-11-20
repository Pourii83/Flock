Push notifications, a redesigned look, one-click cloud hosting and two rounds of feedback from people using Flock every day.

> **Upgrading:** run the installer again or install the new package (config and database are kept). Phones need this APK and the Windows app needs this installer for the new client code. The server migrates its database by itself on start. Changing your password now signs your other devices out.

### 🔔 Notifications and voice
- **Push notifications** reach phones and browsers even when Flock is closed (Web Push).
- Voice messages show a **waveform** that fills smoothly while playing. Hold to record on phones.
- **One voice player** on the web keeps playing while you move between chats, with ±10 s, mute and a 0.5×–2.5× speed slider.

### 💬 Chat
- **Block** someone in a one-to-one chat.
- **Group and channel owners can delete other people's messages**, after a warning naming the sender.
- Files in **secret chats**, encrypted on the device. Files are captioned right in the message box.
- Selection mode shows a tick on every picked message. An arrow takes you back to the newest messages.
- Chat preview on Alt+click (web) and long-press (phones), with pin, mute and mark as read. Pinned chats can be reordered.
- Shared media, files and links in chat info, with "Show in chat" on every item.

### 📞 Calls
- On phones, calls float in **picture-in-picture** when you leave the app (Android) and use a labelled control dock.
- The in-call chat pins to the side on wide screens. Delete calls from your own history.
- Meeting links show how many people are inside and warn before closing a busy room.
- Coming back from another tab no longer leaves a shared screen stuck on "Playing in picture-in-picture".

### 🎨 Look and feel
- A design refresh across the app: Settings as section cards, a new admin panel with live CPU and memory charts.
- Contacts on narrow screens keep names readable and open actions on tap, smoothly, one row at a time.
- Dark accent colors stay readable, including icons on accent buttons.
- The update notice checks again when you reconnect, come back to the app or get back online.

### 🛡 Admin and security
- The admin can **create users**, optionally forcing a new password on first sign-in, and sees the installed program's size.
- Rate limits for messages, uploads, meeting links, calls and TURN credentials. Sessions are revoked when the password changes.
- Channel subscribers no longer see each other in Contacts. Removing a member also takes them out of the chat's call.
- File retention can be 0 (keep forever). The upload limit set in the panel is the only limit (Nginx no longer caps it).

### ☁️ Hosting
- **One-click deploy on Railway and Render**: the server and the web app on one address, with the admin account asked for while deploying.
- Self-update on arm64 servers downloads the arm64 package.
