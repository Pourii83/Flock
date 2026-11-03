import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { fonts, type } from '@/theme';
import { getItem, setItem } from './storage';

export type Lang = 'en' | 'fa';
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'فارسی' },
];

const LANG_KEY = 'flock.lang';

/**
 * English source text is the key, so untranslated strings fall back to English.
 * Placeholders use {name} and are filled from t()'s params.
 */
const fa: Record<string, string> = {
  // ----- brand & auth -----
  'Stay together, wherever you are': 'با هم بمانید، هر کجا که هستید',
  'Stay together,': 'با هم بمانید،',
  'wherever you are.': 'هر کجا که هستید.',
  'WORKPLACE & FLUID SYNC': 'پیام‌رسان همگام و روان',
  'FLOCK MESSENGER': 'پیام‌رسان فلاک',
  'Built for calm, focused conversations. Instant messages, live presence and one-tap video huddles with the people who matter.':
    'برای گفتگوهای آرام و متمرکز ساخته شده؛ پیام فوری، وضعیت آنلاین زنده و تماس تصویری با یک لمس، با آدم‌هایی که برایتان مهم‌اند.',
  'Private by design': 'خصوصی از پایه',
  'Your conversations stay between you and the people you talk to.': 'گفتگوهای شما فقط بین شما و طرف گفتگویتان می‌ماند.',
  'Instant video huddles': 'تماس تصویری فوری',
  'Jump from a chat into a crisp call with a single tap.': 'با یک لمس از گفتگو به یک تماس شفاف بروید.',
  'Every device, in sync': 'همه‌ی دستگاه‌ها، همگام',
  'Phone, web and desktop share one live inbox in real time.': 'گوشی، وب و دسکتاپ یک صندوق پیام زنده و همگام دارند.',
  'One codebase · Android · Web · Desktop': 'یک کد · اندروید · وب · دسکتاپ',
  'Flock Desktop & Web · v1.0': 'فلاک دسکتاپ و وب · نسخه ۱',
  'Secure session': 'نشست امن',
  'Welcome back to Flock': 'به فلاک خوش برگشتید',
  'Sign in to pick up right where you left off': 'وارد شوید و از همان‌جایی که بودید ادامه دهید',
  'FAST LOGIN': 'ورود سریع',
  'CREATE ACCOUNT': 'ساخت حساب',
  Username: 'نام کاربری',
  Password: 'رمز عبور',
  'your.username': 'نام.کاربری',
  'Toggle password visibility': 'نمایش یا پنهان کردن رمز',
  Continue: 'ادامه',
  'NEW TO FLOCK?': 'تازه‌وارد هستید؟',
  'Create an account': 'ساخت حساب کاربری',
  'Enter your username and password': 'نام کاربری و رمز عبور را وارد کنید',
  'Join Flock': 'به فلاک بپیوندید',
  'Create your account in a few seconds': 'در چند ثانیه حساب بسازید',
  'Your name': 'نام شما',
  'Maya Lin': 'مریم احمدی',
  'maya.lin': 'maryam.ahmadi',
  'At least 6 characters': 'حداقل ۶ کاراکتر',
  'Create account': 'ساخت حساب',
  'Already have an account?': 'حساب دارید؟',
  'Sign in': 'ورود',
  'Tell your flock your name': 'نام خود را بنویسید',
  'Pick a valid username': 'یک نام کاربری معتبر انتخاب کنید',
  'Password must be at least 6 characters': 'رمز عبور باید حداقل ۶ کاراکتر باشد',
  '3–24 letters, numbers, _ or .': '۳ تا ۲۴ حرف انگلیسی، عدد، _ یا .',
  Language: 'زبان',

  // ----- server address -----
  'Server address': 'آدرس سرور',
  'The address of your Flock server — ask whoever runs it.': 'آدرس سرور فلاک شما؛ از مدیر سرور بپرسید.',
  'That doesn’t look like a valid address.': 'این آدرس معتبر به نظر نمی‌رسد.',
  'Enter a valid server address, e.g. https://chat.example.com': 'یک آدرس معتبر وارد کنید، مثلاً https://chat.example.com',
  'Enter a valid server address.': 'یک آدرس سرور معتبر وارد کنید.',
  'That address is reachable but is not a Flock server.': 'این آدرس در دسترس است ولی سرور فلاک نیست.',
  "Can't reach {url}. Check the address and your connection.": 'اتصال به {url} ممکن نشد. آدرس و اینترنت خود را بررسی کنید.',
  "Can't reach the Flock server. Check your connection.": 'اتصال به سرور فلاک ممکن نشد. اینترنت خود را بررسی کنید.',
  'Changing the server signs you out so you can sign in there.': 'با تغییر سرور از حساب خارج می‌شوید تا در سرور جدید وارد شوید.',
  'Switch server': 'تغییر سرور',
  Server: 'سرور',

  // ----- server errors -----
  'Wrong username or password': 'نام کاربری یا رمز عبور اشتباه است',
  'That username is taken': 'این نام کاربری قبلاً گرفته شده',
  'Username must be 3–24 letters, numbers, _ or .': 'نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد، _ یا . باشد',
  'Not signed in': 'وارد حساب نشده‌اید',
  'Something went wrong': 'مشکلی پیش آمد',
  'Message is empty': 'پیام خالی است',
  'Message is too long': 'پیام خیلی طولانی است',
  'Pick at least one person': 'حداقل یک نفر را انتخاب کنید',
  'Conversation not found': 'گفتگو پیدا نشد',
  'Use a JPEG, PNG or WebP image': 'یک تصویر JPEG، PNG یا WebP انتخاب کنید',
  'Image is too large (max 5 MB)': 'تصویر خیلی بزرگ است (حداکثر ۵ مگابایت)',
  'No image received': 'تصویری دریافت نشد',
  'Request failed ({status})': 'درخواست ناموفق بود ({status})',

  // ----- navigation & shell -----
  Chats: 'گفتگوها',
  Calls: 'تماس‌ها',
  Contacts: 'مخاطبین',
  Settings: 'تنظیمات',
  WORKSPACE: 'فضای کار',
  Flock: 'فلاک',
  'Connected · Live sync': 'متصل · همگام‌سازی زنده',
  'Reconnecting…': 'در حال اتصال دوباره…',
  'Reconnecting to Flock…': 'در حال اتصال دوباره به فلاک…',
  Search: 'جستجو',
  'Your profile': 'پروفایل شما',
  'Clear search': 'پاک کردن جستجو',
  '{n} unread': '{n} خوانده‌نشده',

  // ----- chat list -----
  'New Chat': 'گفتگوی جدید',
  'New chat': 'گفتگوی جدید',
  'Search chats…': 'جستجوی گفتگوها…',
  'Search chats, messages, people…': 'جستجوی گفتگو، پیام و افراد…',
  All: 'همه',
  Unread: 'خوانده‌نشده',
  Groups: 'گروه‌ها',
  New: 'جدید',
  'Recent messages': 'پیام‌های اخیر',
  'typing…': 'در حال نوشتن…',
  'Say hello 👋': 'سلام کنید 👋',
  'No chats match your search.': 'گفتگویی با این جستجو پیدا نشد.',
  'Nothing here yet.': 'هنوز چیزی اینجا نیست.',
  'No conversations yet. Start one with someone from your flock.': 'هنوز گفتگویی ندارید. با یکی از هم‌گروهی‌هایتان شروع کنید.',
  'Start a chat': 'شروع گفتگو',
  'Find people': 'پیدا کردن افراد',
  'Select a conversation to start chatting': 'برای شروع، یک گفتگو را انتخاب کنید',
  'Send messages in real time, start instant Flock video huddles, or catch up with your teams.':
    'پیام فوری بفرستید، تماس تصویری بگیرید یا از کارهای تیمتان باخبر شوید.',
  'Private messaging · Flock Desktop': 'پیام‌رسانی خصوصی · فلاک دسکتاپ',

  // ----- thread -----
  Today: 'امروز',
  Yesterday: 'دیروز',
  now: 'الان',
  'Active now': 'آنلاین',
  Offline: 'آفلاین',
  'Last seen just now': 'همین الان آنلاین بود',
  'Last seen {time}': 'آخرین بازدید {time}',
  '{n} members': '{n} عضو',
  '{n} online': '{n} آنلاین',
  '{names} typing…': '{names} در حال نوشتن…',
  '{names} is typing…': '{names} در حال نوشتن است…',
  '{names} are typing…': '{names} در حال نوشتن هستند…',
  GROUP: 'گروه',
  Back: 'بازگشت',
  'Voice call': 'تماس صوتی',
  'Video call': 'تماس تصویری',
  Meet: 'تماس تصویری',
  'Toggle details': 'نمایش جزئیات',
  "Couldn't load messages.": 'بارگذاری پیام‌ها ناموفق بود.',
  Retry: 'تلاش دوباره',
  'Start the conversation': 'گفتگو را شروع کنید',
  'Say hi to {name} — messages appear here in real time.': 'به {name} سلام کنید؛ پیام‌ها همین‌جا لحظه‌ای نمایش داده می‌شوند.',
  Reply: 'پاسخ',
  Copy: 'کپی',
  'Replying to {name}': 'در پاسخ به {name}',
  You: 'شما',
  Someone: 'کسی',
  'Cancel reply': 'لغو پاسخ',
  More: 'بیشتر',
  Emoji: 'ایموجی',
  Send: 'ارسال',
  'Message {name}…': 'پیام به {name}…',
  'Type a message to {name}…': 'پیام خود را به {name} بنویسید…',
  'Press Return ↵ to send · Shift + Return for a new line': 'برای ارسال Enter بزنید · Shift + Enter برای خط جدید',
  'Not sent · tap to retry': 'ارسال نشد · برای تلاش دوباره بزنید',

  // ----- contact panel -----
  'Contact Info': 'اطلاعات مخاطب',
  'Group Info': 'اطلاعات گروه',
  'Close panel': 'بستن',
  Mute: 'بی‌صدا',
  Muted: 'بی‌صدا شده',
  Pin: 'سنجاق',
  Pinned: 'سنجاق‌شده',
  Call: 'تماس',
  Video: 'ویدیو',
  Members: 'اعضا',
  '(you)': '(شما)',
  'Private conversation': 'گفتگوی خصوصی',
  'Only members of this {kind} can read these messages. Calls are encrypted peer-to-peer with WebRTC.':
    'فقط اعضای این {kind} می‌توانند این پیام‌ها را بخوانند. تماس‌ها با WebRTC به‌صورت رمزنگاری‌شده برقرار می‌شوند.',
  group: 'گروه',
  chat: 'گفتگو',

  // ----- new chat -----
  Close: 'بستن',
  'Search people by name or @username': 'جستجوی افراد با نام یا نام کاربری',
  'Group name (optional)': 'نام گروه (اختیاری)',
  'Create group with {n} people': 'ساخت گروه با {n} نفر',
  'Message {name}': 'پیام به {name}',
  'Nobody found with that name.': 'کسی با این نام پیدا نشد.',
  'No one else has joined Flock yet. Invite a friend to register!': 'هنوز کس دیگری عضو نشده. دوستانتان را دعوت کنید!',
  'Tap a person to message them · tick several to start a group': 'برای پیام دادن روی یک نفر بزنید · برای ساخت گروه چند نفر را تیک بزنید',
  'Select {name}': 'انتخاب {name}',

  // ----- calls -----
  'All Calls': 'همه‌ی تماس‌ها',
  Missed: 'از دست رفته',
  Synced: 'همگام',
  'Start Flock Room': 'شروع اتاق فلاک',
  'Instant huddle with {name}': 'تماس فوری با {name}',
  'Start a chat first to call someone': 'برای تماس، اول یک گفتگو شروع کنید',
  'Voice huddle': 'تماس صوتی',
  'Video huddle': 'تماس تصویری',
  'Recent activity': 'فعالیت‌های اخیر',
  'End of recent history': 'پایان تاریخچه',
  'Call back': 'تماس دوباره',
  'New Call': 'تماس جدید',
  'No missed calls 🎉': 'تماس از دست رفته ندارید 🎉',
  'No calls yet. Start one from any chat.': 'هنوز تماسی ندارید. از هر گفتگو می‌توانید تماس بگیرید.',
  'Huddle up in one tap': 'تماس با یک لمس',
  'Start a crisp voice or video call from any conversation. Calls connect peer-to-peer over WebRTC.':
    'از هر گفتگو یک تماس صوتی یا تصویری شفاف شروع کنید. تماس‌ها مستقیم و با WebRTC برقرار می‌شوند.',
  'Open chats': 'رفتن به گفتگوها',
  Audio: 'صوتی',

  // ----- call screen -----
  'FLOCK HD VIDEO': 'تماس تصویری فلاک',
  'FLOCK VOICE': 'تماس صوتی فلاک',
  'Flock Video Calling': 'تماس تصویری فلاک',
  'Flock Voice Calling': 'تماس صوتی فلاک',
  'Ringing…': 'در حال زنگ خوردن…',
  "Can't talk right now": 'الان نمی‌توانم صحبت کنم',
  'Call you back?': 'بعداً تماس می‌گیرم',
  Decline: 'رد تماس',
  'Audio only': 'فقط صدا',
  Accept: 'پاسخ',
  Cancel: 'لغو',
  'Connecting…': 'در حال اتصال…',
  'HD Video': 'ویدیو HD',
  Voice: 'صوتی',
  Screen: 'اشتراک صفحه',
  'Your screen': 'صفحه‌ی شما',
  Microphone: 'میکروفون',
  Camera: 'دوربین',
  'Switch camera': 'تعویض دوربین',
  Speaker: 'بلندگو',
  'Share screen': 'اشتراک صفحه',
  'Hang up': 'قطع تماس',
  'Microphone access was blocked': 'دسترسی به میکروفون مسدود است',
  'Tap to play sound': 'برای پخش صدا بزنید',
  'Show or hide controls': 'نمایش یا پنهان کردن کنترل‌ها',
  'Call chat': 'چت تماس',
  'Messages disappear when the call ends.': 'پیام‌ها با پایان تماس پاک می‌شوند.',
  'No messages yet — say something!': 'هنوز پیامی نیست؛ چیزی بنویسید!',
  'Write a message…': 'پیام بنویسید…',
  'Your screen + audio': 'صفحه و صدای شما',
  'Noise cancellation': 'حذف نویز',
  'Noise cancellation: off': 'حذف نویز: خاموش',
  'Noise cancellation: standard': 'حذف نویز: معمولی',
  'Noise cancellation: strong (AI)': 'حذف نویز: قوی (هوش مصنوعی)',
  Off: 'خاموش',
  Standard: 'معمولی',
  'Strong (AI)': 'قوی (هوش مصنوعی)',
  'Removes keyboard, fan and street noise with an on-device AI filter. Your audio never leaves the call.':
    'صدای کیبورد، فن و خیابان را با یک فیلتر هوش مصنوعی روی خود دستگاه حذف می‌کند. صدای شما به هیچ سرویس دیگری ارسال نمی‌شود.',
  "Your device's built-in noise suppression.": 'حذف نویز داخلی خود دستگاه.',
  'Natural, unfiltered sound — best for music.': 'صدای طبیعی و بدون فیلتر؛ مناسب پخش موسیقی.',
  "Your browser can't keep the call out of system audio, so the screen is shared without sound. Share a tab to include its audio.":
    'مرورگر شما نمی‌تواند صدای تماس را از صدای سیستم جدا کند، برای همین صفحه بدون صدا به اشتراک گذاشته شد. برای اشتراک صدا، یک تب را انتخاب کنید.',
  "Your microphone isn't sending audio — check that it's connected and allowed.": 'صدای میکروفون شما ارسال نمی‌شود؛ وصل بودن و اجازه‌ی دسترسی میکروفون را بررسی کنید.',
  "Not receiving the other person's audio — their microphone may be off or blocked.": 'صدای طرف مقابل نمی‌رسد؛ ممکن است میکروفون او خاموش یا مسدود باشد.',
  'Camera is unavailable or access was blocked': 'دوربین در دسترس نیست یا دسترسی به آن مسدود است',
  'Audio/video needs the installed Flock app — Expo Go only supports call signaling.':
    'صدا و تصویر نیاز به نسخه‌ی نصبی فلاک دارد؛ Expo Go فقط برقراری تماس را پشتیبانی می‌کند.',

  // ----- contacts -----
  'Online — {n}': 'آنلاین — {n}',
  'Everyone — {n}': 'همه — {n}',
  'Nobody found.': 'کسی پیدا نشد.',
  'No one else is here yet — share Flock with your team!': 'هنوز کسی اینجا نیست؛ فلاک را با تیمتان به اشتراک بگذارید!',
  'Your flock, all in one place': 'همه‌ی هم‌گروهی‌ها در یک جا',
  'Everyone on this Flock server shows up here. Message them, or jump straight into a voice or video call.':
    'همه‌ی کاربران این سرور اینجا هستند. به آن‌ها پیام بدهید یا مستقیم تماس صوتی و تصویری بگیرید.',
  Message: 'پیام',

  // ----- settings -----
  Profile: 'پروفایل',
  About: 'درباره',
  'Display name': 'نام نمایشی',
  'Role / title': 'سمت / عنوان',
  'Creative Technologist': 'طراح خلاق',
  Bio: 'درباره‌ی من',
  'A few words about you': 'چند کلمه درباره‌ی خودتان',
  'Save changes': 'ذخیره‌ی تغییرات',
  'Name cannot be empty': 'نام نمی‌تواند خالی باشد',
  'Profile saved': 'پروفایل ذخیره شد',
  'Change profile photo': 'تغییر عکس پروفایل',
  'Remove photo': 'حذف عکس',
  'Could not update photo': 'به‌روزرسانی عکس ناموفق بود',
  Connection: 'اتصال',
  Live: 'برقرار',
  Platform: 'پلتفرم',
  'Web / Desktop': 'وب / دسکتاپ',
  Version: 'نسخه',
  'Sign out': 'خروج از حساب',
};

