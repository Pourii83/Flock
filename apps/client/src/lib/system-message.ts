import { isRTL, t } from './i18n';

type SystemEvent = { e: string; actor?: string; name?: string; targets?: string[] };

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
    default:
      return actor;
  }
}
