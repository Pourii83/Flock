import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clock, dayDivider, dayAndTime, lastSeenLabel, sameDay } from '@/lib/format';
import { attachmentSource, openAttachment } from '@/lib/attachments';
import { VideoThumb } from './video-thumb';
import { api } from '@/lib/api';
import { callLine, parseCallLog } from '@/lib/call-log';
import { confirm } from '@/lib/confirm';
import { clearDraft, setDraft, useDraft } from '@/lib/drafts';
import { ensureDevice, safetyCode, useDevice, useSecretStatus } from '@/lib/e2e';
import { systemText } from '@/lib/system-message';
import type { Conversation, Message } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore, useChat, useConversation, useMessages, usePinned, useTyping } from '@/state/chat-store';
import { colors, fonts, radius } from '@/theme';
import { Avatar, ConversationAvatar, MegaphoneIcon } from './avatar';
import { EmojiPicker } from './emoji-picker';
import { LinkedText } from './linked-text';
import { MediaViewer } from './media-viewer';
import { MessageMenu } from './message-menu';
import { ForwardDialog } from './message-menu';
import { Button, Icon, IconButton, PushPin, SearchBar, Tooltip, noOutline, persianFont, T, type IconName } from './ui';
import { t, num, isRTL } from '@/lib/i18n';

type Row =
  | { type: 'message'; message: Message; first: boolean; last: boolean }
  | { type: 'day'; key: string; label: string }
  | { type: 'system'; message: Message }
  | { type: 'call'; message: Message };

function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) rows.push({ type: 'day', key: `day-${m.createdAt}`, label: dayDivider(m.createdAt) });
    if (m.kind === 'system') {
      rows.push({ type: 'system', message: m });
      return;
    }
    if (m.kind === 'call') {
      rows.push({ type: 'call', message: m });
      return;
    }
    const standalone = (x: Message) => x.kind === 'system' || x.kind === 'call';
    const groupedWithPrev = prev && !standalone(prev) && prev.senderId === m.senderId && sameDay(prev.createdAt, m.createdAt) && m.createdAt - prev.createdAt < 5 * 60_000;
    const groupedWithNext = next && !standalone(next) && next.senderId === m.senderId && sameDay(next.createdAt, m.createdAt) && next.createdAt - m.createdAt < 5 * 60_000;
    rows.push({ type: 'message', message: m, first: !groupedWithPrev, last: !groupedWithNext });
  });
  return rows.reverse(); // inverted list
}

export function ChatThread({
  conversationId,
  variant,
  onBack,
  detailsOpen,
  onToggleDetails,
}: {
  conversationId: string;
  variant: 'mobile' | 'desktop';
  onBack?: () => void;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
}) {
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const loadedMessages = useChat((s) => !!s.messages[conversationId]);
  const hasMore = useChat((s) => !!s.hasMore[conversationId]);
  const pinned = usePinned(conversationId);
  const { user } = useAuth();
  // Channels are broadcast-only: only the owner and admins get a composer.
  const myRole = conversation?.members.find((m) => m.id === user?.id)?.role;
  const canPost = conversation?.type !== 'channel' || myRole === 'owner' || myRole === 'admin';
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menu, setMenu] = useState<{ message: Message; point: { x: number; y: number } } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState(false);
  // Mobile multi-select: long-press a bubble to select it, then use the bar that replaces the header.
  const [selection, setSelection] = useState<string[]>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  const scrollRetry = useRef(0);
  const timers = useRef<{ highlight?: ReturnType<typeof setTimeout>; error?: ReturnType<typeof setTimeout> }>({});

  // Parents key this component by conversationId, so local state resets on switch.
  useEffect(() => {
    chatStore.openConversation(conversationId).catch(() => setLoadError(true));
    return () => chatStore.closeConversation(conversationId);
  }, [conversationId]);

  // Mark read when new messages arrive while open.
  useEffect(() => {
    if (conversation?.unreadCount) chatStore.markRead(conversationId);
  }, [conversation?.unreadCount, conversationId]);

  // Clear the transient highlight/error timers on unmount.
  useEffect(() => {
    const current = timers.current;
    return () => {
      clearTimeout(current.highlight);
      clearTimeout(current.error);
    };
  }, []);

  const rows = useMemo(() => buildRows(messages), [messages]);
  const desktop = variant === 'desktop';
  // Android edge-to-edge windows can report the IME without resizing the React tree,
  // so adjust this screen's height explicitly to keep the composer above the keyboard.
  const keyboardBehavior = Platform.select({ ios: 'padding' as const, android: 'height' as const });

  const showError = (text: string) => {
    setActionError(text);
    clearTimeout(timers.current.error);
    timers.current.error = setTimeout(() => setActionError(''), 4000);
  };

  // ---------- mobile multi-select ----------
  const selectedMessages = messages.filter((m) => selection.includes(m.id));
  const clearSelection = () => setSelection([]);
  const toggleSelected = (id: string) => setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const copySelected = async () => {
    const body = selectedMessages.map((m) => m.body).filter(Boolean).join('\n\n');
    if (body) await Clipboard.setStringAsync(body).catch(() => showError(t('Something went wrong')));
    clearSelection();
  };
  const deleteSelected = async () => {
    if (!selectedMessages.length) return;
    const ok = await confirm(t('Delete message'), t('Delete {n} messages?', { n: num(selectedMessages.length) }), t('Delete'), t('Cancel'));
    if (!ok) return;
    for (const message of selectedMessages) {
      try {
        await chatStore.deleteMessage(message);
      } catch {
        showError(t('Could not delete the message'));
        break;
      }
    }
    clearSelection();
  };
  const pinSelected = async () => {
    const first = selectedMessages[0];
    if (!first) return;
    try {
      await chatStore.setPinnedMessage(first, true);
    } catch {
      showError(t('Could not pin the message'));
    }
    clearSelection();
  };
  const saveSelected = async () => {
    const first = selectedMessages[0];
    if (!first) return;
    try {
      await chatStore.saveMessage(first);
    } catch {
      showError(t('This message can’t be saved'));
    }
    clearSelection();
  };

  /** Jumps to a message: pages older history in (bounded) until it is loaded, then highlights it. */
  const jumpTo = async (messageId: string) => {
    const found = await chatStore.findMessage(conversationId, messageId).catch(() => null);
    // Build the current row index from the store snapshot: paging above may have just changed it.
    const currentRows = found ? buildRows(chatStore.state.messages[conversationId] ?? []) : [];
    const index = currentRows.findIndex((row) => row.type === 'message' && row.message.id === messageId);
    if (index < 0) {
      showError(t('Message not found'));
      return;
    }
    setHighlightId(messageId);
    clearTimeout(timers.current.highlight);
    timers.current.highlight = setTimeout(() => setHighlightId(null), 3200);
    scrollRetry.current = 0;
    try {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } catch {
      // Variable-height rows can't always be located; the highlight still points at it.
    }
  };

  if (!conversation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.amberText} />
      </View>
    );
  }

  const unpin = () => {
    if (!pinned) return;
    void chatStore.setPinnedMessage(pinned, false).catch((error) => showError(error instanceof Error ? error.message : t('Could not unpin the message')));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={keyboardBehavior}>
      {selection.length > 0 ? (
        <SelectionBar
          count={selection.length}
          single={selectedMessages.length === 1}
          onClose={clearSelection}
          onReply={() => {
            const first = selectedMessages[0];
            if (first) setReplyTo(first);
            clearSelection();
          }}
          onCopy={() => void copySelected()}
          onForward={() => setForwardOpen(true)}
          onSave={() => void saveSelected()}
          onPin={() => void pinSelected()}
          onDelete={() => void deleteSelected()}
        />
      ) : (
        <ThreadHeader
          conversation={conversation}
          desktop={desktop}
          onBack={onBack}
          detailsOpen={detailsOpen}
          onToggleDetails={onToggleDetails}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen((v) => !v)}
        />
      )}
      {!!pinned && <PinnedBanner message={pinned} conversation={conversation} onOpen={() => void jumpTo(pinned.id)} onUnpin={unpin} />}
      <JoinCallBanner conversation={conversation} />
      {!!conversation.secret && <SecretBanner conversation={conversation} />}
      {searchOpen && (
        <SearchPanel
          conversationId={conversationId}
          onClose={() => setSearchOpen(false)}
          onSelect={(message) => {
            setSearchOpen(false);
            void jumpTo(message.id);
          }}
        />
      )}
      {!!actionError && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.dangerTint, borderBottomWidth: 1, borderBottomColor: colors.surfaceHigh }}>
          <T variant="bodySm" color={colors.danger}>
            {actionError}
          </T>
        </View>
      )}
      {loadError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <T color={colors.textMuted}>{"Couldn't load messages."}</T>
          <Button
            title={t('Retry')}
            size="sm"
            variant="ghost"
            onPress={() => {
              setLoadError(false);
              chatStore.loadMessages(conversationId).catch(() => setLoadError(true));
            }}
          />
        </View>
      ) : !loadedMessages ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.amberText} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          inverted
          data={rows}
          keyExtractor={(r) => (r.type === 'day' ? r.key : r.message.id)}
          onEndReached={() => hasMore && chatStore.loadOlder(conversationId)}
          onEndReachedThreshold={0.3}
          onScrollToIndexFailed={() => {
            // Variable-height rows: retry once the list has laid out, then rely on the highlight.
            if (scrollRetry.current > 0) return;
            scrollRetry.current += 1;
            setTimeout(() => {
              const id = highlightId;
              if (!id) return;
              const currentRows = buildRows(chatStore.state.messages[conversationId] ?? []);
              const index = currentRows.findIndex((row) => row.type === 'message' && row.message.id === id);
              if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
            }, 120);
          }}
          contentContainerStyle={{ paddingHorizontal: desktop ? 32 : 14, paddingVertical: 16, maxWidth: desktop ? 900 : undefined, width: '100%', alignSelf: 'center' }}
          ListFooterComponent={messages.length === 0 ? <EmptyThread conversation={conversation} /> : undefined}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <DayDivider label={item.label} desktop={desktop} />
            ) : item.type === 'system' ? (
              <SystemNote message={item.message} />
            ) : item.type === 'call' ? (
              <CallNote message={item.message} meId={user?.id} />
            ) : (
              <Bubble
                row={item}
                conversation={conversation}
                mine={item.message.senderId === user?.id}
                desktop={desktop}
                highlighted={highlightId === item.message.id}
                menuOpen={menu?.message.id === item.message.id}
                selected={selection.includes(item.message.id)}
                selectionMode={selection.length > 0}
                onToggleSelect={() => toggleSelected(item.message.id)}
                onReply={() => setReplyTo(item.message)}
                onOpenMenu={(point) => setMenu({ message: item.message, point })}
              />
            )
          }
        />
      )}
      <TypingIndicator conversation={conversation} />
      {canPost ? (
        <Composer
          conversation={conversation}
          desktop={desktop}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
        />
      ) : (
        <ReadOnlyBar />
      )}
      {menu && (
        <MessageMenu
          message={menu.message}
          conversation={conversation}
          mine={menu.message.senderId === user?.id}
          pinned={!!menu.message.pinnedAt}
          point={menu.point}
          onReply={() => setReplyTo(menu.message)}
          onEdit={() => setEditing(menu.message)}
          onError={showError}
          onClose={() => setMenu(null)}
        />
      )}
      {forwardOpen && (
        <ForwardDialog
          messages={selectedMessages}
          currentConversationId={conversation.id}
          onClose={() => {
            setForwardOpen(false);
            clearSelection();
          }}
          onError={showError}
        />
      )}
    </KeyboardAvoidingView>
  );
}

