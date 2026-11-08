import type { CallLogEntry, Message } from './types';
import { duration } from './format';
import { t } from './i18n';

/** Parses the body of a 'call' message (written by the server when a call ends). Direction is relative to `meId`. */
export function parseCallLog(message: Message, meId: string | undefined): CallLogEntry {
  let p: Partial<CallLogEntry> = {};
  try {
    p = JSON.parse(message.body);
  } catch {
    /* Malformed entry: shown as a plain voice call. */
  }
  return {
    callId: p.callId ?? '',
    video: !!p.video,
    status: p.status === 'completed' || p.status === 'declined' || p.status === 'cancelled' ? p.status : 'missed',
    durationSec: Number(p.durationSec) || 0,
    outgoing: message.senderId === meId,
  };
}

export type CallLine = {
  icon: 'phone-outgoing' | 'phone-incoming' | 'phone-missed' | 'video';
  title: string;
  /** Duration or outcome, shown under the title. */
  sub: string;
  /** The call went unanswered for me (missed incoming call). */
  missed: boolean;
};

/** Localized wording for a call log entry. Called at render time so it follows the app language. */
export function callLine(c: CallLogEntry): CallLine {
  // A call the caller cancelled is a missed call for everyone else.
  const missedByMe = !c.outgoing && (c.status === 'missed' || c.status === 'cancelled');
  if (missedByMe) {
    return {
      icon: 'phone-missed',
      title: c.video ? t('Missed video call') : t('Missed voice call'),
      sub: '',
      missed: true,
    };
  }
  const title = c.outgoing
    ? c.video ? t('Outgoing video call') : t('Outgoing voice call')
    : c.video ? t('Incoming video call') : t('Incoming voice call');
  const sub =
    c.status === 'completed'
      ? duration(c.durationSec)
      : c.status === 'declined'
        ? t('Declined')
        : c.status === 'cancelled'
          ? t('Cancelled')
          : t('No answer');
  return { icon: c.video ? 'video' : c.outgoing ? 'phone-outgoing' : 'phone-incoming', title, sub, missed: false };
}

/** One-line summary for the chat list preview. */
export function callPreview(c: CallLogEntry): string {
  const l = callLine(c);
  return l.sub ? `${l.title} · ${l.sub}` : l.title;
}
