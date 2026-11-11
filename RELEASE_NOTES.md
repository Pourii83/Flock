Channels and invite links, a calmer call screen on phones, and a round of polish across the app.

> **Upgrading:** run the installer again or install the new package (config and database are kept). Phones need this APK and the Windows app needs this installer for the new client code. The server migrates its database by itself on start.

### 📣 Channels
- **New channel** from the "+" menu: a broadcast chat where only the owner and admins can post, pin and forward. Everyone else reads and reacts.
- Subscribers don't see each other: they only see the owner and admins, plus the subscriber count.
- Channels have their own filter in the chat list, a megaphone badge on the avatar, and no call button. Groups now use their first letter as a picture, with a small two-people badge.

### 🔗 Invite links for groups and channels
- Admins and the owner can create an invite link in the info panel and copy it. People open it, see the group or channel, and join in one tap. Opened while signed out, it waits until you have signed in.
- Only the owner can **revoke** the link or replace it with a new one, any time. A revoked link stops working immediately.

### 🎥 Video, calls and phones
- Video attachments show a real preview frame in the size of the video, and play by streaming (seeking works, nothing is downloaded up front). The file name is no longer repeated under photos and videos without a caption.
- Video calls on Android use the whole screen: the status bar and navigation buttons hide, and swiping from an edge shows them over the app. (Needs this APK.)
- Your own preview in a call is positioned with a real layout position, which fixes it staying blank on some Samsung phones after dragging was added.
- Meeting links work for two guests: guests now get the TURN relay too.
- The mic, speaker and call-quality menus open right above their own buttons.

### 🎨 Look and feel
- Pick any theme color with a color wheel, besides the presets and a hex code. Changing color, theme or language keeps you where you were in Settings instead of flashing the home screen.
- The chat list column can be resized by dragging its edge (300–520 px) and Calls and Contacts share its width. Less empty space under lists, and titles, segment buttons and the "+" menu no longer get clipped in Persian.
- Persian placeholders in the message box read right-to-left.
- The project link always points to the main repository; the admin setting is now an **update mirror**, used only for checking and downloading updates.

### 🛠 Server
- Admin self-update runs through a root systemd path unit, so it works under the service's hardening, and refuses a package without a verified checksum.
- Calls tab badges count only calls you haven't looked at yet.

**Full Changelog**: https://github.com/Pourii83/Flock/compare/v1.10.1...v1.11.0
