# Commands

From the repository root in Git Bash unless noted.

## Local development

```bash
docker start flock-postgres          # only the database; the rest of docker-compose stays off
node server/src/index.js             # API on :4000
cd apps/client && npx expo start --web --port 8090
```

Metro runs on 8090 because 8081 is often taken (Battle.net on the maintainer's PC).

## Checks

```bash
cd apps/client && npx tsc --noEmit -p . && npx eslint src --quiet
```

## Server package

```bash
bash scripts/package-server.sh x64 vX.Y.Z      # → dist/flock-server-linux-x64.tar.gz (+ .sha256)
```

The release notes for the in-app changelog come from `RELEASE_NOTES.md` / `RELEASE_NOTES.fa.md` (falling back to
commit subjects). Deploying a package is done by the maintainer.

## Android (only when the maintainer asks)

```bash
JAVA_HOME="<path to JDK 21>" ANDROID_HOME="<path to Android SDK>" bash scripts/build-android.sh
```

Output `dist/flock-<version>.apk`; the version comes from `apps/client/app.json` (`version` and
`android.versionCode`). Release APKs are signed with the maintainer's key, which is not in the repo.
If a previous build was interrupted, stop the `java` processes (Gradle daemons) first; otherwise prebuild finds
the `android` folder locked (EBUSY) and the build quietly ends incomplete.

## Windows

```bash
cd apps/desktop && NODE_ENV=production npm run dist:win
```

Output `apps/desktop/release/Flock Setup <version>.exe`; the version comes from `apps/desktop/package.json`.

## Release on GitHub (maintainer)

Before the tag, write `RELEASE_NOTES.md` (and `RELEASE_NOTES.fa.md`) in the repo root for the new version; the
release body is read from it. Don't repeat the version in the body.

```bash
git tag vX.Y.Z && git push origin vX.Y.Z      # GitHub Actions builds the server packages
gh release upload vX.Y.Z dist/flock-X.Y.Z.apk dist/flock-X.Y.Z-windows-setup.exe (+ .sha256)
```

Version scheme: new capabilities bump MINOR, fixes bump PATCH. Bump `apps/client/app.json` (`version` +
`android.versionCode`, e.g. 1.10.1 → 11001) and `apps/desktop/package.json`.
