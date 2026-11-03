import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import { clock, dayDivider, lastSeenLabel, sameDay } from '@/lib/format';
import { systemText } from '@/lib/system-message';
import type { Conversation, Message } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore, useChat, useConversation, useMessages, useTyping } from '@/state/chat-store';
import { colors, fonts, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { Button, Icon, IconButton, noOutline, T, type IconName } from './ui';
import { t, num, isRTL } from '@/lib/i18n';

const EMOJIS = ['😀', '😂', '😍', '🥳', '😎', '🤔', '😅', '😢', '👍', '🙏', '👏', '🔥', '❤️', '✨', '🎉', '✅'];

type Row =
  | { type: 'message'; message: Message; first: boolean; last: boolean }
  | { type: 'day'; key: string; label: string }
  | { type: 'system'; message: Message };

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
    const groupedWithPrev = prev && prev.kind !== 'system' && prev.senderId === m.senderId && sameDay(prev.createdAt, m.createdAt) && m.createdAt - prev.createdAt < 5 * 60_000;
    const groupedWithNext = next && next.kind !== 'system' && next.senderId === m.senderId && sameDay(next.createdAt, m.createdAt) && next.createdAt - m.createdAt < 5 * 60_000;
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
  const { user } = useAuth();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Message whose action bar (Reply / Copy) is open: tap-to-act on touch screens.
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Parents key this component by conversationId, so local state resets on switch.
  useEffect(() => {
    chatStore.openConversation(conversationId).catch(() => setLoadError(true));
    return () => chatStore.closeConversation(conversationId);
  }, [conversationId]);

  // Mark read when new messages arrive while open.
  useEffect(() => {
    if (conversation?.unreadCount) chatStore.markRead(conversationId);
  }, [conversation?.unreadCount, conversationId]);

  const rows = useMemo(() => buildRows(messages), [messages]);
  const desktop = variant === 'desktop';

  if (!conversation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThreadHeader conversation={conversation} desktop={desktop} onBack={onBack} detailsOpen={detailsOpen} onToggleDetails={onToggleDetails} />
      <JoinCallBanner conversation={conversation} />
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
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => (r.type === 'day' ? r.key : r.message.id)}
          onEndReached={() => hasMore && chatStore.loadOlder(conversationId)}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingHorizontal: desktop ? 32 : 14, paddingVertical: 16, maxWidth: desktop ? 900 : undefined, width: '100%', alignSelf: 'center' }}
          ListFooterComponent={messages.length === 0 ? <EmptyThread conversation={conversation} /> : undefined}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <DayDivider label={item.label} desktop={desktop} />
            ) : item.type === 'system' ? (
              <SystemNote message={item.message} />
            ) : (
              <Bubble
                row={item}
                conversation={conversation}
                mine={item.message.senderId === user?.id}
                desktop={desktop}
                actionsOpen={actionsFor === item.message.id}
                onToggleActions={() => setActionsFor((id) => (id === item.message.id ? null : item.message.id))}
                onReply={() => {
                  setActionsFor(null);
                  setReplyTo(item.message);
                }}
              />
            )
          }
        />
      )}
      <TypingIndicator conversation={conversation} />
      <Composer conversation={conversation} desktop={desktop} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
    </KeyboardAvoidingView>
  );
}

// ---------- header ----------

