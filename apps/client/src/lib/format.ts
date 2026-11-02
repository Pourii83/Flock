const MIN = 60_000;
const DAY = 86_400_000;

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Compact relative time for list rows: "2m", "3h", "Yesterday", "Sep 17". */
export function shortTime(t: number) {
  const diff = Date.now() - t;
  if (diff < MIN) return 'now';
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)}m`;
  const today = startOfDay(Date.now());
  if (t >= today) return `${Math.floor(diff / (60 * MIN))}h`;
  if (t >= today - DAY) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** "Today, 10:14 AM" style label used in call history. */
export function dayAndTime(t: number) {
  const today = startOfDay(Date.now());
  const day =
    t >= today
      ? 'Today'
      : t >= today - DAY
        ? 'Yesterday'
        : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day}, ${clock(t)}`;
}

/** Divider label inside a thread: "TODAY", "YESTERDAY", "SEPTEMBER 19". */
export function dayDivider(t: number) {
  const today = startOfDay(Date.now());
  if (t >= today) return 'Today';
  if (t >= today - DAY) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);

export function duration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const timer = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export function lastSeenLabel(online: boolean, lastSeen: number | null) {
  if (online) return 'Active now';
  if (!lastSeen) return 'Offline';
  return `Last seen ${shortTime(lastSeen) === 'now' ? 'just now' : shortTime(lastSeen)}${Date.now() - lastSeen < DAY ? ' ago' : ''}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
