# Composer and call controls

Implemented in the working tree, not committed or deployed:

- Empty composer uses one line, centered controls, and grows/shrinks with text.
- Audio settings expose local per-participant volume at 0/25/50/75/100 percent; web audio element and native remote audio track gain are both wired.
- WebRTC audio levels drive theme amber speaking borders with a short hold; energy deltas are used when instantaneous levels are unavailable. Media renderers are not restarted for indicator changes.
- Focused sharing leaves a fixed 76-pixel, independently scrollable participant rail on the right.
- Installed clients start with an empty server address. Explicitly saved addresses remain; hosted web retains its existing origin behavior. The production URL was removed from the Android build defaults.

Validation: npm run typecheck, npm run lint, Expo web export, and git diff --check passed. Live multi-device calls and physical Android behavior remain untested.

At the user's request, built Android release (arm64-v8a + armeabi-v7a) and Windows x64 NSIS installer with the amber speaking indicator. Review artifacts kept version 1.6.0 and were separate from the published release files.

Android build completed successfully; Windows packaging completed successfully. SHA256 sidecars accompany the review artifacts. No deployment or GitHub publication performed.

