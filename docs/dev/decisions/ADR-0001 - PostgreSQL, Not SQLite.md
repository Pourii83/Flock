
# ADR-0001: PostgreSQL، نه SQLite

**وضعیت:** تصمیم گرفته شده ۲۰۲۶-۱۱-۰۲ · پیاده
**مرتبط:** [[ADR-0000 - The Decision Register]]

## مسئله
نسخه‌ی اول سرور SQLite داشت. کاربر آن را برای production کافی نمی‌دانست.

## تصمیم
- سرور با `pg` به PostgreSQL وصل می‌شود؛ migration ها داخل `server/src/db.js` در شروع اجرا می‌شوند.
- Docker: `postgres:17-alpine`. نصب بدون Docker: `install.sh` PostgreSQL سیستم را نصب و دیتابیس `flock` را می‌سازد.

## نتیجه
هر نصب یک سرویس PostgreSQL لازم دارد؛ در توسعه‌ی محلی فقط کانتینر `flock-postgres` روشن می‌شود.
