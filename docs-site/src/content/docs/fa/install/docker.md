---
title: "روش ۱: داکر"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.fa.md
---

<!-- Generated from README.fa.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

**پیش‌نیاز:** Docker Engine نسخه‌ی 24 به بالا با افزونه‌ی Compose، و `git`.

**قدم ۱: نصب داکر.** اگر `docker compose version` جواب می‌دهد، این قدم را رد کنید:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

**قدم ۲: دریافت فلاک**

```bash
git clone https://github.com/Pourii83/Flock.git
cd Flock
```

**قدم ۳: تنظیمات**

```bash
cp .env.example .env
nano .env
```

دست‌کم این مقدارها را تنظیم کنید:

| متغیر | چه بنویسید |
|---|---|
| `JWT_SECRET` | یک رشته‌ی تصادفی بلند. دستور `openssl rand -hex 32` را اجرا کنید و خروجی را بگذارید |
| `POSTGRES_PASSWORD` | یک رمز قوی برای دیتابیس |
| `DOMAIN` | دامنه‌ی شما، مثلاً `chat.example.com` (فقط برای HTTPS در قدم ۴) |

**قدم ۴: اجرا**

با HTTPS (پیشنهادی). به `DOMAIN`، تنظیم DNS و پورت‌های 80 و 443 نیاز دارد:

```bash
docker compose --profile https up -d --build
```

بدون دامنه (برای آزمایش در شبکه‌ی محلی):

```bash
docker compose up -d --build
```

ساخت اول چند دقیقه طول می‌کشد. بعد بررسی کنید همه‌چیز بالا آمده باشد:

```bash
docker compose ps        # همه‌ی سرویس‌ها باید running یا healthy باشند
```

**قدم ۵: ساخت حساب ادمین.** رمز را می‌پرسد (حداقل ۸ کاراکتر). مثل همه‌ی رمزها، فقط هش bcrypt آن ذخیره می‌شود:

```bash
docker compose exec server node src/create-admin.js admin
```

**قدم ۶: باز کردن:** `https://chat.example.com` (با HTTPS) یا `http://<IP-سرور>:8080` (بدون آن). با حساب `admin` وارد شوید.

<details>
<summary>به‌روزرسانی، پشتیبان‌گیری و حذف (داکر)</summary>

```bash
# به‌روزرسانی به آخرین نسخه
git pull
docker compose --profile https up -d --build      # اگر HTTPS ندارید، --profile https را حذف کنید

# پشتیبان از دیتابیس
docker compose exec db pg_dump -U flock flock > flock-backup.sql

# بازگردانی پشتیبان
docker compose exec -T db psql -U flock flock < flock-backup.sql

# لاگ‌ها
docker compose logs -f server

# توقف و حذف کانتینرها (داده‌ها می‌مانند)
docker compose --profile https down
# ...و حذف همه‌ی داده‌ها (دیتابیس، فایل‌ها، گواهی‌ها)
docker compose --profile https down -v
```

</details>
