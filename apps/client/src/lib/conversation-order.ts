import type { Conversation } from './types';

/**
 * Chat list order, the same as the server's: pinned chats first in the order I gave them (ranked ones
 * before older unranked pins), then everything else by last activity. `at` lets the list move a chat
 * with a fresh draft up.
 */
export function compareConversations(a: Conversation, b: Conversation, at: (c: Conversation) => number = (c) => c.updatedAt) {
  if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
  if (a.pinned) {
    const ra = a.pinRank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.pinRank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
  }
  return at(b) - at(a);
}
