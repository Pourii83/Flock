---
title: "شروع سریع"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.fa.md
---

<!-- Generated from README.fa.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

روی یک سرور تازه‌ی Ubuntu یا Debian که دامنه‌اش به آن اشاره می‌کند:

```bash
curl -fsSL https://raw.githubusercontent.com/Pourii83/Flock/main/deploy/install.sh | sudo bash
```

اسکریپت دامنه، رله‌ی TURN برای تماس، حساب ادمین و بقیه را می‌پرسد و قبل از نصب خلاصه‌ای برای تأیید نشان می‌دهد. بعد `https://chat.example.com` را باز کنید، وارد حساب ادمین شوید و آدرس را برای دوستانتان بفرستید.

بعداً هر وقت خواستید، با `sudo flockctl` روی سرور همین اسکریپت به‌صورت منو دوباره باز می‌شود: به‌روزرسانی، وضعیت، راه‌اندازی دوباره، لاگ‌ها، رمز ادمین، میرورهای دانلود و حذف ([بیشتر](/fa/install/script/#مدیریت-سرور-flockctl)). روش‌های دیگر و جزئیات در ادامه آمده است.
