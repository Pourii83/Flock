// Language switch (English in the HTML, Persian here) and the copy button.
const FA = {
  brand: 'فلاک',
  'nav.features': 'امکانات',
  'nav.demo': 'دمو',
  'nav.docs': 'مستندات',
  'hero.eyebrow': 'پیام‌رسان فلاک',
  'hero.title1': 'با هم بمانید،',
  'hero.title2': 'هر کجا که هستید.',
  'hero.lead': 'گفتگو، تماس صوتی و تصویری، اشتراک صفحه و لینک جلسه، روی سروری که خودتان راه می‌اندازید. یک برنامه برای اندروید، ویندوز و وب.',
  'hero.demo': 'دموی زنده را امتحان کنید',
  'hero.docs': 'مستندات',
  'hero.fine': 'برای دمو نصب لازم نیست. داده‌هایش هر روز پاک می‌شود.',
  'mock.group': 'سفر آخر هفته',
  'mock.members': '۴ عضو · ۲ نفر آنلاین',
  'mock.call': 'تماس',
  'mock.m1': 'کی پایه‌ی شنبه‌ست؟',
  'mock.m2': 'من! الان مسیر رو می‌فرستم 🗺️',
  'mock.m3': 'یه تماس کوتاه بگیریم؟',
  'mock.huddle': 'تماس تصویری · ۳ نفر',
  'mock.join': 'پیوستن',
  'mock.input': 'پیام…',
  'features.title': 'هر چیزی که یک گروه کوچک لازم دارد',
  'features.lead': 'برای دوستان، خانواده‌ها و تیم‌هایی که می‌خواهند گفتگوهایشان دست خودشان باشد.',
  'f1.t': 'گفتگو و گروه',
  'f1.d': 'پیام لحظه‌ای، پاسخ، واکنش، فایل و تیک خوانده‌شدن. گروه با مالک و ادمین.',
  'f2.t': 'گفتگوی محرمانه',
  'f2.d': 'رمزنگاری سرتاسری اختیاری. سرور فقط متن رمزشده را می‌بیند.',
  'f3.t': 'تماس صوتی و تصویری',
  'f3.d': 'دونفره یا گروهی، با اشتراک صفحه، حذف نویز و چت داخل تماس.',
  'f4.t': 'لینک جلسه',
  'f4.d': 'لینک را بفرستید؛ هر کسی از مرورگر وارد می‌شود، حتی بدون حساب.',
  'f5.t': 'سرور خودتان',
  'f5.d': 'نصب با داکر یا یک اسکریپت. پیام‌ها و فایل‌ها همان‌جایی می‌مانند که شما می‌خواهید.',
  'f6.t': 'همه‌ی دستگاه‌ها',
  'f6.d': 'اندروید، ویندوز و وب‌اپ نصب‌شدنی، با یک صندوق پیام زنده. فارسی و انگلیسی.',
  'demo.tag': 'دموی زنده',
  'demo.title': 'فلاک را در مرورگر امتحان کنید',
  'demo.lead': 'روی سرور دمو حساب بسازید، یک دوست را دعوت کنید و چند پیام بفرستید. آخرین نسخه روی آن اجرا می‌شود.',
  'demo.open': 'باز کردن دمو',
  'demo.reset.t': 'همه‌چیز هر روز پاک می‌شود',
  'demo.reset.d': 'همه‌ی حساب‌ها، پیام‌ها و فایل‌های دمو هر روز ساعت ۸ صبح به وقت تهران (۴:۳۰ UTC) حذف می‌شوند. چیزی آنجا نگه ندارید.',
  'demo.apps.t': 'با اپ اندروید یا ویندوز؟',
  'demo.apps.d': 'اپ را از صفحه‌ی ریلیزها دانلود کنید و این آدرس سرور را در صفحه‌ی ورود وارد کنید:',
  'demo.calls.t': 'تماس روی دمو',
  'demo.calls.d': 'دمو سرور رله ندارد، پس ممکن است تماس روی بعضی اینترنت‌های موبایل یا اداری وصل نشود. سرور خودتان می‌تواند رله داشته باشد.',
  copy: 'کپی',
  copied: 'کپی شد',
  'docs.title': 'خودتان راهش بیندازید',
  'docs.lead': 'مستندات نصب سرور، اتصال اپ‌ها، تماس بین شبکه‌ها و تنظیمات ادمین را توضیح می‌دهد.',
  'docs.open': 'رفتن به مستندات',
  'docs.download': 'دانلود اپ‌ها',
  'foot.license': 'منتشرشده با لایسنس Source-Available فلاک.',
};

const nodes = [...document.querySelectorAll('[data-i18n]')];
const EN = new Map(nodes.map((n) => [n, n.textContent]));
const EN_TITLE = document.title;
const btn = document.getElementById('lang');

function apply(lang) {
  const fa = lang === 'fa';
  document.documentElement.lang = fa ? 'fa' : 'en';
  document.documentElement.dir = fa ? 'rtl' : 'ltr';
  for (const n of nodes) n.textContent = fa ? FA[n.dataset.i18n] ?? EN.get(n) : EN.get(n);
  document.title = fa ? 'فلاک — گفتگو و تماس روی سرور خودتان' : EN_TITLE;
  btn.textContent = fa ? 'English' : 'فارسی';
  try { localStorage.setItem('flock.site.lang', lang); } catch {}
}

let saved = null;
try { saved = localStorage.getItem('flock.site.lang'); } catch {}
const initial = saved || (/^fa\b/i.test(navigator.language || '') ? 'fa' : 'en');
if (initial === 'fa') apply('fa');
btn.addEventListener('click', () => apply(document.documentElement.lang === 'fa' ? 'en' : 'fa'));

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', async () => {
    const label = b.querySelector('.copy-label');
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      const fa = document.documentElement.lang === 'fa';
      label.textContent = fa ? FA.copied : 'Copied';
      setTimeout(() => { label.textContent = fa ? FA.copy : 'Copy'; }, 1600);
    } catch {}
  });
}
