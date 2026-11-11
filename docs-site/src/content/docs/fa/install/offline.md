---
title: "روش ۳: اسکریپت نصب، آفلاین"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.fa.md
---

<!-- Generated from README.fa.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

وقتی سرور نمی‌تواند از گیت‌هاب دانلود کند (اینترنت ندارد یا گیت‌هاب فیلتر است) از این روش استفاده کنید.

**قدم ۱: بسته را روی یک کامپیوتر دیگر دانلود کنید**، از [Releases](https://github.com/Pourii83/Flock/releases):

- `flock-server-linux-x64.tar.gz` (بیشتر سرورها) یا `flock-server-linux-arm64.tar.gz` (سرورهای ARM). با `uname -m` بررسی کنید.
- فایل `.sha256` همان بسته (اختیاری، برای بررسی سالم بودن دانلود)

**قدم ۲: فایل‌ها را به سرور ببرید**، مثلاً:

```bash
scp flock-server-linux-x64.tar.gz* user@your-server:~
```

**قدم ۳: بررسی و باز کردن بسته**

```bash
sha256sum -c flock-server-linux-x64.tar.gz.sha256     # باید OK چاپ کند
tar -xzf flock-server-linux-x64.tar.gz
```

**قدم ۴: مطمئن شوید PostgreSQL در دسترس است.** بسته همه‌چیز را دارد به جز دیتابیس. یکی از این راه‌ها:

- بگذارید نصب‌کننده PostgreSQL را نصب کند. این کار به منابع بسته‌ی سیستم‌عامل (`apt`/`dnf`) نیاز دارد که اغلب حتی وقتی گیت‌هاب در دسترس نیست کار می‌کنند.
- خودتان از یک منبع یا آینه‌ی محلی نصبش کنید (`sudo apt install postgresql` یا `sudo dnf install postgresql-server`).
- در قدم بعد با `--db-url postgres://user:pass@host:5432/flock` به یک دیتابیس موجود وصل شوید.

**قدم ۵: نصب**

```bash
sudo ./flock-server/install.sh --domain chat.example.com
```

همان سؤال‌ها و گزینه‌های [روش ۲](/fa/install/script/) را دارد. `--domain` به دسترسی سرور به Let's Encrypt نیاز دارد. بدون آن، فلاک روی `http://<IP-سرور>:4000` در دسترس است.

**به‌روزرسانی:** بسته‌ی جدید را به همین شکل دانلود کنید و `install.sh` آن را اجرا کنید. تنظیمات و دیتابیس می‌مانند. حذف هم مثل روش ۲ است.

برای نصب کاملاً دستی (بدون اسکریپت)، [deploy/INSTALL.md](https://github.com/Pourii83/Flock/blob/main/deploy/INSTALL.md#option-3-manual-install-step-by-step) را ببینید.
