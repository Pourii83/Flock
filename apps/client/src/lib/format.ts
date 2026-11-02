import { locale, num, t } from './i18n';

const MIN = 60_000;
const DAY = 86_400_000;

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// fa-IR formats with the Persian (Jalali) calendar and Persian digits.
export const clock = (ts: number) => new Date(ts).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
const shortDate = (ts: number) => new Date(ts).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

/** Compact relative time for list rows: "2m", "3h", "Yesterday", "Sep 17". */
export function shortTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < MIN) return t('now');
  const fa = locale() === 'fa-IR';
  if (diff < 60 * MIN) return fa ? `${num(Math.floor(diff / MIN))} دقیقه` : `${Math.floor(diff / MIN)}m`;
  const today = startOfDay(Date.now());
  if (ts >= today) return fa ? `${num(Math.floor(diff / (60 * MIN)))} ساعت` : `${Math.floor(diff / (60 * MIN))}h`;
  if (ts >= today - DAY) return t('Yesterday');
  return shortDate(ts);
}

/** "Today, 10:14 AM" style label used in call history. */
export function dayAndTime(ts: number) {
  const today = startOfDay(Date.now());
  const day = ts >= today ? t('Today') : ts >= today - DAY ? t('Yesterday') : shortDate(ts);
  return `${day}${locale() === 'fa-IR' ? '، ' : ', '}${clock(ts)}`;
}

/** Divider label inside a thread: "Today", "Yesterday", "Monday, September 19". */
export function dayDivider(ts: number) {
  const today = startOfDay(Date.now());
  if (ts >= today) return t('Today');
  if (ts >= today - DAY) return t('Yesterday');
  return new Date(ts).toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
}

export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);

export function duration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (locale() === 'fa-IR') {
    if (h) return `${num(h)} ساعت و ${num(m)} دقیقه`;
    if (m) return `${num(m)} دقیقه و ${num(s)} ثانیه`;
    return `${num(s)} ثانیه`;
  }
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const timer = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export function lastSeenLabel(online: boolean, lastSeen: number | null) {
  if (online) return t('Active now');
  if (!lastSeen) return t('Offline');
  const rel = shortTime(lastSeen);
  if (rel === t('now')) return t('Last seen just now');
  const ago = Date.now() - lastSeen < DAY ? (locale() === 'fa-IR' ? ' پیش' : ' ago') : '';
  return t('Last seen {time}', { time: rel + ago });
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
