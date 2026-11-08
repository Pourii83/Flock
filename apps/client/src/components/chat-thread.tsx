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

import { clock, dayDivider, lastSeenLabel, sameDay } from '@/lib/format';
import { attachmentSource, openAttachment } from '@/lib/attachments';
import { api } from '@/lib/api';
import { callLine, parseCallLog } from '@/lib/call-log';
import { ensureDevice, safetyCode, useDevice, useSecretStatus } from '@/lib/e2e';
import { systemText } from '@/lib/system-message';
import type { Conversation, Message } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore, useChat, useConversation, useMessages, useTyping } from '@/state/chat-store';
import { colors, fonts, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { LinkedText } from './linked-text';
import { Button, Icon, IconButton, noOutline, persianFont, T, type IconName } from './ui';
import { t, num, isRTL } from '@/lib/i18n';

/** One-tap reactions on a message. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const EMOJIS = ['😀', '😂', '😍', '🥳', '😎', '🤔', '😅', '😢', '👍', '🙏', '👏', '🔥', '❤️', '✨', '🎉', '✅'];

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
  // Android edge-to-edge windows can report the IME without resizing the React tree,
  // so adjust this screen's height explicitly to keep the composer above the keyboard.
  const keyboardBehavior = Platform.select({ ios: 'padding' as const, android: 'height' as const });

  if (!conversation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.amberText} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={keyboardBehavior}>
      <ThreadHeader conversation={conversation} desktop={desktop} onBack={onBack} detailsOpen={detailsOpen} onToggleDetails={onToggleDetails} />
      <JoinCallBanner conversation={conversation} />
      {!!conversation.secret && <SecretBanner conversation={conversation} />}
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
            ) : item.type === 'call' ? (
              <CallNote message={item.message} meId={user?.id} />
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
  const pill = conversation.isSaved ? undefined : conversation.type === 'group' ? t('GROUP') : peer?.title?.toUpperCase();
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
        accessibilityLabel={conversation.type === 'group' ? t('Group Info') : t('Contact Info')}
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
      {/* One call button: it starts a voice call; the camera is switched on from inside the call. */}
      {!conversation.isSaved && <IconButton name="phone" label={t('Call')} onPress={() => startCall(conversation, false)} iconSize={20} />}
      {onToggleDetails && desktop && !conversation.isSaved && (
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
  const bubbleBg = mine ? colors.amberSoft : colors.bubble;
  const fg = mine ? colors.onAmber : colors.text;
  const r = 20;
  // Pending/failed messages don't exist on the server yet, so they can't be replied to.
  const canAct = !m.pending && !m.failed;
  const web = Platform.OS === 'web';

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const { user } = useAuth();
  const meId = user?.id;
  // Secret chats stay on their two devices; Saved Messages is server-readable, so they can't be saved into it.
  const canSave = canAct && !conversation.secret && !conversation.isSaved && (m.kind === 'text' || m.kind === 'file');
  const showPicker = canAct && (pickerOpen || actionsOpen);

  const copy = async () => {
    await Clipboard.setStringAsync(m.body);
    onToggleActions();
  };

  const react = (emoji: string) => {
    setPickerOpen(false);
    if (actionsOpen) onToggleActions();
    void chatStore.react(m, emoji);
  };

  const save = async () => {
    if (saveState === 'busy') return;
    setSaveState('busy');
    try {
      await chatStore.saveMessage(m);
      setSaveState('done');
    } catch {
      setSaveState('error');
    }
    setTimeout(() => setSaveState('idle'), 2000);
  };

  // Hover buttons (react / reply / save): always mounted (only their opacity changes) so a click can't be
  // lost to a hover re-render, and they sit beside the bubble instead of overlapping it.
  const hoverButton = (icon: IconName, label: string, onPress: () => void, active = false) => (
    <Pressable
      key={icon}
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered: h }: any) => ({
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: h || active ? colors.surfaceHighest : colors.surfaceHigh,
        opacity: hovered || pickerOpen ? 1 : 0,
      })}>
      <Icon name={icon} size={15} color={active || (icon === 'bookmark' && saveState === 'done') ? colors.amberText : colors.text} />
    </Pressable>
  );
  const hoverReply = web && desktop && canAct && (
    <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 4 }}>
      {hoverButton('smile', t('React'), () => setPickerOpen((v) => !v), pickerOpen)}
      {hoverButton('corner-up-left', t('Reply'), onReply)}
      {canSave && hoverButton('bookmark', saveState === 'done' ? t('Saved') : t('Save'), () => void save())}
    </View>
  );
  const reactions = (m.reactions ?? []).filter((r) => r.userIds.length > 0);

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
          onLongPress={canAct && !desktop && !actionsOpen ? onToggleActions : undefined}
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
        {showPicker && (
          <View style={{ flexDirection: 'row', gap: 2, backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 4 }}>
            {QUICK_REACTIONS.map((e) => (
              <Pressable
                key={e}
                onPress={() => react(e)}
                accessibilityLabel={e}
                style={({ hovered: h, pressed }: any) => ({
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: h || pressed ? colors.surfaceHighest : 'transparent',
                })}>
                <T style={{ fontSize: 22, lineHeight: 28 }}>{e}</T>
              </Pressable>
            ))}
          </View>
        )}
        {actionsOpen && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ActionChip icon="corner-up-left" label={t('Reply')} onPress={onReply} />
            {m.kind === 'text' && <ActionChip icon="copy" label={t('Copy')} onPress={copy} />}
            {canSave && <ActionChip icon="bookmark" label={saveState === 'done' ? t('Saved') : saveState === 'error' ? t('Could not save') : t('Save')} onPress={() => void save()} />}
          </View>
        )}
        {last && (mine || !desktop) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
            <T variant="bodySm" color={m.failed ? colors.danger : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
              {m.failed ? t('Not sent · tap to retry') : clock(m.createdAt)}
            </T>
            {mine && !conversation.isSaved && <Receipt message={m} conversation={conversation} />}
          </View>
        )}
      </View>
      {!mine && hoverReply}
    </View>
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
  if (!attachment) return <T color={mine ? colors.onAmber : colors.textMuted}>{t('File unavailable')}</T>;
  const expired = attachment.expired || !attachment.url;
  const image = attachment.mimeType.startsWith('image/');
  const open = async () => {
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
  return (
    <Pressable onPress={() => void open()} disabled={expired || opening} style={{ minWidth: 210, maxWidth: 320, gap: 10 }}>
      {image && !expired && attachment.url && (
        <Image source={attachmentSource(attachment.url)} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.surface }} contentFit="cover" />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.10)' : colors.surface }}>
          {opening ? <ActivityIndicator color={mine ? colors.onAmber : colors.amberText} /> : <Icon name={expired ? 'clock' : image ? 'image' : 'file'} size={20} color={mine ? colors.onAmber : colors.amberText} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="labelLg" color={mine ? colors.onAmber : colors.text} numberOfLines={2}>{attachment.name}</T>
          <T variant="bodySm" color={mine ? '#72521B' : colors.textMuted}>
            {expired ? t('File expired') : `${bytesLabel(attachment.size)} · ${t('Original quality')}`}
          </T>
        </View>
        {!expired && <Icon name="download" size={18} color={mine ? colors.onAmber : colors.amberText} />}
      </View>
      {!!error && <T variant="bodySm" color={colors.danger}>{error}</T>}
    </Pressable>
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
      <Icon name={icon} size={14} color={colors.amberText} />
      <T variant="label">{label}</T>
    </Pressable>
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
}: {
  conversation: Conversation;
  desktop: boolean;
  replyTo: Message | null;
  onClearReply: () => void;
}) {
  const { user } = useAuth();
  const secret = useSecretStatus(conversation, user?.id);
  const blocked = !!conversation.secret && secret?.state !== 'ready';
  const filesAllowed = !conversation.secret;
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<TextInputInstance>(null);
  const [inputHeight, setInputHeight] = useState(50);
  const insets = useSafeAreaInsets();
  const canSend = text.trim().length > 0;

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

  const pickFile = async () => {
    setUploadError('');
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false, base64: false });
    if (picked.canceled) return;
    await uploadAsset(picked.assets[0]);
  };

  // Ctrl+V with an image on the clipboard sends it, like Telegram/Discord. Web only: native
  // TextInput has no paste event. Clipboards holding text too (Word, Excel) paste as text.
  const uploadRef = useRef(uploadAsset);
  uploadRef.current = uploadAsset;
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
      void uploadRef.current({
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

  async function uploadAsset(asset: DocumentPicker.DocumentPickerAsset) {
    setUploadError('');
    const maxMb = await uploadLimitMb();
    if ((asset.size ?? 0) > maxMb * 1024 * 1024) {
      setUploadError(t('Files can be up to {n} MB', { n: num(maxMb) }));
      return;
    }
    setUploading(true);
    try {
      await chatStore.sendFile(conversation.id, asset, replyTo);
      onClearReply();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('Could not upload file'));
    } finally {
      setUploading(false);
    }
  }

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
      {replyTo && (
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
              accessibilityLabel={t('Send')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
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