/** Where the composer would be in a channel you only read. */
function ReadOnlyBar() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingTop: 14,
        paddingBottom: 14 + insets.bottom,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.surfaceHigh,
      }}>
      <MegaphoneIcon size={16} color={colors.textMuted} />
      <T variant="body" color={colors.textMuted}>
        {t('Only admins can post in this channel')}
      </T>
    </View>
  );
}

/** Telegram-style selection bar: replaces the thread header while messages are selected on mobile. */
function SelectionBar({
  count,
  single,
  onClose,
  onReply,
  onCopy,
  onForward,
  onSave,
  onPin,
  onDelete,
}: {
  count: number;
  single: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onSave: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  // Sits below the status bar / notch like the thread header it replaces, and a bit taller to tap.
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 6,
        paddingTop: insets.top + 12,
        paddingBottom: 12,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      <IconButton name="x" label={t('Cancel')} onPress={onClose} size={36} iconSize={18} />
      <T variant="labelLg" numberOfLines={1} style={{ flex: 1, paddingHorizontal: 6 }}>
        {t('{n} selected', { n: num(count) })}
      </T>
      <IconButton name="corner-up-left" label={t('Reply')} onPress={onReply} disabled={!single} size={36} iconSize={17} />
      <IconButton name="copy" label={t('Copy')} onPress={onCopy} size={36} iconSize={17} />
      <IconButton name="corner-up-right" label={t('Forward')} onPress={onForward} size={36} iconSize={17} />
      <IconButton name="bookmark" label={t('Saved Messages')} onPress={onSave} disabled={!single} size={36} iconSize={17} />
      <Tooltip label={t('Pin')}>
        <Pressable
          onPress={onPin}
          disabled={!single}
          accessibilityRole="button"
          accessibilityLabel={t('Pin')}
          style={({ hovered, pressed }: any) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: single ? 1 : 0.4,
            backgroundColor: hovered || pressed ? colors.surfaceHigh : 'transparent',
          })}>
          <PushPin size={17} color={colors.text} />
        </Pressable>
      </Tooltip>
      <IconButton name="trash-2" label={t('Delete')} onPress={onDelete} color={colors.danger} size={36} iconSize={17} />
    </View>
  );
}

