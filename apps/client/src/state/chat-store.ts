import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DocumentPickerAsset } from 'expo-document-picker';

import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { decryptText, encryptText, forgetLoadedDevice, loadDevice, onDeviceChange, secretStatus } from '@/lib/e2e';
import { callPreview, parseCallLog } from '@/lib/call-log';
import type { Conversation, Message, Reaction, User, ActiveCall } from '@/lib/types';
import { t } from '@/lib/i18n';

type State = {
  connected: boolean;
  loaded: boolean;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  /** conversationId -> userIds currently typing */
  typing: Record<string, string[]>;
  /** conversationId -> call running there (group calls can be joined late). */
  activeCalls: Record<string, ActiveCall>;
  /** conversationId -> its latest pinned message, when the server knows one. */
  pinned: Record<string, Message | null>;
  /** Which conversations already had their pinned message fetched. */
  pinnedLoaded: Record<string, boolean>;
  /** Set while a meeting guest (no account) is connected only for a meeting room. */
  guest: User | null;
};

const initialState = (): State => ({
  connected: false,
  loaded: false,
  conversations: [],
  messages: {},
  hasMore: {},
  typing: {},
  activeCalls: {},
  pinned: {},
  pinnedLoaded: {},
  guest: null,
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
    // Secret chats need this device's key; once it's loaded, decrypt what's already here.
    this.stopDeviceWatch = onDeviceChange(() => this.revealAll());
    void loadDevice(me.id);
    const socket = io(getApiUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    this.socket = socket;

    socket.on('connect', () => {
      this.set({ connected: true });
      this.refreshConversations();
    });
    socket.on('disconnect', () => this.set({ connected: false }));
    socket.on('message:new', (m: Message) => this.receiveMessage(m));
    socket.on('message:updated', (payload: { conversationId?: string; message?: Message } | Message) =>
      this.updateMessage((payload as { message?: Message }).message ?? (payload as Message)),
    );
    socket.on('message:deleted', (payload: unknown) => this.removeMessage(payload));
    socket.on('message:pinned', (payload: unknown) => this.handlePinned(payload));
    socket.on('message:reactions', ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: Reaction[] }) =>
      this.setReactions(conversationId, messageId, reactions),
    );
    socket.on('conversation:new', (c: Conversation) => c && this.upsertConversation(c));
    socket.on('conversation:removed', ({ conversationId }: { conversationId: string }) => this.dropConversation(conversationId));
    socket.on('call:state', (c: ActiveCall & { callId: string | null }) =>
      this.set((s) => {
        const activeCalls = { ...s.activeCalls };
        if (c.callId) activeCalls[c.conversationId] = c;
        else delete activeCalls[c.conversationId];
        return { activeCalls };
      }),
    );
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

  /** A meeting guest: a socket for room signaling only — no chats, no presence. */
  startGuest(token: string, me: User) {
    this.stop();
    this.me = me;
    const socket = io(getApiUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    this.socket = socket;
    this.set({ guest: me });
    socket.on('connect', () => this.set({ connected: true }));
    socket.on('disconnect', () => this.set({ connected: false }));
  }

  private stopDeviceWatch: (() => void) | null = null;

  // ---------- secret chats ----------

  /** Decrypts a secret-chat message for display (and its quoted reply); other messages pass through. */
  private reveal(m: Message, conversation?: Conversation): Message {
    // Call log entries are plaintext metadata: parse once, and give list previews a readable one-liner.
    if (m.kind === 'call') {
      if (m.call) return m;
      const call = parseCallLog(m, this.me?.id);
      return { ...m, call, body: callPreview(call) };
    }
    const c = conversation ?? this.state.conversations.find((x) => x.id === m.conversationId);
    if (!c?.secret || m.kind !== 'text' || m.secret === 'ok') return m;
    const status = secretStatus(c, this.me?.id);
    const open = (body: string) => (status?.state === 'ready' ? decryptText(body, status.peerKey) : null);
    const body = open(m.body);
    const reply = m.replyTo ? open(m.replyTo.body) : null;
    return {
      ...m,
      body: body ?? t('Encrypted message — readable only on the device this secret chat lives on'),
      secret: body === null ? 'locked' : 'ok',
      replyTo: m.replyTo ? { ...m.replyTo, body: reply ?? t('Encrypted message') } : null,
    };
  }

  private revealConversation(c: Conversation): Conversation {
    // Saved Messages is named on the client so the title follows the app language.
    const named = c.isSaved ? { ...c, name: t('Saved Messages') } : c;
    return named.lastMessage ? { ...named, lastMessage: this.reveal(named.lastMessage, named) } : named;
  }

  /** Re-run decryption on everything loaded (this device's key arrived, or a chat was accepted). */
  private revealAll() {
    this.set((s) => ({
      conversations: s.conversations.map((c) => this.revealConversation(c)),
      messages: Object.fromEntries(
        Object.entries(s.messages).map(([id, list]) => {
          const c = s.conversations.find((x) => x.id === id);
          return [id, c?.secret ? list.map((m) => this.reveal(m, c)) : list];
        }),
      ),
    }));
  }

  stop() {
    this.stopDeviceWatch?.();
    this.stopDeviceWatch = null;
    forgetLoadedDevice();
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
      const [list, calls] = await Promise.all([api.conversations(), api.activeCalls().catch(() => [])]);
      this.set({
        conversations: sortConversations(list.map((c) => this.revealConversation(c))),
        activeCalls: Object.fromEntries(calls.map((c) => [c.conversationId, c])),
        loaded: true,
      });
    } catch {
      this.set({ loaded: true });
    }
  }

  /** Removed from a group (or left): forget it locally. */
  dropConversation(id: string) {
    this.set((s) => {
      const messages = { ...s.messages };
      delete messages[id];
      return { conversations: s.conversations.filter((c) => c.id !== id), messages };
    });
  }

  upsertConversation(c: Conversation) {
    const before = this.state.conversations.find((x) => x.id === c.id);
    this.set((s) => ({
      conversations: sortConversations([this.revealConversation(c), ...s.conversations.filter((x) => x.id !== c.id)]),
    }));
    // A secret chat was just accepted: messages that were sealed for it can be opened now.
    if (c.secret && before?.secret?.recipientKey !== c.secret.recipientKey) this.revealAll();
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
    if (!this.state.pinnedLoaded[id]) void this.loadPinned(id);
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
    const list = (await api.messages(id)).map((m) => this.reveal(m));
    this.set((s) => ({
      messages: { ...s.messages, [id]: list },
      hasMore: { ...s.hasMore, [id]: list.length >= 50 },
    }));
  }

  async loadOlder(id: string) {
    const current = this.state.messages[id];
    if (!current?.length || !this.state.hasMore[id]) return;
    const older = (await api.messages(id, current[0]!.createdAt)).map((m) => this.reveal(m));
    this.set((s) => ({
      messages: { ...s.messages, [id]: [...older, ...(s.messages[id] ?? [])] },
      hasMore: { ...s.hasMore, [id]: older.length >= 50 },
    }));
  }

  /** Loads (once) the conversation's currently pinned message for the thread banner. */
  async loadPinned(conversationId: string, force = false) {
    if (this.state.pinnedLoaded[conversationId] && !force) return;
    try {
      const list = (await api.pinnedMessages(conversationId)).map((m) => this.reveal(m));
      const latest = [...list].sort(
        (a, b) => (b.pinnedAt ?? b.createdAt) - (a.pinnedAt ?? a.createdAt),
      )[0];
      this.set((s) => ({
        pinned: { ...s.pinned, [conversationId]: latest ?? null },
        pinnedLoaded: { ...s.pinnedLoaded, [conversationId]: true },
      }));
      if (latest) this.upsertMessage(latest);
    } catch {
      // Older servers without pin support: no banner.
      this.set((s) => ({ pinnedLoaded: { ...s.pinnedLoaded, [conversationId]: true } }));
    }
  }

  private messageById(conversationId: string, messageId: string | undefined): Message | undefined {
    if (!messageId) return undefined;
    return this.state.messages[conversationId]?.find((m) => m.id === messageId);
  }

  /** Updates a loaded message, or inserts it (chronologically) when it's older than what's loaded. */
  upsertMessage(incoming: Message) {
    const m = this.reveal(incoming);
    const list = this.state.messages[m.conversationId];
    if (!list) return;
    if (list.some((existing) => existing.id === m.id)) {
      this.updateMessage(m);
      return;
    }
    const at = list.findIndex((existing) => existing.createdAt > m.createdAt);
    const next = at < 0 ? [...list, m] : [...list.slice(0, at), m, ...list.slice(at)];
    this.set((s) => ({ messages: { ...s.messages, [m.conversationId]: next } }));
  }

  private setPinnedLocal(conversationId: string, message: Message | null) {
    this.set((s) => ({
      pinned: { ...s.pinned, [conversationId]: message },
      pinnedLoaded: { ...s.pinnedLoaded, [conversationId]: true },
    }));
  }

  /** Applies an edited message or a server-side field change to the loaded list. */
  private updateMessage(incoming: Message) {
    const m = this.reveal(incoming);
    const editedAt = m.editedAt;
    const pinnedAt = m.pinnedAt;
    this.patchMessage(m.conversationId, m.id, () => ({
      body: m.body,
      ...(m.reactions ? { reactions: m.reactions } : {}),
      ...(editedAt != null ? { editedAt } : {}),
      ...(pinnedAt != null ? { pinnedAt } : {}),
    }));
    const conversation = this.state.conversations.find((c) => c.id === m.conversationId);
    if (conversation?.lastMessage?.id === m.id) this.patchConversation(m.conversationId, () => ({ lastMessage: m }));
    if (pinnedAt) this.setPinnedLocal(m.conversationId, m);
  }

  /** `message:deleted` arrives as an id, or as { messageId, conversationId }. */
  private removeMessage(payload: unknown) {
    const data = (typeof payload === 'string' ? { messageId: payload } : (payload ?? {})) as {
      id?: string;
      messageId?: string;
      conversationId?: string;
    };
    const messageId = data.messageId ?? data.id;
    if (!messageId) return;
    this.set((s) => {
      const messages = { ...s.messages };
      const ids = data.conversationId ? [data.conversationId] : Object.keys(messages);
      let removedConversation: string | undefined;
      for (const id of ids) {
        const list = messages[id];
        if (!list?.some((m) => m.id === messageId)) continue;
        messages[id] = list.filter((m) => m.id !== messageId);
        removedConversation = id;
        break;
      }
      const pinned = { ...s.pinned };
      const pinnedId = removedConversation ?? data.conversationId;
      if (pinnedId && pinned[pinnedId]?.id === messageId) pinned[pinnedId] = null;
      return { messages, pinned };
    });
    // Keep the chat list preview in sync when the last message disappeared.
    for (const c of this.state.conversations) {
      if (c.lastMessage?.id !== messageId) continue;
      const list = this.state.messages[c.id] ?? [];
      this.patchConversation(c.id, () => ({ lastMessage: list[list.length - 1] ?? null }));
    }
  }

  /** `message:pinned` arrives as { conversationId, messageId, pinnedAt } (pinnedAt null = unpinned). */
  private handlePinned(payload: unknown) {
    const data = (payload ?? {}) as Record<string, unknown>;
    const conversationId = data.conversationId as string | undefined;
    if (!conversationId) return;
    const messageId = data.messageId as string | undefined;
    const hasPinnedAt = Object.prototype.hasOwnProperty.call(data, 'pinnedAt');
    const explicit = typeof data.pinned === 'boolean' ? data.pinned : undefined;
    const pinnedAt = (hasPinnedAt ? (data.pinnedAt as number | null) : undefined) ?? null;
    const pinned = explicit ?? pinnedAt != null;
    if (messageId) this.patchMessage(conversationId, messageId, () => ({ pinnedAt }));
    if (!pinned) {
      this.setPinnedLocal(conversationId, null);
      // Another pinned message may be next in line for the banner.
      if (this.state.messages[conversationId]) void this.loadPinned(conversationId, true);
      return;
    }
    // The banner shows the message text: it may not be in the loaded page yet.
    const known = this.messageById(conversationId, messageId);
    if (known) this.setPinnedLocal(conversationId, { ...known, pinnedAt });
    else void this.loadPinned(conversationId, true);
  }

  /** Pin or unpin a message (the banner and the server event keep every client in sync). */
  async setPinnedMessage(message: Message, pinned: boolean) {
    const result = await api.pinMessage(message.id, pinned);
    const pinnedAt = pinned ? (result.pinnedAt ?? Date.now()) : null;
    this.patchMessage(message.conversationId, message.id, () => ({ pinnedAt }));
    this.setPinnedLocal(message.conversationId, pinned ? { ...message, pinnedAt } : null);
    return pinned;
  }

  /** Saves an edited body; secret chats re-encrypt for the peer device like send() does. */
  async editMessage(message: Message, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new Error(t('Message is empty'));
    const conversation = this.state.conversations.find((c) => c.id === message.conversationId);
    const status = conversation ? secretStatus(conversation, this.me?.id) : null;
    const wire = status?.state === 'ready' ? encryptText(trimmed, status.peerKey) : trimmed;
    const updated = await api.editMessage(message.id, wire);
    const editedAt = updated.editedAt ?? Date.now();
    this.patchMessage(message.conversationId, message.id, () => ({ body: trimmed, editedAt }));
    const known = this.messageById(message.conversationId, message.id);
    if (known && this.state.conversations.find((c) => c.id === message.conversationId)?.lastMessage?.id === message.id) {
      this.patchConversation(message.conversationId, () => ({ lastMessage: { ...known, body: trimmed } }));
    }
    return { ...message, body: trimmed, editedAt };
  }

  async deleteMessage(message: Message) {
    await api.deleteMessage(message.id);
    this.removeMessage({ conversationId: message.conversationId, messageId: message.id });
  }

  /** Copies a message into another conversation ("forwarded from …"). */
  async forwardMessage(message: Message, targetConversationId: string) {
    const forwarded = await api.forwardMessage(message.id, targetConversationId);
    this.receiveMessage(forwarded);
    return forwarded;
  }

  async searchMessages(conversationId: string, query: string) {
    const list = await api.searchMessages(conversationId, query);
    return list.map((m) => this.reveal(m));
  }

  /** Makes sure a message is loaded (bounded paging) so the thread can scroll to it. */
  async findMessage(conversationId: string, messageId: string): Promise<Message | null> {
    const local = () => this.state.messages[conversationId]?.find((m) => m.id === messageId);
    const found = local();
    if (found) return found;
    if (!this.state.messages[conversationId]) {
      await this.loadMessages(conversationId).catch(() => {});
      const afterLoad = local();
      if (afterLoad) return afterLoad;
    }
    for (let page = 0; page < 20; page++) {
      if (!this.state.hasMore[conversationId]) break;
      try {
        await this.loadOlder(conversationId);
      } catch {
        break;
      }
      const hit = local();
      if (hit) return hit;
    }
    // Too far back to page in (bounded); the caller decides what to do with it.
    const pinned = this.state.pinned[conversationId];
    return pinned?.id === messageId ? pinned : null;
  }

  private receiveMessage(incoming: Message) {
    const m = this.reveal(incoming);
    this.set((s) => {
      const list = s.messages[m.conversationId];
      if (!list) return {};
      if (list.some((x) => x.id === m.id)) return {};
      return { messages: { ...s.messages, [m.conversationId]: [...list, m] } };
    });
    if (m.pinnedAt) this.setPinnedLocal(m.conversationId, m);
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
      attachment: null,
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
      // Secret chats: only ciphertext leaves this device; the plaintext stays in memory here.
      const conversation = this.state.conversations.find((c) => c.id === conversationId);
      const status = conversation ? secretStatus(conversation, me.id) : null;
      if (conversation?.secret && status?.state !== 'ready') throw new Error('secret chat not ready');
      const wire = status?.state === 'ready' ? encryptText(body, status.peerKey) : body;
      const sent = await api.sendMessage(conversationId, wire, replyTo?.id);
      const saved = status?.state === 'ready' ? { ...sent, body, secret: 'ok' as const, replyTo: optimistic.replyTo && sent.replyTo ? { ...sent.replyTo, body: optimistic.replyTo.body } : sent.replyTo } : sent;
      // The socket echo may already have delivered it.
      replace((list) =>
        list.some((x) => x.id === saved.id) ? list.filter((x) => x.id !== tempId) : list.map((x) => (x.id === tempId ? saved : x)),
      );
      this.patchConversation(conversationId, () => ({ lastMessage: saved, updatedAt: saved.createdAt }));
    } catch {
      replace((list) => list.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)));
    }
  }

  async sendFile(conversationId: string, asset: DocumentPickerAsset, replyTo?: Message | null, caption?: string, onProgress?: (fraction: number) => void) {
    const trimmed = caption?.trim();
    const saved = await api.sendFile(conversationId, asset, replyTo?.id, trimmed || undefined, onProgress);
    // Socket delivery and the HTTP response can race; receiveMessage de-duplicates by id.
    this.receiveMessage(saved);
    return saved;
  }

  // ---------- reactions ----------

  private patchMessage(conversationId: string, id: string, fn: (m: Message) => Partial<Message>) {
    this.set((s) => {
      const list = s.messages[conversationId];
      if (!list?.some((m) => m.id === id)) return {};
      return { messages: { ...s.messages, [conversationId]: list.map((m) => (m.id === id ? { ...m, ...fn(m) } : m)) } };
    });
  }

  private setReactions(conversationId: string, messageId: string, reactions: Reaction[]) {
    this.patchMessage(conversationId, messageId, () => ({ reactions }));
  }

  /** Toggles my reaction on a message (optimistic; the server's list wins once it answers). */
  async react(m: Message, emoji: string) {
    const meId = this.me?.id;
    if (!meId || m.pending || m.failed) return;
    const on = !m.reactions?.find((r) => r.emoji === emoji)?.userIds.includes(meId);
    const apply = (list: Reaction[] | undefined, add: boolean): Reaction[] => {
      const rest = (list ?? []).map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== meId) } : r));
      const next = add ? (rest.some((r) => r.emoji === emoji) ? rest.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, meId] } : r)) : [...rest, { emoji, userIds: [meId] }]) : rest;
      return next.filter((r) => r.userIds.length > 0);
    };
    this.patchMessage(m.conversationId, m.id, (x) => ({ reactions: apply(x.reactions, on) }));
    try {
      const res = await api.react(m.id, emoji, on);
      this.setReactions(m.conversationId, m.id, res.reactions);
    } catch {
      this.patchMessage(m.conversationId, m.id, (x) => ({ reactions: apply(x.reactions, !on) }));
    }
  }

  // ---------- saved messages ----------

  /** Opens (creating on first use) my Saved Messages chat; resolves to its conversation id. */
  async openSavedMessages(): Promise<string> {
    const c = await api.savedMessages();
    this.upsertConversation(c);
    return c.id;
  }

  /** Copies a message into Saved Messages ("forwarded from <name>"). */
  async saveMessage(m: Message) {
    const saved = await api.saveMessage(m.id);
    this.receiveMessage(saved);
    return saved;
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
export const usePinned = (id: string) => useChat((s) => s.pinned[id] ?? null);
