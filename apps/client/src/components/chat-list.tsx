import { compareConversations } from '@/lib/conversation-order';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { ContextMenu, type ContextMenuItem } from '@/components/context-menu';
import { ChangelogModal, UpdateBanner } from '@/components/update-banner';
import { useDraft, useDraftTimes } from '@/lib/drafts';
import { shortTime } from '@/lib/format';
import { systemText } from '@/lib/system-message';
import type { Conversation } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, fonts, radius } from '@/theme';
import { ConversationAvatar, MegaphoneIcon, isSavedConversation } from './avatar';
import { Button, Chip, CHIP_HEIGHT, Icon, IconButton, PushPin, SearchBar, T, Tooltip, UnreadBadge } from './ui';
import { VoiceBar } from './voice-bar';
import { ConnectionBanner, MobileHeader } from './shell';
import { t, num, isRTL } from '@/lib/i18n';

type Filter = 'all' | 'unread' | 'groups' | 'channels';

/** Window coordinates of a press. react-native-web exposes clientX/clientY or pageX/pageY. */
function pressPoint(event: any): { x: number; y: number } {
  const native = event?.nativeEvent ?? event ?? {};
  const web = typeof window !== 'undefined' ? (window as any).event : undefined;
  const x = native.pageX ?? native.clientX ?? event?.pageX ?? event?.clientX ?? web?.clientX;
  const y = native.pageY ?? native.clientY ?? event?.pageY ?? event?.clientY ?? web?.clientY;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : { x: 24, y: 120 };
}

function useFilteredConversations(query: string, filter: Filter) {
  const all = useChat((s) => s.conversations);
  const draftTimes = useDraftTimes();
  // A chat with an unsent draft moves up to when the draft was started (pinned chats stay first).
  const conversations = useMemo(() => {
    if (!Object.keys(draftTimes).length) return all;
    const at = (c: Conversation) => Math.max(c.updatedAt, draftTimes[c.id] ?? 0);
    return [...all].sort((a, b) => compareConversations(a, b, at));
  }, [all, draftTimes]);
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unreadCount === 0) return false;
      if (filter === 'groups' && c.type !== 'group') return false;
      if (filter === 'channels' && c.type !== 'channel') return false;
      if (!q) return true;
      return (
        (isSavedConversation(c) ? t('Saved Messages') : c.name).toLowerCase().includes(q) ||
        c.members.some((m) => m.username.toLowerCase().includes(q)) ||
        (c.lastMessage?.kind === 'file' ? c.lastMessage.attachment?.name : c.lastMessage?.kind === 'text' ? c.lastMessage.body : '')?.toLowerCase().includes(q)
      );
    });
  }, [conversations, query, filter]);
}

function Preview({ c, meId, typing, draft }: { c: Conversation; meId?: string; typing: boolean; draft?: string }) {
  if (typing)
    return (
      <T variant="body" color={colors.amberText} numberOfLines={1} style={{ flex: 1 }}>
        {t('typing…')}
      </T>
    );
  if (draft)
    return (
      <T variant="body" color={colors.textMuted} numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
        <T variant="body" color={colors.danger} style={{ fontSize: 15 }}>
          {`${t('Draft:')} `}
        </T>
        {draft.replace(/\s+/g, ' ')}
      </T>
    );
  const m = c.lastMessage;
  if (!m)
    return (
      <T variant="body" color={colors.textDim} numberOfLines={1} style={{ flex: 1 }}>
        {t('Say hello 👋')}
      </T>
    );
  if (m.kind === 'system')
    return (
      <T variant="body" color={colors.textMuted} numberOfLines={1} style={{ flex: 1, fontStyle: 'italic' }}>
        {systemText(m.body)}
      </T>
    );
  const preview = m.kind === 'file' && m.attachment?.mimeType.startsWith('audio/') ? `🎤 ${t('Voice message')}` : m.kind === 'file' ? t('File: {name}', { name: m.attachment?.name ?? t('File') }) : m.kind === 'call_invite' ? t('Group call invitation') : m.body;
  const mine = m.senderId === meId;
  const read = mine && c.othersReadAt >= m.createdAt;
  const sender = c.type === 'group' && !mine ? `${c.members.find((u) => u.id === m.senderId)?.displayName.split(' ')[0]}: ` : '';
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {mine && <Icon name={read ? 'check-circle' : 'check'} size={14} color={read ? colors.teal : colors.textMuted} />}
      <T variant="body" color={c.unreadCount ? colors.text : colors.textMuted} numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
        {sender}
        {preview}
      </T>
    </View>
  );
}