/** Banner under the header for the conversation's pinned message: click to jump, X to unpin. */
function PinnedBanner({
  message,
  conversation,
  onOpen,
  onUnpin,
}: {
  message: Message;
  conversation: Conversation;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  const sender = chatStore.memberName(conversation.id, message.senderId);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: colors.amberTint,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('Pinned message')}
        style={({ hovered }: any) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3, opacity: hovered ? 0.85 : 1 })}>
        <PushPin size={16} color={colors.amberText} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="labelSm" color={colors.amberText}>
            {t('Pinned message')}
          </T>
          <T variant="bodySm" color={colors.text} numberOfLines={1}>
            {`${sender}: ${message.attachment?.name ?? message.body}`}
          </T>
        </View>
      </Pressable>
      <Tooltip label={t('Unpin')}>
        <IconButton name="x" label={t('Unpin')} onPress={onUnpin} size={30} iconSize={15} color={colors.amberText} />
      </Tooltip>
    </View>
  );
}

/** In-conversation message search with debounced server queries and a results list. */
function SearchPanel({
  conversationId,
  onClose,
  onSelect,
}: {
  conversationId: string;
  onClose: () => void;
  onSelect: (message: Message) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const changeQuery = (value: string) => {
    setQuery(value);
    const hasQuery = value.trim().length > 0;
    setLoading(hasQuery);
    if (!hasQuery) {
      setResults([]);
      setSearched(false);
      setError('');
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    // Debounce so the server isn't queried on every keystroke.
    const timer = setTimeout(() => {
      const current = ++requestId.current;
      chatStore
        .searchMessages(conversationId, trimmed)
        .then((list) => {
          if (current !== requestId.current) return;
          setResults(list);
          setSearched(true);
          setError('');
        })
        .catch((e) => {
          if (current !== requestId.current) return;
          setResults([]);
          setSearched(true);
          setError(e instanceof Error ? e.message : t('Could not search messages'));
        })
        .finally(() => {
          if (current === requestId.current) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, conversationId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 8,
        backgroundColor: colors.canvas,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SearchBar value={query} onChangeText={changeQuery} placeholder={t('Search in this conversation')} autoFocus onEscape={onClose} />
        </View>
        {loading && <ActivityIndicator color={colors.amberText} size="small" />}
        <Tooltip label={t('Close search')}>
          <IconButton name="x" label={t('Close search')} onPress={onClose} />
        </Tooltip>
      </View>
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
      {searched && !loading && !error && results.length === 0 && (
        <T variant="bodySm" color={colors.textMuted} style={{ textAlign: 'center', paddingVertical: 12 }}>
          {t('No messages found.')}
        </T>
      )}
      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(message) => message.id}
          style={{ maxHeight: 260 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={t('Go to message')}
              style={({ hovered, pressed }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: radius.md,
                backgroundColor: pressed ? colors.surfaceHighest : hovered ? colors.surfaceHigh : 'transparent',
              })}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {chatStore.memberName(conversationId, item.senderId)}
                  </T>
                  <T variant="bodySm" color={colors.textMuted}>
                    {dayAndTime(item.createdAt)}
                  </T>
                </View>
                <T variant="body" color={colors.textMuted} numberOfLines={2}>
                  {item.kind === 'file' ? `📎 ${item.attachment?.name ?? item.body}` : item.body}
                </T>
              </View>
              <Icon name="chevron-right" size={14} color={colors.textDim} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** The server's upload limit (set at install time), asked once. */
let uploadLimit: Promise<number> | null = null;
function uploadLimitMb() {
  uploadLimit ??= api.health().then(
    (h) => h.maxUploadMb ?? 100,
    () => {
      uploadLimit = null;
      return 100;
    },
  );
  return uploadLimit;
}

// ---------- header ----------

function useStatusLine(conversation: Conversation) {
  const { user } = useAuth();
  const typing = useTyping(conversation.id);
  const others = conversation.members.filter((m) => m.id !== user?.id);
  if (conversation.isSaved) return { text: t('Notes and messages saved for yourself'), color: colors.textMuted, dot: false };
  if (typing.length) {
    if (conversation.type === 'direct') return { text: t('typing…'), color: colors.amber, dot: false };
    const names = typing.map((id) => others.find((o) => o.id === id)?.displayName.split(' ')[0]).filter(Boolean);
    return { text: t('{names} typing…', { names: names.join('، ') }), color: colors.amber, dot: false };
  }
  if (conversation.type === 'direct') {
    const peer = others[0];
    return { text: lastSeenLabel(!!peer?.online, peer?.lastSeen ?? null), color: peer?.online ? colors.teal : colors.textMuted, dot: !!peer?.online };
  }
  const online = others.filter((o) => o.online).length;
  return {
    text: t('{n} members', { n: num(conversation.members.length) }) + (online ? ` · ${t('{n} online', { n: num(online) })}` : ''),
    color: colors.textMuted,
    dot: online > 0,
  };
}

function ThreadHeader({
  conversation,
  desktop,
  onBack,
  detailsOpen,
  onToggleDetails,
  searchOpen,
  onToggleSearch,
}: {
  conversation: Conversation;
  desktop: boolean;
  onBack?: () => void;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  searchOpen?: boolean;
  onToggleSearch?: () => void;
}) {
  const { user } = useAuth();
  const { startCall } = useCalls();
  const insets = useSafeAreaInsets();
  const status = useStatusLine(conversation);
  const peer = conversation.members.find((m) => m.id !== user?.id);
  const pill = conversation.isSaved ? undefined : conversation.type === 'group' ? t('GROUP') : conversation.type === 'channel' ? t('CHANNEL') : peer?.title?.toUpperCase();
  const title = conversation.isSaved ? t('Saved Messages') : conversation.name;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: desktop ? 14 : insets.top + 8,
        paddingBottom: 14,
        paddingHorizontal: desktop ? 24 : 10,
        backgroundColor: desktop ? colors.canvas : colors.bar,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      {onBack && <IconButton name="arrow-left" label={t('Back')} onPress={onBack} iconSize={24} />}
      <Pressable
        onPress={conversation.isSaved ? undefined : onToggleDetails ?? (() => router.push(`/info/${conversation.id}`))}
        accessibilityLabel={conversation.type === 'group' ? t('Group Info') : conversation.type === 'channel' ? t('Channel Info') : t('Contact Info')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <ConversationAvatar conversation={conversation} meId={user?.id} size={desktop ? 48 : 44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {!!conversation.secret && <Icon name="lock" size={desktop ? 18 : 15} color={colors.teal} />}
            <T variant="headlineSm" numberOfLines={1} style={{ fontSize: desktop ? 22 : 18, flexShrink: 0, maxWidth: '75%' }}>
              {title}
            </T>
            {desktop && !!pill && (
              <View style={{ flexShrink: 1, backgroundColor: colors.tealTint, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
                <T variant="labelSm" color={colors.teal} numberOfLines={1}>
                  {pill}
                </T>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {status.dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.online }} />}
            <T variant="body" color={status.color} numberOfLines={1}>
              {status.text}
              {desktop && peer && conversation.type === 'direct' ? `  ·  @${peer.username}` : ''}
            </T>
          </View>
        </View>
      </Pressable>
      {onToggleSearch && (
        <Tooltip label={t('Search in conversation')}>
          <IconButton
            name="search"
            label={t('Search in conversation')}
            onPress={onToggleSearch}
            iconSize={20}
            bg={searchOpen ? colors.surfaceHigh : 'transparent'}
          />
        </Tooltip>
      )}
      {/* One call button: it starts a voice call; the camera is switched on from inside the call. */}
      {!conversation.isSaved && conversation.type !== 'channel' && (
        <Tooltip label={t('Call')}>
          <IconButton name="phone" label={t('Call')} onPress={() => startCall(conversation, false)} iconSize={20} />
        </Tooltip>
      )}
      {onToggleDetails && desktop && !conversation.isSaved && (
        <Tooltip label={t('Toggle details')}>
          <IconButton
            name="sidebar"
            label={t('Toggle details')}
            onPress={onToggleDetails}
            bg={detailsOpen ? colors.surfaceHigh : colors.surface}
            rounded="lg"
            size={44}
          />
        </Tooltip>
      )}
    </View>
  );
}

/** Secret chats: where this chat stands on this device, and accepting it here. */
function SecretBanner({ conversation }: { conversation: Conversation }) {
  const { user } = useAuth();
  const status = useSecretStatus(conversation, user?.id);
  const device = useDevice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const name = conversation.members.find((m) => m.id !== user?.id)?.displayName ?? t('Someone');
  if (!status || !user) return null;

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const mine = await ensureDevice(user.id);
      chatStore.upsertConversation(await api.acceptSecret(conversation.id, mine.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const text =
    status.state === 'ready'
      ? t('End-to-end encrypted. Only this device and {name}’s device can read these messages.', { name })
      : status.state === 'waiting'
        ? t('Waiting for {name} to accept on one of their devices. You can write once they do.', { name })
        : status.state === 'invite'
          ? t('{name} started a secret chat with you. It will be readable only on the device you accept it on.', { name })
          : t('This secret chat lives on another device. Open it there to read and write.');

  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.tealTint, borderBottomWidth: 1, borderBottomColor: colors.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={status.state === 'ready' ? 'lock' : status.state === 'elsewhere' ? 'smartphone' : 'clock'} size={16} color={colors.teal} />
        <T variant="bodySm" style={{ flex: 1 }}>
          {text}
        </T>
        {status.state === 'ready' && (
          <Pressable onPress={() => setCodeOpen((v) => !v)} hitSlop={6}>
            <T variant="label" color={colors.teal}>
              {codeOpen ? t('Hide code') : t('Safety code')}
            </T>
          </Pressable>
        )}
        {status.state === 'invite' && <Button title={t('Accept on this device')} icon="check" size="sm" loading={busy} onPress={() => void accept()} />}
      </View>
      {codeOpen && status.state === 'ready' && device && (
        <View style={{ gap: 4 }}>
          {/* Always left to right: in Persian the groups would otherwise come out in reverse order and the
              code wouldn't match the other phone's at a glance. */}
          <T variant="labelLg" style={{ fontVariant: ['tabular-nums'], letterSpacing: 1, writingDirection: 'ltr', ...(Platform.OS === 'web' ? ({ direction: 'ltr', unicodeBidi: 'isolate' } as object) : {}) }}>
            {`⁦${safetyCode(device.publicKey, status.peerKey)}⁩`}
          </T>
          <T variant="bodySm" color={colors.textMuted}>
            {t('Compare this code with {name} (in person or on a call). If it matches on both devices, nobody is in the middle.', { name })}
          </T>
        </View>
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

/** A call is running in this conversation and this device isn't in it: offer to join. */
function JoinCallBanner({ conversation }: { conversation: Conversation }) {
  const { call, joinCall } = useCalls();
  const running = useChat((s) => s.activeCalls[conversation.id]);
  if (!running?.participants.length || call.callId === running.callId) return null;
  const names = running.participants
    .map((id) => conversation.members.find((m) => m.id === id)?.displayName)
    .filter(Boolean)
    .slice(0, 3)
    .join(isRTL() ? '، ' : ', ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: 'rgba(52, 211, 153, 0.10)',
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(52, 211, 153, 0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={running.video ? 'video' : 'phone'} size={16} color={colors.online} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="labelLg">{t('Call in progress')}</T>
        <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
          {t('{n} in call', { n: num(running.participants.length) })}
          {names ? ` · ${names}` : ''}
        </T>
      </View>
      <Button
        title={t('Join')}
        icon="phone-call"
        size="sm"
        disabled={call.phase !== 'idle'}
        onPress={() => joinCall(conversation.id)}
      />
    </View>
  );
}

// ---------- messages ----------

/** Centered note for group events ("Maya added Leo", "Leo is now an admin"…). */
function SystemNote({ message }: { message: Message }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 8, paddingHorizontal: 24 }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
        <T variant="bodySm" color={colors.textMuted} style={{ textAlign: 'center' }}>
          {systemText(message.body)}
        </T>
      </View>
    </View>
  );
}

/** A finished call, as a compact centered row: icon, what kind of call it was, and how it ended. */
function CallNote({ message, meId }: { message: Message; meId: string | undefined }) {
  const line = callLine(message.call ?? parseCallLog(message, meId));
  const tone = line.missed ? colors.danger : colors.textMuted;
  return (
    <View style={{ alignItems: 'center', marginVertical: 8, paddingHorizontal: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
        <Icon name={line.icon} size={15} color={line.missed ? colors.danger : colors.teal} />
        <T variant="bodySm" color={line.missed ? colors.danger : colors.text}>
          {line.title}
        </T>
        {!!line.sub && (
          <T variant="bodySm" color={tone}>
            {`· ${line.sub}`}
          </T>
        )}
        <T variant="bodySm" color={colors.textDim}>
          {clock(message.createdAt)}
        </T>
      </View>
    </View>
  );
}

function DayDivider({ label, desktop }: { label: string; desktop: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 }}>
      {desktop && <View style={{ flex: 1, height: 1, backgroundColor: colors.surfaceHigh }} />}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingHorizontal: 14,
          paddingVertical: 5,
          marginHorizontal: desktop ? 0 : 'auto',
        }}>
        {!desktop && <Icon name="clock" size={13} color={colors.textMuted} />}
        <T variant="label" color={colors.textMuted} style={{ textTransform: desktop ? 'uppercase' : 'none', letterSpacing: desktop ? 1.2 : 0.2 }}>
          {label}
        </T>
      </View>
      {desktop && <View style={{ flex: 1, height: 1, backgroundColor: colors.surfaceHigh }} />}
    </View>
  );
}

function Receipt({ message, conversation }: { message: Message; conversation: Conversation }) {
  if (message.failed) return <Icon name="alert-circle" size={13} color={colors.danger} />;
  if (message.pending) return <Icon name="clock" size={12} color={colors.textMuted} />;
  const read = conversation.othersReadAt >= message.createdAt;
  return <Icon name={read ? 'check-circle' : 'check'} size={13} color={read ? colors.teal : colors.textMuted} />;
}

function Bubble({
  row,
  conversation,
  mine,
  desktop,
  highlighted,
  menuOpen,
  selected,
  selectionMode,
  onToggleSelect,
  onReply,
  onOpenMenu,
}: {
  row: Extract<Row, { type: 'message' }>;
  conversation: Conversation;
  mine: boolean;
  desktop: boolean;
  highlighted: boolean;
  menuOpen: boolean;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: () => void;
  onReply: () => void;
  onOpenMenu: (point: { x: number; y: number }) => void;
}) {
  const { message: m, first, last } = row;
  const [hovered, setHovered] = useState(false);
  const { user } = useAuth();
  const meId = user?.id;
  const sender = conversation.members.find((u) => u.id === m.senderId);
  const showSender = !mine && first && conversation.type !== 'channel' && (conversation.type === 'group' || desktop);
  const bubbleBg = mine ? colors.amberSoft : colors.bubble;
  const fg = mine ? colors.onAmber : colors.text;
  const r = 20;
  // Pending/failed messages don't exist on the server yet, so they have no menu.
  const canAct = !m.pending && !m.failed;
  const web = Platform.OS === 'web';
  const reactions = (m.reactions ?? []).filter((reaction) => reaction.userIds.length > 0);
  const editedAt = m.editedAt;
  const isPinned = !!m.pinnedAt;

  const openAtPointer = (event: any) => {
    if (!canAct) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onOpenMenu({ x: event?.clientX ?? event?.nativeEvent?.pageX ?? 0, y: event?.clientY ?? event?.nativeEvent?.pageY ?? 0 });
  };
  // On the phone, tapping the empty space beside a bubble opens the same menu.
  const openAtTouch = (event: any) => {
    if (!canAct || selectionMode) return;
    onOpenMenu({
      x: event?.clientX ?? event?.nativeEvent?.pageX ?? event?.nativeEvent?.locationX ?? 24,
      y: event?.clientY ?? event?.nativeEvent?.pageY ?? event?.nativeEvent?.locationY ?? 120,
    });
  };
  // Long-press enters selection mode; afterwards a tap toggles the message in/out.
  const toggleSelection = () => {
    if (canAct) onToggleSelect();
  };
  // The hover "more" button anchors the menu at its own press point.
  const openFromButton = (event: any) => {
    if (!canAct) return;
    onOpenMenu({ x: event?.nativeEvent?.pageX ?? event?.clientX ?? 24, y: event?.nativeEvent?.pageY ?? event?.clientY ?? 120 });
  };

  // Hover actions are only Reply and "more"; the more button opens the same menu as right-click.
  const hoverButton = (icon: IconName, label: string, onPress: (event: any) => void) => (
    <Tooltip key={icon} label={label}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        style={({ hovered: h, pressed }: any) => ({
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: h || pressed ? colors.surfaceHighest : colors.surfaceHigh,
          opacity: hovered || menuOpen ? 1 : 0,
        })}>
        <Icon name={icon} size={15} color={colors.text} />
      </Pressable>
    </Tooltip>
  );
  // Hover actions belong to the desktop layout; phones use long-press selection instead.
  const hoverControls = web && desktop && canAct && (
    <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 4 }}>
      {hoverButton('corner-up-left', t('Reply'), onReply)}
      {hoverButton('more-horizontal', t('Message actions'), openFromButton)}
    </View>
  );

  return (
    <Pressable
      {...(web ? { onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false) } : {})}
      onPress={!desktop ? openAtTouch : undefined}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: first ? 14 : 3, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      {!mine && <View style={{ width: 34 }}>{last && <Avatar user={sender} size={34} showPresence={false} />}</View>}
      {mine && hoverControls}
      <View style={{ maxWidth: desktop ? '72%' : '78%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
        {showSender && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline', paddingHorizontal: 4 }}>
            <T variant="labelLg">{sender?.displayName ?? t('Someone')}</T>
          </View>
        )}
        <Pressable
          onPress={selectionMode ? toggleSelection : m.failed ? () => chatStore.retry(m) : (selectionMode ? undefined : () => {})}
          onLongPress={canAct ? (selectionMode ? toggleSelection : (!web || !desktop ? toggleSelection : undefined)) : undefined}
          delayLongPress={350}
          {...(web && canAct && !selectionMode ? ({ onDoubleClick: onReply, onContextMenu: openAtPointer } as object) : {})}
          style={[
            {
              backgroundColor: bubbleBg,
              paddingHorizontal: 18,
              paddingVertical: 13,
              borderRadius: r,
              borderBottomStartRadius: !mine && !last ? 8 : r,
              borderTopStartRadius: !mine && !first ? 8 : r,
              borderBottomEndRadius: mine && !last ? 8 : mine ? 6 : r,
              borderTopEndRadius: mine && !first ? 8 : r,
              opacity: m.pending ? 0.75 : 1,
              gap: 8,
              borderWidth: highlighted || menuOpen || selected ? 2 : 1,
              borderColor: highlighted || menuOpen || selected ? colors.amber : 'transparent',
            },
            web && (hovered || menuOpen) && ({ filter: 'brightness(1.06)' } as object),
          ]}>
          {m.replyTo && (
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                backgroundColor: mine ? 'rgba(61,38,0,0.08)' : colors.surface,
                borderRadius: 12,
                padding: 10,
              }}>
              <View style={{ width: 3, borderRadius: 2, backgroundColor: colors.amber }} />
              <View style={{ flexShrink: 1 }}>
                <T variant="label" color={mine ? '#8A5A00' : colors.amberText}>
                  {m.replyTo.senderName}
                </T>
                <T variant="body" color={mine ? colors.onAmber : colors.textMuted} numberOfLines={2} style={{ fontStyle: 'italic' }}>
                  {m.replyTo.body}
                </T>
              </View>
            </View>
          )}
          {!!m.forwardedFrom && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="corner-up-right" size={13} color={mine ? '#8A5A00' : colors.amberText} />
              <T variant="label" color={mine ? '#8A5A00' : colors.amberText} numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('Forwarded from {name}', { name: m.forwardedFrom })}
              </T>
            </View>
          )}
          {m.kind === 'file' ? (
            <AttachmentCard message={m} mine={mine} />
          ) : m.kind === 'call_invite' ? (
            <CallInviteCard message={m} mine={mine} />
          ) : (
            <LinkedText variant="bodyLg" color={fg} linkColor={mine ? '#5A3A00' : colors.amberText} style={{ fontSize: 16, lineHeight: 24 }} selectable={desktop}>
              {m.body}
            </LinkedText>
          )}
        </Pressable>
        {reactions.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            {reactions.map((r) => {
              const own = !!meId && r.userIds.includes(meId);
              return (
                <Pressable
                  key={r.emoji}
                  onPress={() => void chatStore.react(m, r.emoji)}
                  accessibilityLabel={r.emoji}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: radius.pill,
                    backgroundColor: own ? colors.amberTint : colors.surfaceHigh,
                    borderWidth: 1,
                    borderColor: own ? colors.amber : 'transparent',
                  }}>
                  <T style={{ fontSize: 15, lineHeight: 20 }}>{r.emoji}</T>
                  <T variant="label" color={own ? colors.amberText : colors.textMuted}>
                    {num(r.userIds.length)}
                  </T>
                </Pressable>
              );
            })}
          </View>
        )}
        {/* Every message shows its own time; pin/edited state lives in the same row. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
          {isPinned && <PushPin size={11} color={colors.textMuted} />}
          <T variant="bodySm" color={m.failed ? colors.danger : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
            {m.failed ? t('Not sent · tap to retry') : clock(m.createdAt)}
          </T>
          {!!editedAt && !m.failed && (
            <T variant="bodySm" color={colors.textDim}>
              {t('Edited')}
            </T>
          )}
          {mine && !conversation.isSaved && <Receipt message={m} conversation={conversation} />}
        </View>
      </View>
      {!mine && hoverControls}
    </Pressable>
  );
}

function bytesLabel(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

function AttachmentCard({ message, mine }: { message: Message; mine: boolean }) {
  const attachment = message.attachment;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(false);
  if (!attachment) return <T color={mine ? colors.onAmber : colors.textMuted}>{t('File unavailable')}</T>;
  const expired = attachment.expired || !attachment.url;
  const image = attachment.mimeType.startsWith('image/');
  const video = attachment.mimeType.startsWith('video/');
  // Photos and videos open in the viewer; the download icon still saves the file.
  const media = image || video;
  // A file message's body is the caption the sender typed; with no caption the server stores the
  // file name, which the card already shows, so it isn't repeated underneath.
  const rawCaption = (message.body ?? '').trim();
  const caption = rawCaption === attachment.name.trim() ? '' : rawCaption;
  const download = async () => {
    if (!attachment.url) return;
    setOpening(true);
    setError('');
    try {
      await openAttachment(attachment.url, attachment.name, attachment.mimeType);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not download file'));
    } finally {
      setOpening(false);
    }
  };
  const press = () => (media ? setViewing(true) : void download());
  return (
    <View style={{ minWidth: 210, maxWidth: 320, gap: 8 }}>
      <MediaViewer
        media={viewing && attachment.url ? { url: attachment.url, name: attachment.name, mimeType: attachment.mimeType } : null}
        onClose={() => setViewing(false)}
      />
      {media && !expired && attachment.url ? (
        // Photos/videos: the file name and download sit on the image's top-right corner, so the
        // caption can breathe underneath.
        <View style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface }}>
          <Pressable onPress={() => setViewing(true)} accessibilityLabel={attachment.name} style={{ width: '100%' }}>
            {image ? (
              <Image source={attachmentSource(attachment.url)} style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface }} contentFit="cover" />
            ) : (
              <View style={{ width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, overflow: 'hidden' }}>
                <VideoThumb url={attachment.url} size={attachment.size} />
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="play" size={22} color={colors.text} />
                </View>
              </View>
            )}
          </Pressable>
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, end: 8, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '86%' }}>
            <View
              style={{
                maxWidth: '72%',
                backgroundColor: colors.glass,
                borderWidth: 1,
                borderColor: colors.hairline,
                borderRadius: radius.pill,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}>
              <T variant="labelSm" color={colors.text} numberOfLines={1}>
                {attachment.name}
              </T>
            </View>
            <Tooltip label={t('Download')}>
              <IconButton
                name="download"
                label={t('Download')}
                size={30}
                iconSize={14}
                color={colors.text}
                bg={colors.glass}
                activeBg={colors.surfaceHigh}
                disabled={opening}
                onPress={() => void download()}
              />
            </Tooltip>
          </View>
        </View>
      ) : (
        <Pressable onPress={press} disabled={expired || opening} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.10)' : colors.surface }}>
            {opening ? <ActivityIndicator color={mine ? colors.onAmber : colors.amberText} /> : <Icon name={expired ? 'clock' : image ? 'image' : video ? 'film' : 'file'} size={20} color={mine ? colors.onAmber : colors.amberText} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="labelLg" color={mine ? colors.onAmber : colors.text} numberOfLines={2}>{attachment.name}</T>
            <T variant="bodySm" color={mine ? '#72521B' : colors.textMuted}>
              {expired ? t('File expired') : `${bytesLabel(attachment.size)} · ${t('Original quality')}`}
            </T>
          </View>
          {!expired && (
            <IconButton
              name="download"
              label={t('Download')}
              size={36}
              iconSize={18}
              color={mine ? colors.onAmber : colors.amberText}
              activeBg={mine ? 'rgba(61,38,0,0.10)' : colors.surface}
              disabled={opening}
              onPress={() => void download()}
            />
          )}
        </Pressable>
      )}
      {!!caption && (
        <LinkedText
          variant="bodyLg"
          color={mine ? colors.onAmber : colors.text}
          linkColor={mine ? '#5A3A00' : colors.amberText}
          style={{ fontSize: 16, lineHeight: 24 }}>
          {caption}
        </LinkedText>
      )}
      {!!error && <T variant="bodySm" color={colors.danger}>{error}</T>}
    </View>
  );
}

function CallInviteCard({ message, mine }: { message: Message; mine: boolean }) {
  const { call, joinInvitedCall } = useCalls();
  let data: { callId?: string; title?: string; inviter?: string } = {};
  try { data = JSON.parse(message.body); } catch { /* Older malformed invite: render as ended. */ }
  const [active, setActive] = useState<boolean | null>(() => data.callId ? null : false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    if (!data.callId) return;
    api.invitedCall(data.callId).then(() => mounted && setActive(true)).catch(() => mounted && setActive(false));
    return () => { mounted = false; };
  }, [data.callId]);

  const join = async () => {
    if (!data.callId) return;
    setJoining(true);
    setError('');
    try {
      await joinInvitedCall(data.callId);
    } catch (e) {
      setActive(false);
      setError(e instanceof Error ? e.message : t('This call has ended'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={{ minWidth: 230, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.10)' : colors.tealTint }}>
          <Icon name="phone-call" size={20} color={mine ? colors.onAmber : colors.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="labelLg" color={mine ? colors.onAmber : colors.text}>{t('Group call invitation')}</T>
          <T variant="bodySm" color={mine ? '#72521B' : colors.textMuted} numberOfLines={1}>{data.title ?? t('Group call')}</T>
        </View>
      </View>
      {active === false ? (
        <T variant="bodySm" color={mine ? '#72521B' : colors.textMuted}>{t('This call has ended')}</T>
      ) : (
        <Button
          title={active === null ? t('Checking call…') : t('Join call')}
          icon="phone-call"
          size="sm"
          variant={mine ? 'ghost' : 'primary'}
          disabled={active !== true || call.phase !== 'idle'}
          loading={joining}
          onPress={() => void join()}
        />
      )}
      {!!error && <T variant="bodySm" color={colors.danger}>{error}</T>}
    </View>
  );
}

function EmptyThread({ conversation }: { conversation: Conversation }) {
  if (conversation.isSaved)
    return (
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bookmark" size={28} color={colors.amberText} />
        </View>
        <T variant="headlineSm">{t('Saved Messages')}</T>
        <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
          {t('Write notes to yourself, or save any message here with its bookmark button.')}
        </T>
      </View>
    );
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 48 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="message-circle" size={28} color={colors.amberText} />
      </View>
      <T variant="headlineSm">{t('Start the conversation')}</T>
      <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
        {t('Say hi to {name} — messages appear here in real time.', { name: conversation.name })}
      </T>
    </View>
  );
}

function TypingIndicator({ conversation }: { conversation: Conversation }) {
  const typing = useTyping(conversation.id);
  if (!typing.length) return null;
  const names = typing.map((id) => conversation.members.find((m) => m.id === id)?.displayName.split(' ')[0]).filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[0.4, 0.7, 1].map((o) => (
          <View key={o} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber, opacity: o }} />
        ))}
      </View>
      <T variant="bodySm" color={colors.textMuted}>
        {t(names.length > 1 ? '{names} are typing…' : '{names} is typing…', { names: names.join(isRTL() ? '، ' : ', ') })}
      </T>
    </View>
  );
}

// ---------- composer ----------

function Composer({
  conversation,
  desktop,
  replyTo,
  onClearReply,
  editing,
  onCancelEdit,
}: {
  conversation: Conversation;
  desktop: boolean;
  replyTo: Message | null;
  onClearReply: () => void;
  /** Message being edited: the composer prefills it and Saves instead of Sending. */
  editing: Message | null;
  onCancelEdit: () => void;
}) {
  const { user } = useAuth();
  const secret = useSecretStatus(conversation, user?.id);
  const blocked = !!conversation.secret && secret?.state !== 'ready';
  const filesAllowed = !conversation.secret;
  // Unsent text lives in the per-conversation draft store (restored when switching chats).
  const draft = useDraft(conversation.id);
  const [editText, setEditText] = useState<string | null>(null);
  // While editing, the composer is detached from the draft; cancel restores the draft untouched.
  const text = editing ? (editText ?? editing.body) : draft;
  const setText = (value: string) => {
    if (editing) setEditText(value);
    else setDraft(conversation.id, value);
  };
  const seenEditId = useRef<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** 0..1 while a file is uploading (web/desktop); null otherwise. */
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  /** A file is being dragged over the app: show the drop hint while the chat is open. */
  const [dragOver, setDragOver] = useState(false);
  // Image/file staged from a paste or the picker: waits for Send with an optional caption.
  const [staged, setStaged] = useState<{ asset: DocumentPicker.DocumentPickerAsset; preview: string | null } | null>(null);
  const [caption, setCaption] = useState('');
  const inputRef = useRef<TextInputInstance>(null);
  const captionRef = useRef<TextInputInstance>(null);
  const [inputHeight, setInputHeight] = useState(50);
  const insets = useSafeAreaInsets();
  const canSend = !uploading && !savingEdit && (text.trim().length > 0 || (!!staged && !editing));

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    // scrollHeight cannot shrink below a fixed textarea height; measure it unconstrained.
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) return;
    const previous = node.style.height;
    node.style.height = '0px';
    const height = node.scrollHeight;
    node.style.height = previous;
    setInputHeight(Math.min(140, Math.max(50, height)));
  }, [text]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  // Entering edit mode prefills the input once; store updates must not clobber the typed text.
  useEffect(() => {
    if (!editing) return;
    if (seenEditId.current === editing.id) return;
    seenEditId.current = editing.id;
    setEditText(editing.body);
    setEmojiOpen(false);
    setStaged(null);
    setCaption('');
    inputRef.current?.focus();
  }, [editing]);

  // Release the local object URL of a staged web image.
  useEffect(() => {
    const preview = staged?.preview;
    return () => {
      if (preview?.startsWith('blob:') && typeof URL !== 'undefined') URL.revokeObjectURL(preview);
    };
  }, [staged]);

  const saveEdit = async () => {
    const body = text.trim();
    if (!editing || !body || savingEdit) return;
    setSavingEdit(true);
    setUploadError('');
    try {
      await chatStore.editMessage(editing, body);
      onCancelEdit();
      setEditText(null);
      inputRef.current?.focus();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('Could not save changes'));
    } finally {
      setSavingEdit(false);
    }
  };

  const onChange = (value: string) => {
    setText(value);
    if (!editing) chatStore.notifyTyping(conversation.id, value.length > 0);
  };

  const insertEmoji = (emoji: string) => {
    setText(text + emoji);
    inputRef.current?.focus();
  };

  const checkSize = async (asset: DocumentPicker.DocumentPickerAsset) => {
    const maxMb = await uploadLimitMb();
    if ((asset.size ?? 0) > maxMb * 1024 * 1024) {
      setUploadError(t('Files can be up to {n} MB', { n: num(maxMb) }));
      return false;
    }
    return true;
  };

  /** Pasting, picking or dropping a file stages it with a preview and a caption; Send uploads it. */
  const stageAsset = async (asset: DocumentPicker.DocumentPickerAsset) => {
    setUploadError('');
    if (!(await checkSize(asset))) return;
    const blob = (asset as { file?: Blob }).file;
    const preview = asset.uri?.startsWith('blob:') ? asset.uri : blob && typeof URL !== 'undefined' ? URL.createObjectURL(blob) : (asset.uri || null);
    setStaged({ asset, preview });
    setCaption('');
    setEmojiOpen(false);
    setTimeout(() => captionRef.current?.focus(), 50);
  };

  const cancelStaged = () => {
    setStaged(null);
    setCaption('');
    setUploadError('');
  };

  const sendStaged = async () => {
    if (!staged || uploading) return;
    if (!(await checkSize(staged.asset))) return;
    setUploading(true);
    setUploadError('');
    setProgress(0);
    try {
      await chatStore.sendFile(conversation.id, staged.asset, replyTo, caption, (f) => setProgress(f));
      setStaged(null);
      setCaption('');
      onClearReply();
      inputRef.current?.focus();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('Could not upload file'));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const pickFile = async () => {
    setUploadError('');
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false, base64: false });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    // Any file (image, zip, document, …) waits in the composer for Send/Cancel, like Telegram.
    if (asset) await stageAsset(asset);
  };

  /** Send button / Enter: saves an edit, uploads a staged attachment, or sends the typed message. */
  const send = () => {
    if (editing) {
      void saveEdit();
      return;
    }
    if (staged) {
      void sendStaged();
      return;
    }
    const body = text.trim();
    if (!body) return;
    setText('');
    setEmojiOpen(false);
    chatStore.notifyTyping(conversation.id, false);
    chatStore.send(conversation.id, body, replyTo);
    onClearReply();
    inputRef.current?.focus();
  };

  // Ctrl+V with an image on the clipboard stages it for a caption. Web only: native TextInput has  // no paste event. Clipboards holding text too (Word, Excel) paste as text.
  const stageRef = useRef(stageAsset);
  useEffect(() => {
    stageRef.current = stageAsset;
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || blocked || !filesAllowed) return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) return;
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data || data.getData('text/plain')) return;
      const file = Array.from(data.items)
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile();
      if (!file) return;
      event.preventDefault();
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*/, '') || 'png';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${stamp}.${ext}`;
      const named = new File([file], name, { type: file.type });
      void stageRef.current({
        uri: '', // unused on web: the upload sends `file`
        name,
        size: named.size,
        mimeType: named.type,
        lastModified: named.lastModified,
        file: named,
      });
    };
    node.addEventListener('paste', onPaste);
    return () => node.removeEventListener('paste', onPaste);
  }, [blocked, filesAllowed]);

  // Drag a file from the OS onto the chat: stage it for a caption, same as paste/pick.
  useEffect(() => {
    if (Platform.OS !== 'web' || blocked || !filesAllowed) return;
    const hasFiles = (event: DragEvent) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (event: DragEvent) => {
      // relatedTarget is set while moving between elements; only a window leave ends the drag.
      if (event.relatedTarget) return;
      setDragOver(false);
    };
    const onDrop = (event: DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      event.preventDefault();
      setDragOver(false);
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*/, '') || 'bin';
      void stageRef.current({
        uri: '', // unused on web: the upload sends `file`
        name: file.name || `dropped-${Date.now()}.${ext}`,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        file,
      });
    };
    const onDragEnd = () => setDragOver(false);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onDragEnd);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onDragEnd);
    };
  }, [blocked, filesAllowed]);


  const firstName = conversation.type === 'direct' ? conversation.name.split(' ')[0] : conversation.name;
  const placeholder = conversation.isSaved
    ? t('Write a note…')
    : desktop
      ? t('Type a message to {name}…', { name: firstName })
      : t('Message {name}…', { name: firstName });
  // Secret chat not usable on this device yet: the banner above says why.
  if (blocked) return null;

  return (
    <View
      style={{
        paddingHorizontal: desktop ? 24 : 12,
        paddingTop: 10,
        paddingBottom: desktop ? 18 : Math.max(insets.bottom, 12),
        backgroundColor: desktop ? colors.canvas : colors.barDeep,
        borderTopWidth: desktop ? 1 : 0,
        borderTopColor: colors.surfaceHigh,
        gap: 10,
      }}>
      {editing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10, paddingLeft: 14 }}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.amber }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="label" color={colors.amberText}>
              {t('Editing message')}
            </T>
            <T variant="body" color={colors.textMuted} numberOfLines={1}>
              {editing.body}
            </T>
          </View>
          <Tooltip label={t('Cancel edit')}>
            <IconButton
              name="x"
              label={t('Cancel edit')}
              onPress={() => {
                onCancelEdit();
                setEditText(null);
                inputRef.current?.focus();
              }}
              size={32}
              iconSize={16}
            />
          </Tooltip>
        </View>
      )}
      {replyTo && !editing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10, paddingLeft: 14 }}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.amber }} />
          <View style={{ flex: 1 }}>
            <T variant="label" color={colors.amberText}>
              {t('Replying to {name}', { name: chatStore.memberName(conversation.id, replyTo.senderId) })}
            </T>
            <T variant="body" color={colors.textMuted} numberOfLines={1}>
              {replyTo.body}
            </T>
          </View>
          <IconButton name="x" label={t('Cancel reply')} onPress={onClearReply} size={32} iconSize={16} />
        </View>
      )}
      {staged && (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            padding: 10,
          }}>
          {staged.preview ? (
            <Image source={{ uri: staged.preview }} style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: colors.surfaceHigh }} contentFit="cover" />
          ) : (
            <View style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="file" size={22} color={colors.amberText} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                {staged.asset.name}
              </T>
              <T variant="bodySm" color={colors.textMuted}>
                {bytesLabel(staged.asset.size ?? 0)}
              </T>
            </View>
            <TextInput
              ref={captionRef}
              value={caption}
              onChangeText={setCaption}
              placeholder={t('Add a caption…')}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                {
                  minHeight: 38,
                  maxHeight: 88,
                  backgroundColor: colors.canvas,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.surfaceHigh,
                  color: colors.text,
                  fontFamily: fonts.regular,
                  fontSize: 14,
                  lineHeight: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                },
                noOutline,
                persianFont(caption || t('Add a caption…'), { fontFamily: fonts.regular }),
              ]}
            />
          </View>
          <View style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <IconButton name="x" label={t('Cancel')} onPress={cancelStaged} size={30} iconSize={15} />
            <Pressable
              onPress={() => void sendStaged()}
              disabled={uploading}
              accessibilityLabel={t('Send')}
              style={({ pressed, hovered }: any) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.amber,
                opacity: uploading ? 0.6 : pressed || hovered ? 0.9 : 1,
                alignItems: 'center',
                justifyContent: 'center',
              })}>
              {uploading ? <ActivityIndicator color={colors.onAmber} size="small" /> : <Icon name="send" size={17} color={colors.onAmber} />}
            </Pressable>
          </View>
        </View>
      )}
      {progress !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T variant="bodySm" color={colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
            {t('Uploading…')} {Math.round(progress * 100)}%
          </T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(2, Math.round(progress * 100))}%`, height: '100%', backgroundColor: colors.amber }} />
          </View>
        </View>
      )}
      {emojiOpen && (
        <EmojiPicker
          onPick={insertEmoji}
          onClose={() => setEmojiOpen(false)}
          maxHeight={desktop ? 240 : 200}
          style={!desktop && { maxWidth: undefined }}
        />
      )}
      {!!uploadError && <T variant="bodySm" color={colors.danger}>{uploadError}</T>}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        {!desktop && filesAllowed && (
          <IconButton
            name="plus"
            label={t('Upload file')}
            onPress={() => void pickFile()}
            disabled={uploading}
            size={52}
            iconSize={24}
            bg={colors.surface}
          />
        )}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: desktop ? radius.lg : 26,
            borderWidth: 1.5,
            borderColor: colors.surfaceHigh,
            paddingLeft: desktop ? 8 : 20,
            paddingRight: 8,
            minHeight: 52,
          }}>
          {desktop && (
            <>
              {filesAllowed && <IconButton name="paperclip" label={t('Upload file')} onPress={() => void pickFile()} disabled={uploading} color={colors.textMuted} />}
              <IconButton name="smile" label={t('Emoji')} onPress={() => setEmojiOpen((v) => !v)} color={emojiOpen ? colors.amberText : colors.textMuted} />
            </>
          )}
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={1}
            onContentSizeChange={(event) => {
              // Web sizes itself in the layout effect above: measuring here resizes the textarea,
              // which fires this event again and locks the page in a loop.
              if (Platform.OS === 'web') return;
              setInputHeight(Math.min(140, Math.max(50, event.nativeEvent.contentSize.height)));
            }}
            onKeyPress={(e: any) => {
              if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={[
              {
                flex: 1,
                color: colors.text,
                fontFamily: fonts.regular,
                fontSize: 16,
                lineHeight: 22,
                paddingVertical: 14,
                paddingHorizontal: desktop ? 8 : 0,
                maxHeight: 140,
                height: text ? inputHeight : 50,
                textAlignVertical: 'center',
              },
              noOutline,
              persianFont(text || placeholder, { fontFamily: fonts.regular }),
            ]}
          />
          {!desktop && (
            <IconButton name="smile" label={t('Emoji')} onPress={() => setEmojiOpen((v) => !v)} color={emojiOpen ? colors.amberText : colors.textMuted} iconSize={22} />
          )}
          {desktop && (
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityLabel={editing ? t('Save changes') : t('Send')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: canSend ? colors.amber : colors.surfaceHigh,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {savingEdit ? <ActivityIndicator color={colors.onAmber} size="small" /> : <Icon name={editing ? 'check' : 'send'} size={18} color={canSend ? colors.canvas : colors.textMuted} />}
            </Pressable>
          )}
        </View>
        {!desktop && (
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityLabel={editing ? t('Save changes') : t('Send')}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.amber,
              opacity: canSend ? 1 : 0.55,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : 1 }],
              shadowColor: colors.amber,
              shadowOpacity: canSend ? 0.4 : 0,
              shadowRadius: 12,
            })}>
            {savingEdit ? <ActivityIndicator color={colors.onAmber} /> : <Icon name={editing ? 'check' : 'send'} size={22} color={colors.canvas} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}
