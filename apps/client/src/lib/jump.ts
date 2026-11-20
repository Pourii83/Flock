// "Show in chat" from outside the thread (the info panel's Media / Files / Links / Audio): a request
// that the open thread of that conversation picks up and scrolls to. On phones the info page closes
// first, so the request waits until the thread is back on screen.

type Jump = { conversationId: string; messageId: string };

let pending: Jump | null = null;
const listeners = new Set<() => void>();

export function requestJump(conversationId: string, messageId: string) {
  pending = { conversationId, messageId };
  listeners.forEach((fn) => fn());
}

/** The message waiting for this conversation's thread, if any (taking it clears it). */
export function takeJump(conversationId: string): string | null {
  if (!pending || pending.conversationId !== conversationId) return null;
  const { messageId } = pending;
  pending = null;
  return messageId;
}

export function onJumpRequest(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