const dictionaries: Record<Lang, Record<string, string>> = { en: {}, fa };

// ---------- current language ----------

function deviceLang(): Lang {
  try {
    return getLocales()[0]?.languageCode === 'fa' ? 'fa' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = deviceLang();
const listeners = new Set<() => void>();

export const getLang = () => current;
export const isRTL = () => current === 'fa';
export const locale = () => (current === 'fa' ? 'fa-IR' : 'en-US');

export function t(key: string, params?: Record<string, string | number>) {
  let s = dictionaries[current][key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Localized digits for counts and badges. */
export const num = (n: number) => n.toLocaleString(locale());

// Persian text uses Vazirmatn (which also covers Latin); English keeps Inter.
const LATIN_FONTS = { ...fonts };
const FA_FONTS = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  semibold: 'Vazirmatn_600SemiBold',
  bold: 'Vazirmatn_700Bold',
} as const;
const LATIN_TYPE = Object.fromEntries(Object.entries(type).map(([k, v]) => [k, { fontFamily: v.fontFamily as string, letterSpacing: (v as { letterSpacing?: number }).letterSpacing }]));

function applyFonts(lang: Lang) {
  const map = lang === 'fa' ? FA_FONTS : LATIN_FONTS;
  Object.assign(fonts as Record<string, string>, map);
  for (const [k, v] of Object.entries(type)) {
    const latin = LATIN_TYPE[k]!;
    const weight = (Object.keys(LATIN_FONTS) as (keyof typeof LATIN_FONTS)[]).find((w) => LATIN_FONTS[w] === latin.fontFamily) ?? 'regular';
    const style = v as { fontFamily: string; letterSpacing?: number };
    style.fontFamily = map[weight];
    // Letter-spacing breaks Persian's joined letters.
    style.letterSpacing = lang === 'fa' ? 0 : latin.letterSpacing;
  }
}

function applyDocument(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
}

applyFonts(current);
applyDocument(current);

/** Loads the saved language (call once before first render). */
export async function loadLang() {
  const saved = (await getItem(LANG_KEY)) as Lang | null;
  if (saved === 'en' || saved === 'fa') setLangState(saved);
}

function setLangState(lang: Lang) {
  if (lang === current) return;
  current = lang;
  applyFonts(lang);
  applyDocument(lang);
  listeners.forEach((fn) => fn());
}

export async function setLang(lang: Lang) {
  setLangState(lang);
  await setItem(LANG_KEY, lang);
}

/** Re-renders when the language changes (the app root remounts on change). */
export function useLang() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLang,
    getLang,
  );
}
