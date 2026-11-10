A large round of chat, call and server improvements, driven by live testing.

> **Upgrading:** run the installer again or install the new package (config and database are kept).
> Phones need this APK and the Windows app needs this installer to get the new screens.

### 💬 Message actions
- Right-click a message on desktop (or long-press it on a phone) for **Reply, Edit, Forward, Copy,
  Saved Messages, Delete and Pin**, with a quick emoji row and the full emoji picker.
- Pinned messages show in a banner above the conversation; edited messages get an "Edited" mark.
- Every message now shows its own time, and hover shows only Reply + More.
- On phones, long-press starts a **Telegram-style multi-select** with a top action bar; tapping the
  empty space beside a bubble opens the same menu.

### 🔎 Search, drafts and files
- Search inside the conversation from its header.
- Unsent text is kept per conversation when you switch chats.
- Pick, paste or drag any file: it is **staged with a preview and an optional caption**, then Send
  (with an upload progress bar) or Cancel. Large uploads no longer block the composer.
- Photos and videos show the file name and a download button on the image's top-right, with the
  caption underneath.

### 📞 Calls
- **Per-device microphone levels**, camera switching when several cameras exist, and dock controls
  ordered microphone → speaker → camera.
- The speaker button **mutes all call audio**; per-person volume still lives in its panel.
- **Raise hand** in group calls (with a "raised a hand" banner), ✨ reaction, and reaction/call-chat
  sounds with a mute toggle.
- Clear guidance when the mic/camera is blocked, and tooltips on the call controls.
- The shared screen's **Full width** option hides the participant strip.
- A muted participant is marked with a mic-off badge on their tile.

### 🎨 App shell
- Sidebar: search icon and a merged "+" menu, right-click actions for chats, real pushpin for pinned
  chats, no duplicate count badge.
- App info dialog from the logo; Settings gained an **accent color** picker; the admin can rename the
  app and manage repository links.
- Update banner with clean release notes (no commit hashes); the admin can update the server to the
  latest GitHub release from the desktop rail or the phone header.
- Monochrome raise-hand icon so the call dock looks consistent.

### 🖥️ Server
- New message APIs (edit/delete/forward/pin/search) and file captions.
- Branding/update endpoints, release notes inside the server package, and an admin-only self-update
  that downloads the latest GitHub release and re-runs the installer.

**Full Changelog**: https://github.com/Pourii83/Flock/compare/v1.9.0...v1.10.0
