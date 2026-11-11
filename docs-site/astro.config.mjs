// Flock documentation — https://docs.flock.beer (GitHub Pages, .github/workflows/docs.yml).
// Pages under src/content/docs are generated from README.md / README.fa.md by scripts/sync-readme.py;
// demo.md (both languages) is written by hand.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const t = (en, fa) => ({ label: en, translations: { fa } });

// Screenshots load from Cloudflare R2 (flock.iranset.online). data-fallback lists the next sources,
// space-separated: Arvan Object Storage, then the docs site's own copy. An image moves to the next
// source when it errors or hasn't finished loading within 4 s of starting on its current one.
const imageFallback = `(() => {
  const WAIT = 4000;
  const loaded = (img) => img.complete && img.naturalWidth > 0;
  const watch = (img) => {
    clearTimeout(img._fallbackTimer);
    img._fallbackTimer = setTimeout(() => { if (!loaded(img)) next(img); }, WAIT);
  };
  const next = (img) => {
    const rest = (img.dataset.fallback || '').split(' ').filter(Boolean);
    if (!rest.length) return;
    img.dataset.fallback = rest.slice(1).join(' ');
    img.src = rest[0];
    watch(img);
  };
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.dataset.fallback) next(t);
  }, true);
  const start = () => {
    for (const img of document.querySelectorAll('img[data-fallback]')) if (!loaded(img)) watch(img);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

export default defineConfig({
  site: 'https://docs.flock.beer',
  integrations: [
    starlight({
      title: { en: 'Flock Docs', fa: 'مستندات فلاک' },
      description: 'Install and run Flock, a self-hosted messenger with chats and calls.',
      logo: { src: './src/assets/flock-mark.png' },
      favicon: '/favicon.png',
      customCss: ['./src/styles/flock.css'],
      head: [{ tag: 'script', content: imageFallback }],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Pourii83/Flock' },
      ],
      editLink: { baseUrl: 'https://github.com/Pourii83/Flock/edit/main/' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fa: { label: 'فارسی', lang: 'fa', dir: 'rtl' },
      },
      sidebar: [
        {
          ...t('Start here', 'شروع'),
          items: [
            { ...t('Introduction', 'معرفی'), link: '/' },
            { ...t('Try the demo', 'امتحان دمو'), link: '/demo/' },
            { ...t('Quick start', 'شروع سریع'), link: '/quick-start/' },
          ],
        },
        {
          ...t('Install the server', 'نصب سرور'),
          items: [
            { ...t('Choosing a method', 'انتخاب روش'), link: '/install/' },
            { ...t('Docker', 'داکر'), link: '/install/docker/' },
            { ...t('Install script', 'اسکریپت نصب'), link: '/install/script/' },
            { ...t('Offline install', 'نصب آفلاین'), link: '/install/offline/' },
            { ...t('After installing', 'بعد از نصب'), link: '/after-installing/' },
          ],
        },
        {
          ...t('Run it', 'راه‌اندازی'),
          items: [
            { ...t('Configuration', 'تنظیمات'), link: '/configuration/' },
            { ...t('Calls across networks', 'تماس بین شبکه‌ها'), link: '/calls/' },
            { ...t('Apps', 'اپ‌ها'), link: '/apps/' },
            { ...t('Troubleshooting', 'رفع اشکال'), link: '/troubleshooting/' },
          ],
        },
        {
          ...t('More', 'بیشتر'),
          items: [
            { ...t('Privacy and encryption', 'حریم خصوصی و رمزنگاری'), link: '/privacy/' },
            { ...t('Development', 'توسعه'), link: '/development/' },
            { ...t('License', 'لایسنس'), link: '/license/' },
          ],
        },
      ],
    }),
  ],
});
