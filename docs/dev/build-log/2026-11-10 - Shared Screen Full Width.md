
# Shared screen full width

Pushed to `main` as `827c5c7` and deployed to production (2026-11-10). No version bump or tag.

- The focused shared screen gets a **Full width** pill next to the minimize button. It unmounts the
  participant strip (a right-hand rail on desktop, a bottom strip on phones), drops the stage padding and
  border, and lets the stream take the whole stage. **Show participants** restores the previous layout.
- The choice is remembered per sharer: closing the screen or a different person sharing returns to the
  normal layout.
- Persian: «تمام عرض» for the new string; the existing «نمایش افراد داخل تماس» is reused for the way back.

## Validation

- `npx tsc --noEmit -p .` and `npx eslint src --quiet` in `apps/client`: clean.
- Expo web export into `apps/desktop/web-dist`: clean.
- Two-instance Electron E2E (Playwright + the real `apps/desktop` app, fake media, two accounts, voice
  call, screen share; the harness is kept outside the repo):
  - wide (1424 px window): stage video **1190 px → 1424 px**, participant tiles **1 → 0**, restore returns both;
  - narrow (744 px window): stage video height **546 px → 648 px**, tiles hidden, restore works;
  - the sharer's own view has the same control.
- Gotcha for the harness: the environment here sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as
  plain Node and crash in `main.js`; remove it from the child environment. Two app instances coexist when each
  gets its own `--user-data-dir` despite the single-instance lock.

## Note

The app version badge still said v1.9.0 because `app.json` was not bumped; the 1.9.0 Windows installer and APK did
not carry the feature.
