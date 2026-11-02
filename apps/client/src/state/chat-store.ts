import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import type { Conversation, Message, User } from '@/lib/types';
import { t } from '@/lib/i18n';

type State = {
  connected: boolean;
  loaded: boolean;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  /** conversationId -> userIds currently typing */
  typing: Record<string, string[]>;
};

const initialState = (): State => ({
  connected: false,
  loaded: false,
  conversations: [],
  messages: {},
  hasMore: {},
  typing: {},
});

const sortConversations = (list: Conversation[]) =>
  [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

/**
 * Single source of truth for chats: REST for history, Socket.IO for live updates.
 * Components read slices through `useChat(selector)`.
 */
class ChatStore {
  state: State = initialState();
  socket: Socket | null = null;
  me: User | null = null;
  /** Conversation currently on screen; incoming messages there are marked read immediately. */
  openConversationId: string | null = null;

  private listeners = new Set<() => void>();
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((fn) => fn());
  }

  // ---------- lifecycle ----------

  start(token: string, me: User) {
    this.stop();
    this.me = me;
    const socket = io(getApiUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    this.socket = socket;

    socket.on('connect', () => {
      this.set({ connected: true });
      this.refreshConversations();
    });
    socket.on('disconnect', () => this.set({ connected: false }));
    socket.on('message:new', (m: Message) => this.receiveMessage(m));
    socket.on('conversation:new', (c: Conversation) => this.upsertConversation(c));
    socket.on('conversation:read', ({ conversationId, userId, readAt }) => {
      if (userId === this.me?.id) return;
      this.patchConversation(conversationId, (c) => ({
        othersReadAt: c.type === 'direct' ? readAt : Math.max(c.othersReadAt, readAt),
      }));
    });
    socket.on('typing', ({ conversationId, userId, typing }) => this.setTyping(conversationId, userId, typing));
    socket.on('presence', ({ userId, online, lastSeen }) => this.patchUser(userId, { online, lastSeen }));
    socket.on('user:updated', (u: User) => this.patchUser(u.id, u));
  }

  stop() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.me = null;
    this.typingTimers.forEach(clearTimeout);
    this.typingTimers.clear();
    this.state = initialState();
    this.listeners.forEach((fn) => fn());
  }

  // ---------- conversations ----------

  async refreshConversations() {
    try {
      const list = await api.conversations();
      this.set({ conversations: sortConversations(list), loaded: true });
    } catch {
      this.set({ loaded: true });
    }
  }

  upsertConversation(c: Conversation) {
    this.set((s) => ({
      conversations: sortConversations([c, ...s.conversations.filter((x) => x.id !== c.id)]),
    }));
  }

  private patchConversation(id: string, fn: (c: Conversation) => Partial<Conversation>) {
    this.set((s) => ({
      conversations: sortConversations(s.conversations.map((c) => (c.id === id ? { ...c, ...fn(c) } : c))),
    }));
  }

  /** Applies a profile change (name, photo…) everywhere the user appears. */
  updateUser(user: User) {
    if (this.me?.id === user.id) this.me = user;
    this.patchUser(user.id, user);
  }

  private patchUser(userId: string, patch: Partial<User>) {
    this.set((s) => ({
      conversations: s.conversations.map((c) =>
        c.members.some((m) => m.id === userId)
          ? {
              ...c,
              members: c.members.map((m) => (m.id === userId ? { ...m, ...patch } : m)),
              name: c.type === 'direct' && patch.displayName && userId !== this.me?.id ? patch.displayName : c.name,
            }
          : c,
      ),
    }));
  }

  async setPinned(id: string, pinned: boolean) {
    this.patchConversation(id, () => ({ pinned }));
    await api.updateConversation(id, { pinned }).catch(() => this.patchConversation(id, () => ({ pinned: !pinned })));
  }

  async setMuted(id: string, muted: boolean) {
    this.patchConversation(id, () => ({ muted }));
    await api.updateConversation(id, { muted }).catch(() => this.patchConversation(id, () => ({ muted: !muted })));
  }

  async openConversation(id: string) {
    this.openConversationId = id;
    if (!this.state.messages[id]) await this.loadMessages(id);
    this.markRead(id);
  }

  closeConversation(id: string) {
    if (this.openConversationId === id) this.openConversationId = null;
  }

  markRead(id: string) {
    const c = this.state.conversations.find((x) => x.id === id);
    if (c && c.unreadCount === 0) return;
    this.patchConversation(id, () => ({ unreadCount: 0 }));
    api.markRead(id).catch(() => {});
  }

  // ---------- messages ----------

  async loadMessages(id: string) {
    const list = await api.messages(id);
    this.set((s) => ({
      messages: { ...s.messages, [id]: list },
      hasMore: { ...s.hasMore, [id]: list.length >= 50 },
    }));
  }

  async loadOlder(id: string) {
    const current = this.state.messages[id];
    if (!current?.length || !this.state.hasMore[id]) return;
    const older = await api.messages(id, current[0]!.createdAt);
    this.set((s) => ({
      messages: { ...s.messages, [id]: [...older, ...(s.messages[id] ?? [])] },
      hasMore: { ...s.hasMore, [id]: older.length >= 50 },
    }));
  }

  private receiveMessage(m: Message) {
    this.set((s) => {
      const list = s.messages[m.conversationId];
      if (!list) return {};
      if (list.some((x) => x.id === m.id)) return {};
      return { messages: { ...s.messages, [m.conversationId]: [...list, m] } };
    });
    const known = this.state.conversations.find((c) => c.id === m.conversationId);
    if (!known) {
      api.conversation(m.conversationId).then((c) => this.upsertConversation(c), () => {});
      return;
    }
    const mine = m.senderId === this.me?.id;
    const viewing = this.openConversationId === m.conversationId;
    this.patchConversation(m.conversationId, (c) => ({
      lastMessage: m,
      updatedAt: m.createdAt,
      unreadCount: mine || viewing ? c.unreadCount : c.unreadCount + 1,
    }));
    this.setTyping(m.conversationId, m.senderId, false);
    if (viewing && !mine) api.markRead(m.conversationId).catch(() => {});
  }

  async send(conversationId: string, body: string, replyTo?: Message | null) {
    const me = this.me;
    if (!me) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderId: me.id,
      kind: 'text',
      body,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            body: replyTo.body,
            senderId: replyTo.senderId,
            senderName: this.memberName(conversationId, replyTo.senderId),
          }
        : null,
      createdAt: Date.now(),
      pending: true,
    };
    const replace = (fn: (list: Message[]) => Message[]) =>
      this.set((s) => ({ messages: { ...s.messages, [conversationId]: fn(s.messages[conversationId] ?? []) } }));

    replace((list) => [...list, optimistic]);
    this.patchConversation(conversationId, () => ({ lastMessage: optimistic, updatedAt: optimistic.createdAt }));
    try {
      const saved = await api.sendMessage(conversationId, body, replyTo?.id);
      // The socket echo may already have delivered it.
      replace((list) =>
        list.some((x) => x.id === saved.id) ? list.filter((x) => x.id !== tempId) : list.map((x) => (x.id === tempId ? saved : x)),
      );
      this.patchConversation(conversationId, () => ({ lastMessage: saved, updatedAt: saved.createdAt }));
    } catch {
      replace((list) => list.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)));
    }
  }

  async retry(m: Message) {
    this.set((s) => ({
      messages: { ...s.messages, [m.conversationId]: (s.messages[m.conversationId] ?? []).filter((x) => x.id !== m.id) },
    }));
    await this.send(m.conversationId, m.body);
  }

  memberName(conversationId: string, userId: string) {
    if (userId === this.me?.id) return t('You');
    const c = this.state.conversations.find((x) => x.id === conversationId);
    return c?.members.find((u) => u.id === userId)?.displayName ?? t('Someone');
  }

  // ---------- typing ----------

  private lastTypingSent = 0;

  notifyTyping(conversationId: string, typing: boolean) {
    const t = Date.now();
    if (typing && t - this.lastTypingSent < 2500) return;
    this.lastTypingSent = typing ? t : 0;
    this.socket?.emit('typing', { conversationId, typing });
  }

  private setTyping(conversationId: string, userId: string, typing: boolean) {
    const key = `${conversationId}:${userId}`;
    clearTimeout(this.typingTimers.get(key));
    this.typingTimers.delete(key);
    if (typing) this.typingTimers.set(key, setTimeout(() => this.setTyping(conversationId, userId, false), 5000));
    const current = this.state.typing[conversationId] ?? [];
    const next = typing ? [...new Set([...current, userId])] : current.filter((id) => id !== userId);
    if (next.length === current.length && next.every((id, i) => id === current[i])) return;
    this.set((s) => ({ typing: { ...s.typing, [conversationId]: next } }));
  }
}

export const chatStore = new ChatStore();

export function useChat<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    chatStore.subscribe,
    () => selector(chatStore.state),
    () => selector(chatStore.state),
  );
}

const EMPTY: never[] = [];
export const useConversation = (id: string | undefined) =>
  useChat((s) => (id ? s.conversations.find((c) => c.id === id) : undefined));
export const useMessages = (id: string) => useChat((s) => s.messages[id] ?? EMPTY);
export const useTyping = (id: string) => useChat((s) => s.typing[id] ?? EMPTY);
