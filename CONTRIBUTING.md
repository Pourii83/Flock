# Contributing to Flock

Thanks for helping Flock grow! Bug reports, ideas, translations, design feedback and code are all welcome.

## License: please read first

Flock is **source-available**, not open source. Under the [Flock Source-Available License](LICENSE):

- ✅ You can read the code, run Flock for yourself or your organization, and fork the repository **to prepare contributions**.
- ❌ You can't republish, redistribute, sell or rebrand Flock or derivatives, publish them on app stores, or offer them as a service.
- By opening a pull request you grant the project owner the rights described in **section 3 (Contributions)** of the license.

## How to contribute

1. Open an issue first for larger changes so we can agree on the approach.
2. Fork the repo and create a branch from `main`.
3. Follow the setup in the [README](README.md#local-development).
4. Before opening a PR, run in `apps/client`:
   ```bash
   npx tsc --noEmit
   npx expo lint
   ```
5. Keep the UI consistent with the existing design system (`src/theme.ts`) and make sure new text is translatable (English and Persian).
6. Open a pull request describing **what** changed and **why**, with screenshots for UI changes.

## Reporting security issues

Please don't open public issues for security problems. Contact the maintainer privately via [github.com/Pourii83](https://github.com/Pourii83).