function useStatusLine(conversation: Conversation) {
  const { user } = useAuth();
  const typing = useTyping(conversation.id);
  const others = conversation.members.filter((m) => m.id !== user?.id);
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
}: {
  conversation: Conversation;
  desktop: boolean;
  onBack?: () => void;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
}) {
  const { user } = useAuth();
  const { startCall } = useCalls();
  const insets = useSafeAreaInsets();
  const status = useStatusLine(conversation);
  const peer = conversation.members.find((m) => m.id !== user?.id);
  const pill = conversation.type === 'group' ? t('GROUP') : peer?.title?.toUpperCase();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: desktop ? 14 : insets.top + 8,
        paddingBottom: 14,
        paddingHorizontal: desktop ? 24 : 10,
        backgroundColor: desktop ? colors.canvas : 'rgba(18, 23, 33, 0.92)',
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      {onBack && <IconButton name="arrow-left" label={t('Back')} onPress={onBack} iconSize={24} />}
      <Pressable
        onPress={onToggleDetails ?? (() => router.push(`/info/${conversation.id}`))}
        accessibilityLabel={conversation.type === 'group' ? t('Group Info') : t('Contact Info')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <ConversationAvatar conversation={conversation} meId={user?.id} size={desktop ? 48 : 44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T variant="headlineSm" numberOfLines={1} style={{ fontSize: desktop ? 22 : 18, flexShrink: 0, maxWidth: '75%' }}>
              {conversation.name}
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
      <IconButton name="phone" label={t('Voice call')} onPress={() => startCall(conversation, false)} iconSize={20} />
      {desktop ? (
        <Button title={t('Meet')} icon="video" size="sm" onPress={() => startCall(conversation, true)} style={{ height: 44, borderRadius: radius.lg }} />
      ) : (
        <IconButton name="video" label={t('Video call')} onPress={() => startCall(conversation, true)} iconSize={22} />
      )}
      {onToggleDetails && desktop && (
        <IconButton
          name="sidebar"
          label={t('Toggle details')}
          onPress={onToggleDetails}
          bg={detailsOpen ? colors.surfaceHigh : colors.surface}
          rounded="lg"
          size={44}
        />
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
  actionsOpen,
  onToggleActions,
  onReply,
}: {
  row: Extract<Row, { type: 'message' }>;
  conversation: Conversation;
  mine: boolean;
  desktop: boolean;
  actionsOpen: boolean;
  onToggleActions: () => void;
  onReply: () => void;
}) {
  const { message: m, first, last } = row;
  const [hovered, setHovered] = useState(false);
  const sender = conversation.members.find((u) => u.id === m.senderId);
  const showSender = !mine && first && (conversation.type === 'group' || desktop);
  const bubbleBg = mine ? colors.amberSoft : '#202838';
  const fg = mine ? colors.onAmber : colors.text;
  const r = 20;
  // Pending/failed messages don't exist on the server yet, so they can't be replied to.
  const canAct = !m.pending && !m.failed;
  const web = Platform.OS === 'web';

  const copy = async () => {
    await Clipboard.setStringAsync(m.body);
    onToggleActions();
  };

  // Hover reply button: always mounted (only its opacity changes) so a click can't be lost
  // to a hover re-render, and it sits beside the bubble instead of overlapping it.
  const hoverReply = web && desktop && canAct && (
    <Pressable
      onPress={onReply}
      accessibilityLabel={t('Reply')}
      style={({ hovered: h }: any) => ({
        width: 30,
        height: 30,
        borderRadius: 15,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: h ? colors.surfaceHighest : colors.surfaceHigh,
        opacity: hovered ? 1 : 0,
      })}>
      <Icon name="corner-up-left" size={15} color={colors.text} />
    </Pressable>
  );

  return (
    <View
      {...(web ? { onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false) } : {})}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: first ? 14 : 3, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      {!mine && <View style={{ width: 34 }}>{last && <Avatar user={sender} size={34} showPresence={false} />}</View>}
      {mine && hoverReply}
      <View style={{ maxWidth: desktop ? '72%' : '78%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
        {showSender && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline', paddingHorizontal: 4 }}>
            <T variant="labelLg">{sender?.displayName ?? t('Someone')}</T>
            <T variant="bodySm" color={colors.textMuted}>
              {clock(m.createdAt)}
            </T>
          </View>
        )}
        <Pressable
          onPress={m.failed ? () => chatStore.retry(m) : canAct && !desktop ? onToggleActions : undefined}
          onLongPress={canAct ? onReply : undefined}
          delayLongPress={350}
          {...(web && canAct ? { onDoubleClick: onReply } : {})}
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
              borderWidth: 1,
              borderColor: actionsOpen ? colors.amber : 'transparent',
            },
            (hovered || actionsOpen) && web && ({ filter: 'brightness(1.06)' } as object),
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
                <T variant="label" color={mine ? '#8A5A00' : colors.amber}>
                  {m.replyTo.senderName}
                </T>
                <T variant="body" color={mine ? colors.onAmber : colors.textMuted} numberOfLines={2} style={{ fontStyle: 'italic' }}>
                  {m.replyTo.body}
                </T>
              </View>
            </View>
          )}
          <T variant="bodyLg" color={fg} style={{ fontSize: 16, lineHeight: 24 }} selectable={desktop}>
            {m.body}
          </T>
        </Pressable>
        {actionsOpen && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionChip icon="corner-up-left" label={t('Reply')} onPress={onReply} />
            <ActionChip icon="copy" label={t('Copy')} onPress={copy} />
          </View>
        )}
        {last && (mine || !desktop) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
            <T variant="bodySm" color={m.failed ? colors.danger : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
              {m.failed ? t('Not sent · tap to retry') : clock(m.createdAt)}
            </T>
            {mine && <Receipt message={m} conversation={conversation} />}
          </View>
        )}
      </View>
      {!mine && hoverReply}
    </View>
  );
}

function ActionChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.surfaceHighest : colors.surfaceHigh,
      })}>
      <Icon name={icon} size={14} color={colors.amber} />
      <T variant="label">{label}</T>
    </Pressable>
  );
}

function EmptyThread({ conversation }: { conversation: Conversation }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 48 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="message-circle" size={28} color={colors.amber} />
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
}: {
  conversation: Conversation;
  desktop: boolean;
  replyTo: Message | null;
  onClearReply: () => void;
}) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const insets = useSafeAreaInsets();
  const canSend = text.trim().length > 0;

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    setEmojiOpen(false);
    chatStore.notifyTyping(conversation.id, false);
    chatStore.send(conversation.id, body, replyTo);
    onClearReply();
    inputRef.current?.focus();
  };

  const onChange = (t: string) => {
    setText(t);
    chatStore.notifyTyping(conversation.id, t.length > 0);
  };

  const firstName = conversation.type === 'direct' ? conversation.name.split(' ')[0] : conversation.name;

  return (
    <View
      style={{
        paddingHorizontal: desktop ? 24 : 12,
        paddingTop: 10,
        paddingBottom: desktop ? 18 : Math.max(insets.bottom, 12),
        backgroundColor: desktop ? colors.canvas : 'rgba(11,14,20,0.96)',
        borderTopWidth: desktop ? 1 : 0,
        borderTopColor: colors.surfaceHigh,
        gap: 10,
      }}>
      {replyTo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10, paddingLeft: 14 }}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.amber }} />
          <View style={{ flex: 1 }}>
            <T variant="label" color={colors.amber}>
              {t('Replying to {name}', { name: chatStore.memberName(conversation.id, replyTo.senderId) })}
            </T>
            <T variant="body" color={colors.textMuted} numberOfLines={1}>
              {replyTo.body}
            </T>
          </View>
          <IconButton name="x" label={t('Cancel reply')} onPress={onClearReply} size={32} iconSize={16} />
        </View>
      )}
      {emojiOpen && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 8 }}>
          {EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => onChange(text + e)}
              style={({ hovered, pressed }: any) => ({
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                backgroundColor: hovered || pressed ? colors.surfaceHigh : 'transparent',
              })}>
              <T style={{ fontSize: 22 }}>{e}</T>
            </Pressable>
          ))}
        </View>
      )}
      {desktop && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 6 }}>
          <T variant="bodySm" color={colors.textDim}>
            {t('Press Return ↵ to send · Shift + Return for a new line')}
          </T>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        {!desktop && (
          <IconButton
            name={emojiOpen ? 'x' : 'plus'}
            label={t('More')}
            onPress={() => setEmojiOpen((v) => !v)}
            size={52}
            iconSize={24}
            bg={colors.surface}
          />
        )}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-end',
            backgroundColor: colors.surface,
            borderRadius: desktop ? radius.lg : 26,
            borderWidth: 1.5,
            borderColor: colors.surfaceHigh,
            paddingLeft: desktop ? 8 : 20,
            paddingRight: 8,
            minHeight: 52,
          }}>
          {desktop && (
            <IconButton name="smile" label={t('Emoji')} onPress={() => setEmojiOpen((v) => !v)} color={emojiOpen ? colors.amber : colors.textMuted} />
          )}
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={onChange}
            placeholder={desktop ? t('Type a message to {name}…', { name: firstName }) : t('Message {name}…', { name: firstName })}
            placeholderTextColor={colors.textMuted}
            multiline
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
              },
              noOutline,
            ]}
          />
          {!desktop && (
            <IconButton name="smile" label={t('Emoji')} onPress={() => setEmojiOpen((v) => !v)} color={emojiOpen ? colors.amber : colors.textMuted} iconSize={22} style={{ marginBottom: 6 }} />
          )}
          {desktop && (
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityLabel={t('Send')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                marginBottom: 4,
                backgroundColor: canSend ? colors.amber : colors.surfaceHigh,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="send" size={18} color={canSend ? colors.canvas : colors.textMuted} />
            </Pressable>
          )}
        </View>
        {!desktop && (
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityLabel={t('Send')}
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
            <Icon name="send" size={22} color={colors.canvas} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
