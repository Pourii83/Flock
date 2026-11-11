---
title: "تماس بین شبکه‌های مختلف (TURN)"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.fa.md
---

<!-- Generated from README.fa.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

تماس‌ها مستقیم بین دستگاه‌ها وصل می‌شوند. وقتی هر دو طرف پشت NAT سخت‌گیر هستند (اینترنت موبایل، شبکه‌ی اداره)، اتصال مستقیم ممکن نیست و یک **رله‌ی TURN** صدا و تصویرِ رمزشده را جابه‌جا می‌کند. بدون آن، این تماس‌ها زنگ می‌خورند و «وصل» می‌شوند ولی صدا و تصویر ندارند.

- **روش ۲ و ۳:** وقتی نصب‌کننده درباره‌ی رله‌ی TURN پرسید، «y» بزنید (یا `--turn` بدهید). coturn را نصب می‌کند، پورت‌هایش را باز می‌کند و `TURN_URLS` و `TURN_SECRET` را می‌نویسد. پورت‌های 3478، 5349 و 49160 تا 49200/udp را در فایروال شرکت میزبان هم باز کنید.
- **داکر، یا رله روی یک سرور دیگر** (مثلاً [eturnal](https://eturnal.net) که روی ویندوز هم اجرا می‌شود): `TURN_URLS` (یا `TURN_EXTRA_URLS`) و `TURN_SECRET` را برابر آدرس و رمز مشترک رله بگذارید.

رله فقط ترافیک رمزشده‌ی تماس را می‌بیند. جزئیات بیشتر در [deploy/INSTALL.md](https://github.com/Pourii83/Flock/blob/main/deploy/INSTALL.md#turn-server-for-calls).
