import { isRTL, t } from './i18n';

type SystemEvent = { e: string; actor?: string; name?: string; targets?: string[]; what?: string; ref?: string };

function parse(body: string): SystemEvent | null {
  try {
    const p = JSON.parse(body);
    return p && typeof p === 'object' && typeof p.e === 'string' ? p : null;
  } catch {
    return null;
  }
}

/** "Pourii pinned a video": the id of the pinned message, or null for any other note. */
export function pinNoteRef(body: string): string | null {
  const p = parse(body);
  return p?.e === 'pinned' ? (p.ref ?? '') : null;
}

/** A quoted (replied-to) message as one readable line: call logs and group notes aren't raw JSON. */
export function quoteText(kind: string | undefined, body: string): string {
  if (kind === 'system') return systemText(body);
  if (kind === 'call' && body.trimStart().startsWith('{')) {
    try {
      return JSON.parse(body)?.video ? t('Video call') : t('Voice call');
    } catch {
      return t('Voice call');
    }
  }
  return body;
}

/** Turns a group system message (JSON from the server) into a localized sentence. */
export function systemText(body: string): string {
  let p: SystemEvent;
  try {
    p = JSON.parse(body);
  } catch {
    return body;
  }
  const actor = p.actor || t('Someone');
  const names = (p.targets ?? []).join(isRTL() ? '، ' : ', ');
  switch (p.e) {
    case 'created':
      return t('{actor} created the group "{name}"', { actor, name: p.name ?? '' });
    case 'created-channel':
      return t('{actor} created the channel "{name}"', { actor, name: p.name ?? '' });
    case 'joined-link':
      return t('{actor} joined via invite link', { actor });
    case 'added':
      return t('{actor} added {names}', { actor, names });
    case 'removed':
      return t('{actor} removed {names}', { actor, names });
    case 'left':
      return t('{actor} left the group', { actor });
    case 'promoted':
      return t('{actor} made {names} an admin', { actor, names });
    case 'demoted':
      return t('{actor} removed {names} as admin', { actor, names });
    case 'transferred':
      return t('{actor} made {names} the group owner', { actor, names });
    case 'owner':
      return t('{actor} is now the group owner', { actor });
    case 'renamed':
      return t('{actor} renamed the group to "{name}"', { actor, name: p.name ?? '' });
    case 'description':
      return t('{actor} changed the group description', { actor });
    case 'photo':
      return t('{actor} changed the group photo', { actor });
    case 'pinned':
      switch (p.what) {
        case 'photo':
          return t('{actor} pinned a photo', { actor });
        case 'video':
          return t('{actor} pinned a video', { actor });
        case 'voice':
          return t('{actor} pinned a voice message', { actor });
        case 'file':
          return p.name ? t('{actor} pinned the file "{name}"', { actor, name: p.name }) : t('{actor} pinned a file', { actor });
        default:
          return p.name ? t('{actor} pinned "{name}"', { actor, name: p.name }) : t('{actor} pinned a message', { actor });
      }
    default:
      return actor;
  }
}
