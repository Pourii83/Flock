---
title: "توسعه"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.fa.md
---

<!-- Generated from README.fa.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

پیش‌نیاز: Node 22.13 به بالا و PostgreSQL (یا `docker run -d -p 5433:5432 -e POSTGRES_USER=flock -e POSTGRES_PASSWORD=flock -e POSTGRES_DB=flock postgres:17-alpine`).

```bash
# سرور (پیش‌فرض: postgres://flock:flock@localhost:5433/flock)
cd server && npm install && npm run seed && npm run dev

# کلاینت وب
cd apps/client && npm install
npx expo start --web
```

```
apps/
  client/    اپ Expo (expo-router) ← وب/PWA و اندروید
  desktop/   پوسته‌ی Electron دور نسخه‌ی وب (نصب‌کننده‌ی ویندوز)
server/      Express و Socket.IO و PostgreSQL
deploy/      install.sh، uninstall.sh، سرویس systemd، Caddyfile، INSTALL.md
scripts/     package-server.sh (بسته‌ی آفلاین سرور)، build-android.sh
```

- **بسته‌ی سرور:** `scripts/package-server.sh x64` (یا `arm64`) فایل `dist/flock-server-linux-x64.tar.gz` را می‌سازد. با push کردن یک تگ مثل `v1.7.0`، گیت‌هاب اکشنز هر دو را می‌سازد و به ریلیز اضافه می‌کند.
- **اندروید:** به‌صورت محلی با Gradle ساخته و با کلید خودتان امضا می‌شود: `scripts/build-android.sh` (به Android SDK و JDK 21 نیاز دارد). تماس فقط در بیلد واقعی کار می‌کند و Expo Go تماس ندارد.
- **ویندوز:** `cd apps/desktop && npm install && npm run dist:win`.
- **PWA دمو:** با push کردن تگ ریلیز، `.github/workflows/deploy-pwa.yml` هم اجرا می‌شود و برنچ `pwa` را به همان ریلیز می‌برد. Vercel این برنچ را با `scripts/build-pwa.sh` می‌سازد. آدرس سرور دمو متغیر `PWA_API_URL` در پروژه‌ی Vercel است و فقط داخل همین بیلد قرار می‌گیرد؛ اپ‌های اندروید و ویندوز هیچ سرور پیش‌فرضی ندارند.
