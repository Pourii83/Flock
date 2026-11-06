import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { shortTime } from '@/lib/format';
import { systemText } from '@/lib/system-message';
import type { Conversation } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { ConversationAvatar } from './avatar';
import { Button, Chip, Icon, SearchBar, T, UnreadBadge, IconButton } from './ui';
import { t } from '@/lib/i18n';

type Filter = 'all' | 'unread' | 'groups';

function useFilteredConversations(query: string, filter: Filter) {
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unreadCount === 0) return false;
      if (filter === 'groups' && c.type !== 'group') return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
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
  return (
    <Pressable
      onPress={onPress}
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
          <T variant="labelLg" numberOfLines={1} style={{ flexShrink: 1, fontSize: card ? 17 : 15, fontFamily: unread ? 'Inter_700Bold' : 'Inter_500Medium' }}>
            {c.name}
          </T>
          {c.pinned && <Icon name="bookmark" size={12} color={colors.textMuted} />}
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
  const [filter, setFilter] = useState<Filter>('all');
  const loaded = useChat((s) => s.loaded);
  const all = useChat((s) => s.conversations);
  const list = useFilteredConversations(query, filter);
  const unreadCount = all.filter((c) => c.unreadCount > 0).length;
  const groupCount = all.filter((c) => c.type === 'group').length;
  const desktop = variant === 'desktop';

  const header = (
    <View style={{ gap: 16, paddingBottom: 12 }}>
      {desktop && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T variant="headline" style={{ fontSize: 26 }}>
            {t('Chats')}
          </T>
          <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 }}>
            <T variant="label" color={colors.textMuted}>
              {all.length}
            </T>
          </View>
          <View style={{ flex: 1 }} />
          <IconButton name="users" label={t('New group')} onPress={() => router.push('/new-group')} bg={colors.surface} size={36} iconSize={17} color={colors.amberText} />
          <Button title={t('New Chat')} icon="plus" size="sm" onPress={onNewChat} />
        </View>
      )}
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={desktop ? t('Search chats…') : t('Search chats, messages, people…')}
        style={!desktop && { height: 52 }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label={t('All')} count={all.length} active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={t('Unread')} dot={unreadCount > 0} active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label={t('Groups')} count={groupCount} active={filter === 'groups'} onPress={() => setFilter('groups')} />
      </View>
    </View>
  );

  return (
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
  );
}
