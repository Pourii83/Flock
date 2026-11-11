// An invite link opened while signed out: the code waits here until the person has signed in.
import { getItem, setItem } from './storage';

export const PENDING_INVITE_KEY = 'flock.pendingInvite';

/** Returns the waiting invite code (once) and forgets it. */
export async function takePendingInvite(): Promise<string | null> {
  const code = await getItem(PENDING_INVITE_KEY);
  if (code) await setItem(PENDING_INVITE_KEY, null);
  return code && /^[A-Za-z0-9_-]{8,40}$/.test(code) ? code : null;
}
