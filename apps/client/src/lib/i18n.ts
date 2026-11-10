import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { fonts, type } from '@/theme';
import { brandText } from './brand';
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
  'Flock Desktop & Web · v{version}': 'فلاک دسکتاپ و وب · نسخه {version}',
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
  'Confirm password': 'تکرار رمز عبور',
  'Repeat your password': 'رمز عبور را دوباره وارد کنید',
  "Passwords don't match": 'رمزهای عبور یکسان نیستند',
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
  'Contacts — {n}': 'مخاطبین — {n}',
  Appearance: 'ظاهر',
  'Open until the host closes it': 'تا وقتی میزبان آن را ببندد باز است',
  'Link valid until {time}': 'لینک تا {time} معتبر است',
  'This meeting link is not valid': 'این لینک جلسه معتبر نیست',
  'Enter your name to join': 'برای ورود نام خود را وارد کنید',
  Meeting: 'جلسه',
  'Hosted by {name}': 'میزبان: {name}',
  'This meeting has ended': 'این جلسه تمام شده است',
  'You left the meeting.': 'از جلسه خارج شدید.',
  Rejoin: 'ورود دوباره',
  'How others will see you': 'دیگران شما را با این نام می‌بینند',
  'Join as {name}': 'ورود با نام {name}',
  'Join meeting': 'ورود به جلسه',
  'I have an account — sign in': 'حساب دارم؛ ورود',
  'Valid until {time}': 'معتبر تا {time}',
  'Open until you close it': 'تا وقتی خودتان ببندید باز است',
  'Meeting links': 'لینک‌های جلسه',
  'Anyone with the link can join, even without an account.': 'هر کسی لینک را داشته باشد می‌تواند وارد شود، حتی بدون حساب کاربری.',
  'New link': 'لینک جدید',
  'Meeting name (optional)': 'نام جلسه (اختیاری)',
  'Weekly sync': 'جلسه‌ی هفتگی',
  'Link stays valid for': 'مدت اعتبار لینک',
  'Create and copy link': 'ساخت و کپی لینک',
  Copied: 'کپی شد',
  'Copy link': 'کپی لینک',
  'Close room': 'بستن اتاق',
  '1 hour': '۱ ساعت',
  '1 day': '۱ روز',
  '7 days': '۷ روز',
  'Until I close it': 'تا وقتی خودم ببندم',
  'Copy meeting link': 'کپی لینک جلسه',
  'Weak connection': 'اتصال ضعیف',
  'Hide my video': 'پنهان کردن تصویر خودم',
  'Show my video': 'نمایش تصویر خودم',
  'Very weak connection': 'اتصال خیلی ضعیف',
  'Your connection is weak': 'اتصال شما ضعیف است',
  'Your connection is very weak': 'اتصال شما خیلی ضعیف است',
  'System default': 'پیش‌فرض سیستم',
  'System default ({name})': 'پیش‌فرض سیستم ({name})',
  '{d}d {h}h': '{d} روز {h} ساعت',
  '{h}h {m}m': '{h} ساعت {m} دقیقه',
  '{m}m': '{m} دقیقه',
  'App settings': 'تنظیمات برنامه',
  'Server-wide settings and usage': 'تنظیمات کلی سرور و میزان مصرف',
  'Only the server admin can do this': 'فقط ادمین سرور این دسترسی را دارد',
  Refresh: 'به‌روزرسانی',
  'Server usage': 'مصرف سرور',
  CPU: 'پردازنده',
  '{n} cores · load {load}': '{n} هسته · بار {load}',
  Memory: 'حافظه',
  'Flock uses {size}': 'سهم فلاک: {size}',
  Disk: 'دیسک',
  '{size} free': '{size} آزاد',
  'Flock data': 'داده‌های فلاک',
  'Database {db} · files {files}': 'دیتابیس {db} · فایل‌ها {files}',
  Users: 'کاربران',
  Messages: 'پیام‌ها',
  '{n} chats': '{n} گفتگو',
  'Files kept': 'فایل‌های نگه‌داری‌شده',
  'Live calls': 'تماس‌های فعال',
  '{n} people in calls': '{n} نفر در تماس',
  'Open meeting links': 'لینک‌های جلسه‌ی باز',
  Uptime: 'زمان کارکرد',
  'Version {v}': 'نسخه {v}',
  'Server up {time}': 'سرور روشن از {time} پیش',
  'Settings saved — they apply right away': 'تنظیمات ذخیره شد و همین حالا اعمال می‌شود',
  'Open sign-up': 'ثبت‌نام آزاد',
  'Anyone who can reach this server can create an account. Turn off to keep the server to existing accounts.': 'هر کسی به این سرور دسترسی داشته باشد می‌تواند حساب بسازد. با خاموش کردن، فقط حساب‌های فعلی می‌مانند.',
  'Guests in meetings': 'مهمان در جلسه‌ها',
  'People without an account can join meeting links.': 'افراد بدون حساب کاربری می‌توانند با لینک جلسه وارد شوند.',
  'Largest file people can send (MB)': 'بیشترین حجم فایل ارسالی (مگابایت)',
  '1 to 4096': 'بین ۱ تا ۴۰۹۶',
  'Behind Nginx, raise client_max_body_size too when going above 100 MB.': 'اگر پشت Nginx هستید، برای بیش از ۱۰۰ مگابایت مقدار client_max_body_size را هم بالا ببرید.',
  'Keep sent files for (days)': 'مدت نگه‌داری فایل‌ها (روز)',
  '1 to 365': 'بین ۱ تا ۳۶۵',
  'Server admin': 'ادمین سرور',
  'Sign-up is closed on this server': 'ثبت‌نام در این سرور بسته است',
  'Guests can’t join meetings on this server — sign in to join': 'در این سرور مهمان نمی‌تواند وارد جلسه شود؛ برای ورود، وارد حساب خود شوید',
  'Files can be up to {n} MB': 'حجم فایل حداکثر {n} مگابایت است',
  'File is too large': 'فایل بیش از حد بزرگ است',
  'Normal chat': 'چت معمولی',
  'Works on all your devices': 'روی همه‌ی دستگاه‌هایتان در دسترس است',
  'History, search and files': 'تاریخچه، جستجو و ارسال فایل',
  'Stored readable on the Flock server': 'روی سرور فلاک به‌صورت قابل خواندن ذخیره می‌شود',
  'Secret chat': 'چت مخفی',
  'End-to-end encrypted: the server only sees scrambled text': 'رمزنگاری سرتاسری: سرور فقط متن رمزشده را می‌بیند',
  'Safety code to verify': 'کد امنیتی برای تأیید',
  'Only on this device and one of theirs': 'فقط روی همین دستگاه و یکی از دستگاه‌های طرف مقابل',
  'Lost if you clear this browser or reinstall': 'با پاک کردن داده‌های مرورگر یا نصب دوباره از دست می‌رود',
  'No files yet': 'فعلاً ارسال فایل ندارد',
  'End-to-end encrypted. Only this device and {name}’s device can read these messages.': 'رمزنگاری سرتاسری. فقط همین دستگاه و دستگاه {name} این پیام‌ها را می‌توانند بخوانند.',
  'Waiting for {name} to accept on one of their devices. You can write once they do.': 'منتظر تأیید {name} روی یکی از دستگاه‌هایش. بعد از تأیید می‌توانید پیام بفرستید.',
  '{name} started a secret chat with you. It will be readable only on the device you accept it on.': '{name} یک چت مخفی با شما شروع کرده. فقط روی دستگاهی که آن را بپذیرید قابل خواندن است.',
  'This secret chat lives on another device. Open it there to read and write.': 'این چت مخفی روی دستگاه دیگری است. برای خواندن و نوشتن آن را همان‌جا باز کنید.',
  'Hide code': 'پنهان کردن کد',
  'Safety code': 'کد امنیتی',
  'Accept on this device': 'پذیرفتن روی این دستگاه',
  'Compare this code with {name} (in person or on a call). If it matches on both devices, nobody is in the middle.': 'این کد را با {name} مقایسه کنید (حضوری یا در تماس). اگر روی هر دو دستگاه یکی باشد، کسی در میانه نیست.',
  'Encrypted message — readable only on the device this secret chat lives on': 'پیام رمزشده؛ فقط روی دستگاهی که این چت مخفی روی آن است قابل خواندن است',
  'Encrypted message': 'پیام رمزشده',
  'Waiting for the other person to accept the secret chat': 'منتظر پذیرفتن چت مخفی توسط طرف مقابل',
  'Secret chats only accept encrypted messages': 'چت مخفی فقط پیام رمزشده می‌پذیرد',
  'Files are not available in secret chats yet': 'ارسال فایل در چت مخفی فعلاً ممکن نیست',
  'This secret chat was accepted on another device': 'این چت مخفی روی دستگاه دیگری پذیرفته شده',
  'You are already in a call': 'شما همین حالا در یک تماس هستید',
  'Pick how long the link stays valid': 'مدت اعتبار لینک را انتخاب کنید',
  Dark: 'تیره',
  Light: 'روشن',
  System: 'مطابق دستگاه',
  'Usernames are 3–24 letters, numbers, _ or .': 'نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد، _ یا . باشد',
  'People you chat or call with show up here. Start a new chat to find someone.': 'افرادی که با آن‌ها چت یا تماس داشته‌اید اینجا نمایش داده می‌شوند. برای پیدا کردن کسی، یک چت جدید شروع کنید.',
  'People you chat or call with show up here. Message them, or jump straight into a voice or video call.': 'افرادی که با آن‌ها چت یا تماس داشته‌اید اینجا هستند. به آن‌ها پیام بدهید یا مستقیم تماس صوتی یا تصویری بگیرید.',
  'Type at least {n} characters of a username to find someone.': 'برای پیدا کردن کسی، دست‌کم {n} کاراکتر از نام کاربری را بنویسید.',
  'Search by username to add someone new.': 'برای افزودن فرد جدید، نام کاربری‌اش را جستجو کنید.',
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

  // ----- groups -----
  'New group': 'گروه جدید',
  'Chat and call with several people': 'گفتگو و تماس با چند نفر',
  PEOPLE: 'افراد',
  'Step 1 of 2 · Add members': 'مرحله ۱ از ۲ · افزودن اعضا',
  'Next · {n} selected': 'بعدی · {n} نفر انتخاب شده',
  'Select at least one person': 'حداقل یک نفر را انتخاب کنید',
  'Step 2 of 2 · Group details': 'مرحله ۲ از ۲ · مشخصات گروه',
  'Group photo': 'عکس گروه',
  'Tap to change the photo': 'برای تغییر عکس لمس کنید',
  'Add a group photo (optional)': 'افزودن عکس گروه (اختیاری)',
  'Group name': 'نام گروه',
  'e.g. Design team': 'مثلاً تیم طراحی',
  'Description (optional)': 'توضیحات (اختیاری)',
  'What is this group about?': 'این گروه درباره چیست؟',
  'You will be the group owner and can make others admins.': 'شما مالک گروه خواهید بود و می‌توانید دیگران را ادمین کنید.',
  'Create group': 'ساخت گروه',
  'Give the group a name': 'برای گروه یک نام بگذارید',
  'Add members': 'افزودن عضو',
  'Add {n} to the group': 'افزودن {n} نفر به گروه',
  'Select people to add': 'افرادی را برای افزودن انتخاب کنید',
  'No one else to add yet.': 'فعلاً کس دیگری برای افزودن نیست.',
  'Remove {name}': 'حذف {name}',
  'Edit group': 'ویرایش گروه',
  Owner: 'مالک',
  Admin: 'ادمین',
  'Make admin': 'ادمین کردن',
  'Remove admin': 'برداشتن ادمین',
  'Make group owner': 'مالک گروه کردن',
  'Make owner': 'مالک کردن',
  '{name} will become the owner and you will become an admin.': '{name} مالک گروه می‌شود و شما ادمین خواهید شد.',
  'Remove from group': 'حذف از گروه',
  'Remove {name} from this group?': '{name} از این گروه حذف شود؟',
  Remove: 'حذف',
  'Leave group': 'ترک گروه',
  Leave: 'ترک',
  'You are the owner. An admin (or the longest-standing member) will become the new owner.':
    'شما مالک گروه هستید. یکی از ادمین‌ها (یا قدیمی‌ترین عضو) مالک جدید می‌شود.',
  'You will stop receiving messages from this group.': 'دیگر پیام‌های این گروه را دریافت نمی‌کنید.',
  '{actor} created the group "{name}"': '{actor} گروه «{name}» را ساخت',
  '{actor} added {names}': '{actor}، {names} را اضافه کرد',
  '{actor} removed {names}': '{actor}، {names} را حذف کرد',
  '{actor} left the group': '{actor} گروه را ترک کرد',
  '{actor} made {names} an admin': '{actor}، {names} را ادمین کرد',
  '{actor} removed {names} as admin': '{actor}، {names} را از ادمینی برداشت',
  '{actor} made {names} the group owner': '{actor}، {names} را مالک گروه کرد',
  '{actor} is now the group owner': '{actor} اکنون مالک گروه است',
  '{actor} renamed the group to "{name}"': '{actor} نام گروه را به «{name}» تغییر داد',
  '{actor} changed the group description': '{actor} توضیحات گروه را تغییر داد',
  '{actor} changed the group photo': '{actor} عکس گروه را تغییر داد',
  'Only groups have members to manage': 'فقط گروه‌ها عضو قابل مدیریت دارند',
  'Only group admins can do that': 'فقط ادمین‌های گروه می‌توانند این کار را انجام دهند',
  'Group name cannot be empty': 'نام گروه نمی‌تواند خالی باشد',
  'Those people are already in the group': 'این افراد از قبل عضو گروه هستند',
  'Not a member': 'عضو نیستید',
  'You can’t remove this member': 'نمی‌توانید این عضو را حذف کنید',
  'Unknown role': 'نقش نامعتبر',
  'You can’t change your own role': 'نمی‌توانید نقش خودتان را تغییر دهید',
  'Account no longer exists': 'این حساب دیگر وجود ندارد',
  'Not found': 'پیدا نشد',

  // ----- group calls -----
  '{name} is calling the group': '{name} با گروه تماس گرفته',
  'Waiting for others to join…': 'در انتظار پیوستن دیگران…',
  '{n} in call': '{n} نفر در تماس',
  'Call in progress': 'تماس در جریان است',
  Join: 'پیوستن',
  'Minimize call': 'کوچک کردن تماس',
  'Return to call': 'بازگشت به تماس',
  // ----- call quality, temporary guests & files -----
  'Show participants': 'نمایش افراد داخل تماس',
  'Call quality': 'کیفیت تماس',
  'Invite to call': 'دعوت به تماس',
  'Focus shared screen': 'بزرگ‌نمایی صفحهٔ اشتراکی',
  'Open screen': 'باز کردن صفحه',
  'Close focused screen': 'بستن نمایش بزرگ صفحه',
  'Full width': 'تمام عرض',
  '{name} is sharing': '{name} در حال اشتراک‌گذاری است',
  'Voice quality': 'کیفیت صدا',
  'Screen share quality': 'کیفیت اشتراک صفحه',
  'Screen share FPS': 'نرخ فریم اشتراک صفحه',
  'Defaults: 160 Kbps and 1080p / 30 FPS': 'پیش‌فرض: ۱۶۰ کیلوبیت و 1080p / 30 FPS',
  'Could not load people': 'بارگیری کاربران ممکن نشد',
  'They can join this call temporarily without joining the group.': 'بدون عضو شدن در گروه، فقط تا پایان این تماس می‌توانند وارد شوند.',
  'Loading…': 'در حال بارگیری…',
  'No one else to invite': 'فرد دیگری برای دعوت وجود ندارد',
  'Could not send invitation': 'ارسال دعوت ممکن نشد',
  Invited: 'دعوت شد',
  Invite: 'دعوت',
  'File unavailable': 'فایل در دسترس نیست',
  'File expired': 'زمان نگه‌داری فایل تمام شده',
  'Could not download file': 'دانلود فایل ممکن نشد',
  'Original quality': 'کیفیت اصلی',
  Download: 'دانلود',
  'Group call invitation': 'دعوت به تماس گروهی',
  'Group call': 'تماس گروهی',
  'This call has ended': 'این تماس پایان یافته است',
  'Checking call…': 'در حال بررسی تماس…',
  'Join call': 'ورود به تماس',
  'Files can be up to 100 MB': 'حداکثر اندازهٔ فایل ۱۰۰ مگابایت است',
  'Could not upload file': 'آپلود فایل ممکن نشد',
  'Upload file': 'آپلود فایل',
  'File: {name}': 'فایل: {name}',
  File: 'فایل',
  'File sharing is not available on this device': 'اشتراک‌گذاری فایل در این دستگاه در دسترس نیست',
  'Choose a file to upload': 'یک فایل برای آپلود انتخاب کنید',
  'File is too large (max 100 MB)': 'اندازهٔ فایل بیشتر از ۱۰۰ مگابایت است',
  'File upload failed': 'آپلود فایل ناموفق بود',
  'File not found': 'فایل پیدا نشد',
  'Call is no longer available': 'این تماس دیگر در دسترس نیست',
  'not in this group call': 'شما داخل این تماس گروهی نیستید',
  'Audio devices': 'دستگاه‌های صدا',
  'Stop sharing': 'توقف اشتراک صفحه',
  'React with {emoji}': 'واکنش با {emoji}',
  'Turn camera on': 'روشن کردن دوربین',
  'Turn camera off': 'خاموش کردن دوربین',
  'More options': 'گزینه‌های بیشتر',
  'Your video — drag to move': 'تصویر شما؛ برای جابه‌جایی بکشید',
  Unmute: 'باصدا کردن',
  'Microphone settings': 'تنظیمات میکروفون',
  'Filters out keyboard, fan and background noise.': 'صدای کیبورد، فن و نویز پس‌زمینه را حذف می‌کند.',
  Strength: 'شدت',
  'Applies to everyone in this call.': 'برای همه‌ی افراد این تماس اعمال می‌شود.',
  'Screen share quality and FPS appear here once you start sharing your screen.': 'کیفیت و نرخ فریم اشتراک صفحه بعد از شروع اشتراک صفحه اینجا نمایش داده می‌شود.',
  'Volume of {name}': 'بلندی صدای {name}',
  'Microphone input': 'ورودی میکروفون',
  'Sound output': 'خروجی صدا',
  'On phones, Bluetooth and wired communication routes pair their microphone and speaker together.':
    'در گوشی، مسیرهای بلوتوثی و سیمی میکروفون و خروجی صدای خود را با هم استفاده می‌کنند.',
  'Participant volume': 'بلندی صدای افراد',
  'No audio devices found': 'هیچ دستگاه صوتی پیدا نشد',
  'The selected microphone is unavailable': 'میکروفون انتخاب‌شده در دسترس نیست',
  'Microphone {n}': 'میکروفون {n}',
  'Speaker {n}': 'خروجی صدا {n}',
  'Bluetooth / AirPods': 'بلوتوث / ایرپاد',
  'Wired / USB headset': 'هدست سیمی / USB',
  'Phone speaker': 'بلندگوی گوشی',
  'Phone earpiece': 'اسپیکر مکالمهٔ گوشی',

  // ----- call controls (A) -----
  'Sound output settings': 'تنظیمات خروجی صدا',
  'Test sound': 'آزمایش صدا',
  'Could not play the test sound': 'پخش صدای آزمایشی ممکن نشد',
  'Reactions': 'واکنش‌ها',
  'Hide video preview': 'پنهان کردن پیش‌نمایش ویدیو',
  'Show video preview': 'نمایش پیش‌نمایش ویدیو',
  // ----- profile/settings/group (C) -----
  'Send message': 'ارسال پیام',
  'Saved Messages': 'پیام‌های ذخیره‌شده',
  // ----- chat (B) -----
  'React': 'واکنش',
  'Save': 'ذخیره',
  'Saved': 'ذخیره شد',
  'Could not save': 'ذخیره نشد',
  'Notes and messages saved for yourself': 'یادداشت‌ها و پیام‌هایی که برای خودت ذخیره کرده‌ای',
  'Write a note…': 'یادداشت بنویس…',
  'Write notes to yourself, or save any message here with its bookmark button.':
    'برای خودت یادداشت بنویس، یا هر پیامی را با دکمهٔ نشانک اینجا ذخیره کن.',
  'Forwarded from {name}': 'ارسال‌شده از {name}',
  'Outgoing voice call': 'تماس صوتی خروجی',
  'Outgoing video call': 'تماس تصویری خروجی',
  'Incoming voice call': 'تماس صوتی ورودی',
  'Incoming video call': 'تماس تصویری ورودی',
  'Missed voice call': 'تماس صوتی از دست رفته',
  'Missed video call': 'تماس تصویری از دست رفته',
  'No answer': 'بدون پاسخ',
  'Cancelled': 'لغو شد',
  'Declined': 'رد شد',
  'Pick an emoji': 'یک شکلک انتخاب کن',
  'Message not found': 'پیام پیدا نشد',
  'You can’t react to this message': 'نمی‌توانی به این پیام واکنش بدهی',
  'Messages from secret chats can’t be saved': 'پیام‌های گفتگوی محرمانه را نمی‌شود ذخیره کرد',
  'This message is already in Saved Messages': 'این پیام از قبل در پیام‌های ذخیره‌شده است',
  'This message can’t be saved': 'این پیام را نمی‌شود ذخیره کرد',
  'You can’t call yourself': 'نمی‌توانی با خودت تماس بگیری',
  // ----- message actions & admin settings (server) -----
  'You can only edit your own messages': 'فقط پیام‌های خودتان را می‌توانید ویرایش کنید',
  'Only text messages can be edited': 'فقط پیام‌های متنی قابل ویرایش هستند',
  'You can only delete your own messages': 'فقط پیام‌های خودتان را می‌توانید حذف کنید',
  'This message can’t be forwarded': 'این پیام را نمی‌شود به جلو فرستاد',
  'Forwarding is not available in secret chats': 'ارسال به جلو در گفتگوی محرمانه ممکن نیست',
  'You can’t pin this message': 'این پیام را نمی‌شود سنجاق کرد',
  'Invalid value for appName': 'نام برنامه معتبر نیست',
  'Invalid value for repoUrl': 'نشانی مخزن معتبر نیست',
  'Invalid value for showRepoLinks': 'مقدار نمایش پیوند مخزن معتبر نیست',
  // ----- shell, update banner, app info, accents, admin branding (UI) -----
  'Close search': 'بستن جستجو',
  Unpin: 'برداشتن سنجاق',
  'Mark as read': 'علامت‌گذاری به‌عنوان خوانده‌شده',
  'New Version': 'نسخه‌ی جدید',
  'v{version} is available': 'نسخه‌ی {version} در دسترس است',
  Update: 'به‌روزرسانی',
  "What's new": 'تازه‌ها',
  '{name} updated to v{version}': '{name} به نسخه‌ی {version} به‌روزرسانی شد',
  'Small fixes and improvements behind the scenes.': 'رفع اشکال‌های جزئی و بهبودهای داخلی.',
  'Got it': 'فهمیدم',
  'About {name}': 'درباره‌ی {name}',
  'A calm, self-hosted messenger for teams. Real-time chat, calls and meeting links on web, desktop and Android.':
    'یک پیام‌رسان آرام و خودمیزبان برای تیم‌ها؛ گفتگوی لحظه‌ای، تماس و لینک جلسه روی وب، دسکتاپ و اندروید.',
  'Project repository': 'مخزن پروژه',
  'Open the project repository': 'باز کردن مخزن پروژه',
  'Released under the Flock Source-Available License.': 'با مجوز Source-Available فلاک منتشر شده است.',
  'Theme color': 'رنگ تم',
  Apply: 'اعمال',
  'Use a hex color like #FFB84D': 'یک رنگ هگز مانند #FFB84D وارد کنید',
  Amber: 'کهربایی',
  Sky: 'آبی آسمانی',
  Mint: 'نعنایی',
  Violet: 'بنفش',
  Rose: 'صورتی',
  Ember: 'نارنجی آتشین',
  Lime: 'لیمویی',
  Cyan: 'فیروزه‌ای',
  Repository: 'مخزن کد',
  'App name': 'نام برنامه',
  '1 to 40 characters': 'بین ۱ تا ۴۰ کاراکتر',
  'Every "Flock" in the app becomes this name, for everyone on this server.':
    'هر «فلاک» در برنامه برای همه‌ی کاربران این سرور به این نام تبدیل می‌شود.',
  'Repository link': 'لینک مخزن',
  'Must start with http:// or https://': 'باید با http:// یا https:// شروع شود',
  'Show repository links': 'نمایش لینک‌های مخزن',
  'Shows the project link in Settings, the app info dialog and the update box.':
    'لینک پروژه را در تنظیمات، پنجره‌ی اطلاعات برنامه و کادر به‌روزرسانی نمایش می‌دهد.',
  // ----- chat: pinned, search, message menu, edit, forward, paste, emoji picker (chat) -----
  'Pinned message': 'پیام سنجاق‌شده',
  'Could not unpin the message': 'برداشتن سنجاق پیام ممکن نشد',
  'Search in conversation': 'جستجو در گفتگو',
  'Search in this conversation': 'جستجو در این گفتگو',
  'No messages found.': 'پیامی پیدا نشد.',
  'Could not search messages': 'جستجوی پیام‌ها ممکن نشد',
  'Go to message': 'رفتن به پیام',
  'Message actions': 'کارهای پیام',
  Edited: 'ویرایش‌شده',
  'Editing message': 'در حال ویرایش پیام',
  'Cancel edit': 'لغو ویرایش',
  'Could not save changes': 'ذخیرهٔ تغییرات ممکن نشد',
  'Add a caption…': 'یک توضیح بنویسید…',
  'Delete message': 'حذف پیام',
  'Delete this message for everyone?': 'این پیام برای همه حذف شود؟',
  Delete: 'حذف',
  Edit: 'ویرایش',
  Forward: 'ارسال به جلو',
  'Forward to': 'ارسال به',
  'Forward to {name}': 'ارسال به {name}',
  'Could not forward the message': 'ارسال به جلو ممکن نشد',
  'No conversations to forward to.': 'گفتگویی برای ارسال به جلو وجود ندارد.',
  Group: 'گروه',
  'Direct message': 'پیام مستقیم',
  Recent: 'اخیر',
  'Search emoji': 'جستجوی شکلک',
  'No emoji found.': 'شکلکی پیدا نشد.',
  'Smileys & Emotion': 'شکلک‌ها و احساسات',
  'People & Body': 'افراد و بدن',
  'Animals & Nature': 'حیوانات و طبیعت',
  'Food & Drink': 'خوراکی و نوشیدنی',
  'Travel & Places': 'سفر و مکان‌ها',
  Activities: 'فعالیت‌ها',
  Objects: 'اشیا',
  Symbols: 'نمادها',
  Flags: 'پرچم‌ها',
  // ----- calls: raise hand, device errors, sounds, camera switch, mute-all (call) -----
  '{count} people raised their hands': '{count} نفر دستشان را بالا برده‌اند',
  '{name} raised a hand': '{name} دستش را بالا برد',
  "{name}'s connection is very weak": 'اتصال {name} خیلی ضعیف است',
  "{name}'s connection is weak": 'اتصال {name} ضعیف است',
  'A notification when a message arrives in the call chat.': 'اعلان صوتی وقتی پیامی در چت تماس می‌رسد.',
  'A short tone when you send or receive a reaction.': 'صدای کوتاه هنگام فرستادن یا گرفتن واکنش.',
  'Allow the microphone and camera in your browser site settings (the lock icon next to the address), then reload.':
    'میکروفون و دوربین را در تنظیمات سایت مرورگر (آیکون قفل کنار آدرس) مجاز کنید و صفحه را دوباره بارگذاری کنید.',
  'Audio & video setup': 'راه‌اندازی صدا و تصویر',
  'Call chat sounds': 'صدای چت تماس',
  'Call sounds': 'صداهای تماس',
  "Calls can't start: this browser is blocking WebRTC. Turn off extensions or policy that block calls (some ad blockers and privacy tools do), or use the Flock desktop app or another browser.":
    'تماس شروع نمی‌شود: این مرورگر WebRTC را مسدود کرده است. افزونه‌ها یا سیاست‌هایی را که تماس را مسدود می‌کنند خاموش کنید (بعضی مسدودکننده‌های تبلیغات و ابزارهای حریم خصوصی این کار را می‌کنند) یا از اپ دسکتاپ Flock یا مرورگر دیگری استفاده کنید.',
  'Camera {n}': 'دوربین {n}',
  'Camera access is blocked. Allow the camera in your browser site settings (the lock icon next to the address) or the app permissions, then try again.':
    'دسترسی به دوربین مسدود است. دوربین را در تنظیمات سایت مرورگر (آیکون قفل کنار آدرس) یا مجوزهای برنامه مجاز کنید و دوباره امتحان کنید.',
  'Close other apps that use the microphone or camera and try again.':
    'برنامه‌های دیگری را که از میکروفون یا دوربین استفاده می‌کنند ببندید و دوباره امتحان کنید.',
  "Flock couldn't share your screen. Check the browser permissions and try again.":
    'Flock نتوانست صفحه‌ی شما را به اشتراک بگذارد. مجوزهای مرورگر را بررسی کنید و دوباره امتحان کنید.',
  "Flock couldn't start the camera. Check that it is connected and allowed, then try again.":
    'Flock نتوانست دوربین را روشن کند. بررسی کنید که وصل و مجاز باشد و دوباره امتحان کنید.',
  "Flock couldn't start the microphone and camera. Check that they are connected and allowed, then try again.":
    'Flock نتوانست میکروفون و دوربین را روشن کند. بررسی کنید که وصل و مجاز باشند و دوباره امتحان کنید.',
  "Flock couldn't start the microphone. Check that it is connected and allowed, then try again.":
    'Flock نتوانست میکروفون را روشن کند. بررسی کنید که وصل و مجاز باشد و دوباره امتحان کنید.',
  'Hand raised': 'دست بالا',
  'If an extension or browser policy blocks calls, turn it off or use the Flock desktop app.':
    'اگر افزونه یا سیاست مرورگر جلوی تماس را می‌گیرد، آن را خاموش کنید یا از اپ دسکتاپ Flock استفاده کنید.',
  'Lower hand': 'پایین آوردن دست',
  'Microphone access is blocked. Allow the microphone in your browser site settings (the lock icon next to the address) or the app permissions, then try again.':
    'دسترسی به میکروفون مسدود است. میکروفون را در تنظیمات سایت مرورگر (آیکون قفل کنار آدرس) یا مجوزهای برنامه مجاز کنید و دوباره امتحان کنید.',
  'Microphone and camera access is blocked. Allow them in your browser site settings (the lock icon next to the address) or the app permissions, then try again.':
    'دسترسی به میکروفون و دوربین مسدود است. آن‌ها را در تنظیمات سایت مرورگر (آیکون قفل کنار آدرس) یا مجوزهای برنامه مجاز کنید و دوباره امتحان کنید.',
  'Mute all call audio': 'بی‌صدا کردن کل صدای تماس',
  'Mute call audio': 'بی‌صدا کردن صدای تماس',
  "Mutes everyone's voice and call sounds on your device. Each person's volume below still applies when you unmute.":
    'صدای همه و صداهای تماس را روی دستگاه شما قطع می‌کند. بعد از فعال کردن صدا، میزان صدای هر نفر در پایین اعمال می‌شود.',
  'No camera found. Connect one and try again.': 'دوربینی پیدا نشد. یک دوربین وصل کنید و دوباره امتحان کنید.',
  'No camera was found. Connect a camera, then turn it on again.': 'دوربینی پیدا نشد. یک دوربین وصل کنید و دوباره روشن کنید.',
  'No microphone or camera was found. Connect one, then try again.': 'میکروفون یا دوربینی پیدا نشد. یکی را وصل کنید و دوباره امتحان کنید.',
  'No microphone was found. Connect a microphone, then pick it in the call settings.':
    'میکروفونی پیدا نشد. یک میکروفون وصل کنید و از تنظیمات تماس انتخابش کنید.',
  'Raise hand': 'بالا بردن دست',
  'Reaction sounds': 'صدای واکنش‌ها',
  'Screen sharing is blocked. Allow it when the browser asks, or share from the Flock desktop app.':
    'اشتراک صفحه مسدود است. وقتی مرورگر پرسید اجازه دهید یا از اپ دسکتاپ Flock صفحه را به اشتراک بگذارید.',
  'Screen sharing is not available here. Use Chrome, Edge or the Flock desktop app to share your screen.':
    'اشتراک صفحه اینجا در دسترس نیست. برای اشتراک صفحه از Chrome، Edge یا اپ دسکتاپ Flock استفاده کنید.',
  'Switching cameras keeps the call connected.': 'تعویض دوربین تماس را قطع نمی‌کند.',
  'The camera is busy in another app. Close other apps that use the camera, then try again.':
    'دوربین در برنامه‌ی دیگری در حال استفاده است. برنامه‌های دیگری را که از دوربین استفاده می‌کنند ببندید و دوباره امتحان کنید.',
  'The microphone is busy in another app. Close other apps that use the microphone, then try again.':
    'میکروفون در برنامه‌ی دیگری در حال استفاده است. برنامه‌های دیگری را که از میکروفون استفاده می‌کنند ببندید و دوباره امتحان کنید.',
  'The screen could not be captured. Close other screen-sharing or recording apps and try again.':
    'گرفتن تصویر صفحه ممکن نشد. برنامه‌های دیگر اشتراک صفحه یا ضبط را ببندید و دوباره امتحان کنید.',
  'There is no screen to share on this device.': 'صفحه‌ای برای اشتراک روی این دستگاه وجود ندارد.',
  'Turn the camera on first, then switch it.': 'اول دوربین را روشن کنید، بعد دوربین را عوض کنید.',
  'Unmute call audio': 'باصدا کردن صدای تماس',
  'You raised your hand': 'دست خودتان را بالا برده‌اید',
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
  let s = brandText(dictionaries[current][key] ?? key);
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