/**
 * A quick look at a chat without opening it: Alt+click on the web, long-press on phones. The thread is
 * read-only here and nothing gets marked as read.
 */
function ChatPreviewDialog({ c, visible, onClose, onOpen }: { c: Conversation; visible: boolean; onClose: () => void; onOpen: () => void }) {
  const { user } = useAuth();
  const messages = useChat((s) => s.messages[c.id]);
  const typing = useChat((s) => (s.typing[c.id]?.length ?? 0) > 0);
  const name = isSavedConversation(c) ? t('Saved Messages') : c.name;

  // Peeking loads the thread if it was never opened; it stays unread.
  useEffect(() => {
    if (!visible || messages?.length) return;
    void chatStore.loadMessages(c.id).catch(() => {});
  }, [visible, c.id, messages]);

  const recent = (messages ?? []).slice(-14);
  const group = c.type !== 'direct';
  return (
    <Modal transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: '78%',
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            backgroundColor: colors.rail,
            padding: 18,
            gap: 14,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ConversationAvatar conversation={c} meId={user?.id} size={44} ringBg={colors.rail} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="labelLg" numberOfLines={1}>
                {name}
              </T>
              <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                {t('Chat preview')}
                {group ? ` · ${t('{n} members', { n: num(c.members.length) })}` : ''}
              </T>
            </View>
            <IconButton name="x" label={t('Close')} onPress={onClose} size={32} iconSize={16} />
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
            {recent.length === 0 ? (
              <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', paddingVertical: 18 }}>
                {typing ? t('typing…') : t('Say hello 👋')}
              </T>
            ) : (
              recent.map((m) => {
                const mine = m.senderId === user?.id;
                const sender = !mine && group ? chatStore.memberName(c.id, m.senderId) : '';
                const text = m.kind === 'file' ? t('File: {name}', { name: m.attachment?.name ?? t('File') }) : m.body;
                return (
                  <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    <View style={{ maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: mine ? colors.amberSoft : colors.surface }}>
                      {!!sender && (
                        <T variant="labelSm" color={colors.amberText} numberOfLines={1}>
                          {sender}
                        </T>
                      )}
                      <T variant="body" color={mine ? colors.onAmberSoft : colors.text}>
                        {text}
                      </T>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* The long-press menu's actions stay reachable from here. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button title={c.pinned ? t('Unpin') : t('Pin')} variant="ghost" size="sm" onPress={() => void chatStore.setPinned(c.id, !c.pinned)} />
            <Button title={c.muted ? t('Unmute') : t('Mute')} variant="ghost" size="sm" onPress={() => void chatStore.setMuted(c.id, !c.muted)} />
            <Button title={t('Mark as read')} variant="ghost" size="sm" disabled={!c.unreadCount} onPress={() => chatStore.markRead(c.id)} />
          </View>
          <Button title={t('Open chat')} icon="message-square" onPress={onOpen} />
        </View>
      </View>
    </Modal>
  );
}

export function ChatRow({
  c,
  selected,
  onPress,
  card,
  canMoveUp,
  canMoveDown,
}: {
  /** Pinned chats: whether there's another pin above / below to swap with. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  c: Conversation;
  selected?: boolean;
  onPress: () => void;
  /** Mobile renders each row as a rounded card (Stitch mobile list). */
  card?: boolean;
}) {
  const { user } = useAuth();
  const typing = useChat((s) => (s.typing[c.id]?.length ?? 0) > 0);
  // The open chat shows its draft in its own composer; every other chat shows it here.
  const draft = useDraft(c.id);
  const unread = c.unreadCount > 0;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState(false);
  // Alt+click peeks at the chat instead of opening it (web). Listened to on the element itself: the
  // press handler never fires while a modifier key is held, and onClick isn't passed through.
  const rowRef = useRef<ComponentRef<typeof Pressable>>(null);
  useEffect(() => {
    const node = rowRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !node?.addEventListener) return;
    const onClick = (event: MouseEvent) => {
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      setPreview(true);
    };
    node.addEventListener('click', onClick, true);
    return () => node.removeEventListener('click', onClick, true);
  }, []);
  const name = isSavedConversation(c) ? t('Saved Messages') : c.name;

  // Right-click on desktop (and the actions row in the preview): pin, mute and mark-read.
  const openMenu = (event: any) => {
    event?.preventDefault?.();
    setMenu(pressPoint(event));
  };
  const items: ContextMenuItem[] = [
    { pin: true, label: c.pinned ? t('Unpin') : t('Pin'), onPress: () => void chatStore.setPinned(c.id, !c.pinned) },
    { icon: c.muted ? 'bell' : 'bell-off', label: c.muted ? t('Unmute') : t('Mute'), onPress: () => void chatStore.setMuted(c.id, !c.muted) },
    // Pinned chats can be reordered: one place up or down among the pins.
    ...(c.pinned && canMoveUp ? [{ icon: 'arrow-up' as const, label: t('Move up'), onPress: () => void chatStore.movePinned(c.id, -1) }] : []),
    ...(c.pinned && canMoveDown ? [{ icon: 'arrow-down' as const, label: t('Move down'), onPress: () => void chatStore.movePinned(c.id, 1) }] : []),
    { icon: 'check-circle', label: t('Mark as read'), disabled: !unread, onPress: () => chatStore.markRead(c.id) },
  ];

  return (
    <>
      <Pressable
        onPress={() => onPress()}
        // Long-press on a phone opens the same peek (its actions live in the preview).
        onLongPress={() => setPreview(true)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={name}
        ref={rowRef}
        {...(Platform.OS === 'web' ? { onContextMenu: openMenu } : {})}
        style={({ hovered, pressed }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 14,
          // The 3px amber edge is 2px thicker than the others' 1px: take it back so the content doesn't shift.
          paddingStart: selected ? 12 : 14,
          paddingVertical: card ? 16 : 12,
          minHeight: 68,
          borderRadius: radius.lg,
          // Stitch: phone rows are cards; the open chat on desktop is a card with a soft amber edge.
          backgroundColor: pressed ? colors.surfaceHigh : selected || card ? colors.surface : hovered ? colors.hover : 'transparent',
          borderWidth: 1,
          borderColor: selected ? colors.amberGlow : card ? colors.border : 'transparent',
          // The open chat is marked by its leading edge drawn as one amber line.
          borderStartWidth: selected ? 3 : 1,
          borderStartColor: selected ? colors.amber : card ? colors.border : 'transparent',
          // Desktop rows run the full width of the list, past the header's padding.
          marginHorizontal: card ? 0 : -8,
        })}>
        <ConversationAvatar conversation={c} meId={user?.id} size={card ? 52 : 48} ringBg={selected ? colors.surface : colors.canvas} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!c.secret && <Icon name="lock" size={13} color={colors.teal} />}
            <T variant="labelLg" numberOfLines={1} style={{ flexShrink: 1, fontSize: card ? 17 : 15, fontFamily: unread ? fonts.bold : fonts.medium }}>
              {name}
            </T>
            {c.pinned && <PushPin size={12} color={colors.textMuted} />}
            {c.muted && <Icon name="bell-off" size={12} color={colors.textMuted} />}
            <View style={{ flex: 1 }} />
            <T variant="label" color={unread ? colors.amberText : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
              {shortTime(c.updatedAt)}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Preview c={c} meId={user?.id} typing={typing} draft={selected ? undefined : draft.trim() || undefined} />
            <UnreadBadge count={c.unreadCount} style={c.muted ? { backgroundColor: colors.surfaceHighest } : undefined} />
          </View>
        </View>
      </Pressable>
      <ContextMenu point={menu} items={items} title={name} onClose={() => setMenu(null)} />
      <ChatPreviewDialog
        c={c}
        visible={preview}
        onClose={() => setPreview(false)}
        onOpen={() => {
          setPreview(false);
          onPress();
        }}
      />
    </>
  );
}

/**
 * The filter chips: one row that scrolls sideways when they don't fit, instead of wrapping onto a second
 * line. An edge with more chips beyond it shows a thin accent line, so it's clear the row goes on
 * (user request). Desktop web also shows a thin scrollbar under the chips on hover (CSS in index.html);
 * phones (and the apps) swipe it, with no scrollbar and no space kept for one.
 */
function ChipRow({ desktop, children }: { desktop: boolean; children: ReactNode }) {
  const [box, setBox] = useState({ view: 0, content: 0, x: 0 });
  // RTL web reports the offset as negative from the start edge, so only its size counts.
  const room = box.content - box.view;
  const moreAtStart = room > 1 && Math.abs(box.x) > 1;
  const moreAtEnd = room > 1 && Math.abs(box.x) < room - 1;
  const rtl = isRTL();
  const fade = (edge: 'start' | 'end') => (
    <LinearGradient
      pointerEvents="none"
      // A thin line of accent at the edge that fades out within a few pixels (user request: a line, not a glow).
      colors={[colors.amberLine, colors.amberClear]}
      // From the edge inward: the physical direction flips in Persian, where "start" is the right side.
      start={{ x: (edge === 'start') !== rtl ? 0 : 1, y: 0 }}
      end={{ x: (edge === 'start') !== rtl ? 1 : 0, y: 0 }}
      // As tall as the pills (the row's desktop scrollbar space below them stays clear).
      style={{ position: 'absolute', top: 0, height: CHIP_HEIGHT, width: 4, [edge]: 0, borderRadius: 2 }}
    />
  );
  return (
    <View style={{ flexGrow: desktop ? 1 : 0, flexShrink: 1, minWidth: 0 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web' && desktop}
        {...(desktop ? ({ dataSet: { hscroll: 'hover' } } as object) : {})}
        onLayout={(e) => {
          const view = e.nativeEvent.layout.width;
          setBox((b) => (b.view === view ? b : { ...b, view }));
        }}
        onContentSizeChange={(content) => setBox((b) => (b.content === content ? b : { ...b, content }))}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          setBox((b) => (b.x === x ? b : { ...b, x }));
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: 8 }}>
        {children}
      </ScrollView>
      {moreAtStart && fade('start')}
      {moreAtEnd && fade('end')}
    </View>
  );
}

export function ChatList({
  variant,
  selectedId,
  onOpen,
  onNewChat,
}: {
  variant: 'mobile' | 'desktop';
  selectedId?: string;
  onOpen: (c: Conversation) => void;
  onNewChat: () => void;
}) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  const plusRef = useRef<ComponentRef<typeof View>>(null);
  // The "+" menu opens right under its button (not at the pointer), lining up with the button's
  // outer edge: right edge in English, left edge in Persian where the header is mirrored.
  const openNewMenu = (event: unknown) => {
    const MENU_WIDTH = 190;
    const node = plusRef.current;
    if (!node?.measureInWindow) return setNewMenu(pressPoint(event));
    node.measureInWindow((x, y, w, h) => {
      if (!Number.isFinite(x) || !(w > 0)) return setNewMenu(pressPoint(event));
      setNewMenu({ x: isRTL() ? x : x + w - MENU_WIDTH, y: y + h + 6 });
    });
  };
  const loaded = useChat((s) => s.loaded);
  const all = useChat((s) => s.conversations);
  const list = useFilteredConversations(query, filter);
  const unreadCount = all.filter((c) => c.unreadCount > 0).length;
  const groupCount = all.filter((c) => c.type === 'group').length;
  const channelCount = all.filter((c) => c.type === 'channel').length;
  const desktop = variant === 'desktop';
  // My pins top to bottom (from all chats, not just the filtered ones), for the Move up/down actions.
  const pinOrder = useMemo(() => all.filter((c) => c.pinned).sort((a, b) => compareConversations(a, b)).map((c) => c.id), [all]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, []);

  // Esc closes the compact search field, like the old search box did.
  useEffect(() => {
    if (!searchOpen || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, closeSearch]);

  const newChatItems: ContextMenuItem[] = [
    { icon: 'message-square', label: t('New chat'), onPress: onNewChat },
    { icon: 'users', label: t('New group'), onPress: () => router.push('/new-group') },
    { glyph: (color) => <MegaphoneIcon size={16} color={color} />, label: t('New channel'), onPress: () => router.push({ pathname: '/new-group', params: { kind: 'channel' } }) },
  ];

  // Search and "+": in the phone's top header beside the "Chats" title; on a desktop at the end of the
  // filter row, since the title sits in the window's top bar.
  const actions = (
    <>
      <Tooltip label={searchOpen ? t('Close search') : t('Search')} side="bottom" style={{ alignSelf: 'center' }}>
        <IconButton
          name={searchOpen ? 'x' : 'search'}
          label={searchOpen ? t('Close search') : t('Search')}
          onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          bg={colors.surface}
          size={desktop ? 34 : 38}
          iconSize={desktop ? 16 : 17}
          color={colors.text}
        />
      </Tooltip>
      <Tooltip label={t('New chat')} side="bottom" style={{ alignSelf: 'center' }}>
        <Pressable
          ref={plusRef}
          accessibilityRole="button"
          accessibilityLabel={t('New chat')}
          onPress={openNewMenu}
          style={({ pressed }: any) => ({
            width: desktop ? 34 : 38,
            height: desktop ? 34 : 38,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.amber,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}>
          <Icon name="plus" size={desktop ? 18 : 19} color={colors.onAmber} />
        </Pressable>
      </Tooltip>
    </>
  );

  const chips = (
    <ChipRow desktop={desktop}>
      <Chip label={t('All')} count={all.length} active={filter === 'all'} onPress={() => setFilter('all')} />
      <Chip label={t('Unread')} dot={unreadCount > 0} active={filter === 'unread'} onPress={() => setFilter('unread')} />
      <Chip label={t('Groups')} count={groupCount} active={filter === 'groups'} onPress={() => setFilter('groups')} />
      <Chip label={t('Channels')} count={channelCount} active={filter === 'channels'} onPress={() => setFilter('channels')} />
    </ChipRow>
  );

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      {desktop ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {chips}
          {actions}
        </View>
      ) : (
        chips
      )}

      {/* New version box: takes the place the sidebar search used to occupy. */}
      <UpdateBanner />

      {searchOpen && (
        <SearchBar
          autoFocus
          value={query}
          onChangeText={setQuery}
          onEscape={closeSearch}
          placeholder={desktop ? t('Search chats…') : t('Search chats, messages, people…')}
          style={!desktop && { height: 52 }}
        />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {!desktop && (
        <>
          <MobileHeader title={t('Chats')} actions={actions} />
          <ConnectionBanner />
          {/* Phones: the list owns the screen, so the voice player sits here; inside a chat the thread
              shows it under the header. */}
          <VoiceBar />
        </>
      )}
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingTop: desktop ? 16 : 4, gap: desktop ? 2 : 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <ChatRow
            c={item}
            card={!desktop}
            selected={item.id === selectedId}
            onPress={() => onOpen(item)}
            canMoveUp={item.pinned && pinOrder.indexOf(item.id) > 0}
            canMoveDown={item.pinned && pinOrder.indexOf(item.id) < pinOrder.length - 1}
          />
        )}
        ListEmptyComponent={
          !loaded ? (
            <ActivityIndicator color={colors.amberText} style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 }}>
              <Icon name={query ? 'search' : 'message-circle'} size={32} color={colors.textDim} />
              <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
                {query ? t('No chats match your search.') : filter !== 'all' ? t('Nothing here yet.') : t('No conversations yet. Start one with someone from your flock.')}
              </T>
              {!query && filter === 'all' && <Button title={t('Start a chat')} icon="plus" size="sm" onPress={onNewChat} />}
            </View>
          )
        }
      />
      <ContextMenu point={newMenu} items={newChatItems} onClose={() => setNewMenu(null)} />
      <ChangelogModal />
    </View>
  );
}
