A small patch: the update changelog now follows the app's language, and release pages no longer repeat the version.

> **Upgrading:** run the installer again or install the new package (config and database are kept). Phones need this APK and the Windows app needs this installer for the new client code.

### 🌐 Changelog in your language
- When the app language is Persian, **What's new** after an update now shows the change list in Persian. The server package ships `RELEASE_NOTES.fa.md` next to the English notes and `/api/update` returns both; the client picks the one matching the app language.
- Markdown markers and links are cleaned up in the dialog.

### 🧹 Release housekeeping
- The release body starts with the summary instead of repeating the release title.
- The release workflow reads the curated `RELEASE_NOTES.md`, so re-pushing a tag can no longer add a second "Full Changelog" line.

**Full Changelog**: https://github.com/Pourii83/Flock/compare/v1.10.0...v1.10.1
