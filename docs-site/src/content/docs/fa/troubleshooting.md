---
title: "رفع اشکال"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.fa.md
---

<!-- Generated from README.fa.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

| مشکل | چه چیزی را بررسی کنید |
|---|---|
| سایت باز نمی‌شود | `systemctl status flock` یا `docker compose ps`. پورت 80/443 (یا 4000/8080) در فایروال شرکت میزبان باز است؟ |
| گواهی صادر نشد | رکورد A دامنه باید به همین سرور اشاره کند و پورت 80 باز باشد. بعد دوباره: `sudo certbot --nginx -d chat.example.com --redirect` (داکر: `docker compose logs caddy`) |
| مرورگر دوربین یا میکروفون را مسدود می‌کند | وب‌اپ باید با **https://** باز شود |
| تماس وصل می‌شود ولی صدا یا تصویر ندارد | [رله‌ی TURN](/fa/calls/) اضافه کنید |
| فایل‌های بزرگ آپلود نمی‌شوند | محدودیت در **تنظیمات برنامه** است. پشت Nginx، `client_max_body_size` باید کمی بزرگ‌تر باشد (نصب‌کننده از روی جواب شما تنظیمش می‌کند). در داکر، `apps/client/nginx.conf` را ویرایش کنید |
| اپ‌ها می‌گویند سرور در دسترس نیست | آدرس کامل با `https://` را بدهید و مطمئن شوید `CORS_ORIGIN` برابر `*` است |
| مشکل دیگر | لاگ‌ها: `journalctl -u flock -n 100` یا `docker compose logs server` |
