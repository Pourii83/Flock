import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, View } from 'react-native';

import { ContextMenu, type ContextMenuItem } from '@/components/context-menu';
import { ChangelogModal, UpdateBanner } from '@/components/update-banner';
import { shortTime } from '@/lib/format';
import { systemText } from '@/lib/system-message';
import type { Conversation } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, fonts, radius } from '@/theme';
import { ConversationAvatar, isSavedConversation } from './avatar';
import { Button, Chip, Icon, IconButton, PushPin, SearchBar, T, Tooltip, UnreadBadge } from './ui';
import { t, num } from '@/lib/i18n';

type Filter = 'all' | 'unread' | 'groups';

/** Window coordinates of a press. react-native-web exposes clientX/clientY or pageX/pageY. */
function pressPoint(event: any): { x: number; y: number } {
  const native = event?.nativeEvent ?? event ?? {};
  const web = typeof window !== 'undefined' ? (window as any).event : undefined;
  const x = native.pageX ?? native.clientX ?? event?.pageX ?? event?.clientX ?? web?.clientX;
  const y = native.pageY ?? native.clientY ?? event?.pageY ?? event?.clientY ?? web?.clientY;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : { x: 24, y: 120 };
}

function useFilteredConversations(query: string, filter: Filter) {
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unreadCount === 0) return false;
      if (filter === 'groups' && c.type !== 'group') return false;
      if (!q) return true;
      return (
        (isSavedConversation(c) ? t('Saved Messages') : c.name).toLowerCase().includes(q) ||
        c.members.some((m) => m.username.toLowerCase().includes(q)) ||
        (c.lastMessage?.kind === 'file' ? c.lastMessage.attachment?.name : c.lastMessage?.kind === 'text' ? c.lastMessage.body : '')?.toLowerCase().includes(q)
      );
    });
  }, [conversations, query, filter]);
}

function Preview({ c, meId, typing }: { c: Conversation; meId?: string; typing: boolean }) {
  if (typing)
    return (
      <T variant="body" color={colors.amberText} numberOfLines={1} style={{ flex: 1 }}>
        {t('typing…')}
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
  const preview = m.kind === 'file' ? t('File: {name}', { name: m.attachment?.name ?? t('File') }) : m.kind === 'call_invite' ? t('Group call invitation') : m.body;
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

export function ChatRow({
  c,
  selected,
  onPress,
  card,
}: {
  c: Conversation;
  selected?: boolean;
  onPress: () => void;
  /** Mobile renders each row as a rounded card (Stitch mobile list). */
  card?: boolean;
}) {
  const { user } = useAuth();
  const typing = useChat((s) => (s.typing[c.id]?.length ?? 0) > 0);
  const unread = c.unreadCount > 0;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const name = isSavedConversation(c) ? t('Saved Messages') : c.name;

  // Right-click on desktop, long-press on phones: pin, mute and mark-read actions.
  const openMenu = (event: any) => {
    event?.preventDefault?.();
    setMenu(pressPoint(event));
  };
  const items: ContextMenuItem[] = [
    { pin: true, label: c.pinned ? t('Unpin') : t('Pin'), onPress: () => void chatStore.setPinned(c.id, !c.pinned) },
    { icon: c.muted ? 'bell' : 'bell-off', label: c.muted ? t('Unmute') : t('Mute'), onPress: () => void chatStore.setMuted(c.id, !c.muted) },
    { icon: 'check-circle', label: t('Mark as read'), disabled: !unread, onPress: () => chatStore.markRead(c.id) },
  ];

  return (
    <>
      <Pressable
        onPress={onPress}
        onLongPress={openMenu}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={name}
        {...(Platform.OS === 'web' ? { onContextMenu: openMenu } : {})}
        style={({ hovered, pressed }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 14,
          paddingVertical: card ? 16 : 12,
          minHeight: 68,
          borderRadius: radius.lg,
          backgroundColor: selected || pressed ? colors.surface : hovered ? colors.hover : card ? (unread ? colors.surface : colors.hover) : 'transparent',
          borderWidth: card ? 1 : 0,
          borderColor: colors.surfaceHigh,
        })}>
        {selected && (
          <View style={{ position: 'absolute', start: 0, top: 14, bottom: 14, width: 3, borderRadius: 2, backgroundColor: colors.amber }} />
        )}
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
            <Preview c={c} meId={user?.id} typing={typing} />
            <UnreadBadge count={c.unreadCount} style={c.muted ? { backgroundColor: colors.surfaceHighest } : undefined} />
          </View>
        </View>
      </Pressable>
      <ContextMenu point={menu} items={items} title={name} onClose={() => setMenu(null)} />
    </>
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
  const loaded = useChat((s) => s.loaded);
  const all = useChat((s) => s.conversations);
  const list = useFilteredConversations(query, filter);
  const unreadCount = all.filter((c) => c.unreadCount > 0).length;
  const groupCount = all.filter((c) => c.type === 'group').length;
  const desktop = variant === 'desktop';

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
  ];

  const header = (
    <View style={{ gap: 14, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T variant="headline" style={{ fontSize: desktop ? 26 : 30, lineHeight: desktop ? undefined : 38 }}>
          {t('Chats')}
        </T>
        {!desktop && unreadCount > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <T variant="labelLg" color={colors.textMuted}>
              {t('{n} unread', { n: num(unreadCount) })}
            </T>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Tooltip label={searchOpen ? t('Close search') : t('Search')} side="bottom" style={{ alignSelf: 'center' }}>
          <IconButton
            name={searchOpen ? 'x' : 'search'}
            label={searchOpen ? t('Close search') : t('Search')}
            onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            bg={colors.surface}
            size={38}
            iconSize={17}
            color={colors.text}
          />
        </Tooltip>
        <Tooltip label={t('New chat')} side="bottom" style={{ alignSelf: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('New chat')}
            onPress={(event) => setNewMenu(pressPoint(event))}
            style={({ pressed }: any) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.amber,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}>
            <Icon name="plus" size={19} color={colors.onAmber} />
          </Pressable>
        </Tooltip>
      </View>

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

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label={t('All')} count={all.length} active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={t('Unread')} dot={unreadCount > 0} active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label={t('Groups')} count={groupCount} active={filter === 'groups'} onPress={() => setFilter('groups')} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: desktop ? 16 : 16, paddingTop: desktop ? 20 : 8, gap: desktop ? 2 : 8, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <ChatRow c={item} card={!desktop} selected={item.id === selectedId} onPress={() => onOpen(item)} />
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
