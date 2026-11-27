// Right-click / long-press menu for a message: Reply, Edit, Forward, Copy, Saved Messages,
// Delete, Pin, plus the quick-reaction row. Uses the shared ContextMenu and EmojiPickerModal.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';

import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { dayAndTime } from '@/lib/format';
import type { Conversation, Message } from '@/lib/types';
import { t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, fonts, nestedRadius, radius } from '@/theme';
import { pinNoteRef } from '@/lib/system-message';
import { Avatar, ConversationAvatar } from './avatar';
import { ContextMenu, type ContextMenuItem } from './context-menu';
import { EmojiPickerModal } from './emoji-picker';
import { Button, Icon, IconButton, T, noOutline, persianFont } from './ui';

/** Group/channel owners can delete other people's texts and files (the server checks the same). */
export function canOwnerRemove(conversation: Conversation, message: Message) {
  return conversation.type !== 'direct' && conversation.myRole === 'owner' && (message.kind === 'text' || message.kind === 'file' || (message.kind === 'system' && pinNoteRef(message.body) !== null));
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😢', '🙏', '👎'] as const;

export function MessageMenu({
  message,
  conversation,
  mine,
  pinned,
  point,
  onReply,
  onQuote,
  onEdit,
  onSelect,
  onError,
  onClose,
}: {
  /** Replies quoting only part of this message's text (Telegram-style). */
  onQuote?: (quote: string) => void;
  /** Starts multi-select with this message. */
  onSelect?: () => void;
  message: Message;
  conversation: Conversation;
  mine: boolean;
  pinned: boolean;
  point: { x: number; y: number };
  onReply: () => void;
  onEdit: () => void;
  /** Surfaces async failures (copy/save/delete/pin) in the thread. */
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(point);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Web: text already selected inside this message when the menu opened can be quoted straight away.
  const [selection] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    const picked = window.getSelection?.()?.toString().trim() ?? '';
    return picked && picked !== message.body.trim() && message.body.includes(picked) ? picked : '';
  });

  // The whole menu dismisses only once every layer (menu, forward, picker, info, quote) is closed.
  const done = !menuPoint && !forwardOpen && !pickerOpen && !infoOpen && !quoteOpen;
  useEffect(() => {
    if (done) onClose();
  }, [done, onClose]);

  const canAct = !message.pending && !message.failed;
  const isText = message.kind === 'text';
  // The owner of a group or channel can also remove other people's messages and files (with a warning).
  const ownerRemoves = !mine && canOwnerRemove(conversation, message);
  const canDelete = canAct && (mine || ownerRemoves);
  // The server only pins text and file messages.
  const canPin = canAct && (isText || message.kind === 'file');
  // Secret chats are decrypted per device, so they can't be copied into Saved Messages or forwarded.
  const canSave = canAct && !conversation.secret && !conversation.isSaved && (isText || message.kind === 'file');
  const canForward = canAct && !conversation.secret && (isText || message.kind === 'file');

  const fail = (error: unknown) => onError(error instanceof Error ? error.message : t('Something went wrong'));

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(message.body);
    } catch (error) {
      fail(error);
    }
  };

  const save = async () => {
    try {
      await chatStore.saveMessage(message);
    } catch (error) {
      fail(error);
    }
  };

  const remove = async () => {
    const sender = conversation.members.find((m) => m.id === message.senderId)?.displayName ?? t('this member');
    const ok = ownerRemoves
      ? await confirm(
          t('Delete someone else’s message'),
          t('This message was sent by {name}. As the owner you can delete it for everyone, including {name}. This can’t be undone.', { name: sender }),
          t('Delete'),
          t('Cancel'),
        )
      : await confirm(t('Delete message'), t('Delete this message for everyone?'), t('Delete'), t('Cancel'));
    if (!ok) return;
    try {
      await chatStore.deleteMessage(message);
    } catch (error) {
      fail(error);
    }
  };

  const togglePin = async () => {
    try {
      await chatStore.setPinnedMessage(message, !pinned);
    } catch (error) {
      fail(error);
    }
  };

  const react = (emoji: string) => {
    void chatStore.react(message, emoji);
  };

  // Only offer what actually applies to this message: disabled rows are noise (user request).
  // A message that never reached the server gets the two things that make sense for it: take its
  // text, or drop it.
  const menuItems: ContextMenuItem[] = message.failed
    ? [
        { icon: 'copy', label: t('Copy text'), onPress: () => void copy() },
        { icon: 'x', label: t('Cancel sending'), danger: true, onPress: () => chatStore.discard(message) },
      ]
    : [{ icon: 'corner-up-left', label: t('Reply'), onPress: onReply }];
  // Quote part of a text (not in secret chats, where the server can't check a quote against ciphertext).
  if (canAct && isText && !conversation.secret && onQuote && message.body.trim().length > 1)
    menuItems.push(
      selection
        ? { icon: 'chevrons-right', label: t('Quote selection'), onPress: () => onQuote(selection) }
        : { icon: 'chevrons-right', label: t('Quote part…'), onPress: () => setQuoteOpen(true) },
    );
  // Text, or the caption of my own photo/file.
  // The server can't read (or re-encrypt) a secret file's caption, so those aren't editable.
  if (canAct && mine && (isText || (message.kind === 'file' && !conversation.secret))) menuItems.push({ icon: 'edit-2', label: t('Edit'), onPress: onEdit });
  if (canForward) menuItems.push({ icon: 'corner-up-right', label: t('Forward'), onPress: () => setForwardOpen(true) });
  if (canAct && isText) menuItems.push({ icon: 'copy', label: t('Copy'), onPress: () => void copy() });
  if (canSave) menuItems.push({ icon: 'bookmark', label: t('Saved Messages'), onPress: () => void save() });
  if (canDelete) menuItems.push({ icon: 'trash-2', label: t('Delete'), danger: true, onPress: () => void remove() });
  if (canPin) menuItems.push({ pin: true, label: pinned ? t('Unpin') : t('Pin'), onPress: () => void togglePin() });
  if (canAct && onSelect) menuItems.push({ icon: 'check-square', label: t('Select'), onPress: onSelect });
  // Who saw it and who reacted, with times (my own messages, or any message that has reactions).
  if (canAct && !conversation.isSaved && (mine || (message.reactions ?? []).some((r) => r.userIds.length)))
    menuItems.push({ icon: 'info', label: t('Seen and reactions'), onPress: () => setInfoOpen(true) });

  return (
    <>
      <ContextMenu
        point={menuPoint}
        onClose={() => setMenuPoint(null)}
        items={menuItems}
        emoji={message.failed ? undefined : QUICK_REACTIONS}
        onEmoji={react}
        onEmojiMore={() => {
          setMenuPoint(null);
          setPickerOpen(true);
        }}
      />
      {forwardOpen && (
        <ForwardDialog
          messages={[message]}
          currentConversationId={conversation.id}
          onClose={() => setForwardOpen(false)}
          onError={fail}
        />
      )}
      {infoOpen && <MessageInfoDialog message={message} conversation={conversation} onClose={() => setInfoOpen(false)} />}
      {quoteOpen && onQuote && (
        <QuoteDialog
          text={message.body}
          onQuote={(quote) => {
            setQuoteOpen(false);
            onQuote(quote);
          }}
          onClose={() => setQuoteOpen(false)}
        />
      )}
      {pickerOpen && (
        <EmojiPickerModal
          onPick={(emoji) => {
            react(emoji);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

/** Who has seen a message and who reacted to it, each with the time it happened. */
function MessageInfoDialog({ message, conversation, onClose }: { message: Message; conversation: Conversation; onClose: () => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.messageInfo>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api.messageInfo(message.id).then(
      (data) => alive && setInfo(data),
      (e) => alive && setError(e instanceof Error ? e.message : t('Something went wrong')),
    );
    return () => {
      alive = false;
    };
  }, [message.id]);
  const member = (id: string) => conversation.members.find((m) => m.id === id);
  const row = (key: string, userId: string, right: string, emoji?: string) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 8 }}>
      <Avatar user={member(userId)} size={34} showPresence={false} />
      <T variant="labelLg" numberOfLines={1} style={{ flex: 1 }}>
        {userId === chatStore.me?.id ? t('You') : (member(userId)?.displayName ?? t('Someone'))}
      </T>
      {!!emoji && <T style={{ fontSize: 18 }}>{emoji}</T>}
      <T variant="bodySm" color={colors.textMuted}>
        {right}
      </T>
    </View>
  );
  const section = (label: string) => (
    <T variant="label" color={colors.amberText} style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 }}>
      {label}
    </T>
  );
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={t('Close')} style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 420, maxHeight: '76%', backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.surfaceHigh, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <Icon name="info" size={18} color={colors.amberText} />
            <View style={{ flex: 1 }}>
              <T variant="labelLg" style={{ fontSize: 15 }}>
                {t('Seen and reactions')}
              </T>
              <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                {t('Sent {time}', { time: dayAndTime(message.createdAt) })}
              </T>
            </View>
            <IconButton name="x" label={t('Close')} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            {!info && !error && <ActivityIndicator color={colors.amberText} style={{ margin: 24 }} />}
            {!!error && (
              <T variant="bodySm" color={colors.danger} style={{ padding: 18 }}>
                {error}
              </T>
            )}
            {info && message.senderId === chatStore.me?.id && (
              <>
                {section(t('Seen by'))}
                {info.seen.length === 0 && (
                  <T variant="bodySm" color={colors.textMuted} style={{ paddingHorizontal: 18, paddingVertical: 6 }}>
                    {t('Nobody has seen it yet')}
                  </T>
                )}
                {info.seen.map((s) => row(`s-${s.userId}`, s.userId, s.at ? dayAndTime(s.at) : t('Seen')))}
              </>
            )}
            {info && info.reactions.length > 0 && (
              <>
                {section(t('Reactions'))}
                {info.reactions.map((r) => row(`r-${r.userId}-${r.emoji}`, r.userId, dayAndTime(r.at), r.emoji))}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Pick the part of a message to quote: the text is shown in a read-only box where it can be selected
 * (mouse or the phone's selection handles); "Quote" replies with just that part.
 */
function QuoteDialog({ text, onQuote, onClose }: { text: string; onQuote: (quote: string) => void; onClose: () => void }) {
  const [range, setRange] = useState({ start: 0, end: 0 });
  const picked = text.slice(Math.min(range.start, range.end), Math.max(range.start, range.end)).trim();
  // The box is as tall as the text (user request): a line or two stays small, a long message grows up
  // to half the screen and scrolls from there.
  const inputRef = useRef<TextInputInstance>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const boxHeight = contentHeight ? Math.min(Math.max(contentHeight, 48), Math.round(windowHeight * 0.5)) : undefined;
  // Web: a textarea doesn't report its content size, so measure it unconstrained (once laid out at its
  // real width; ResizeObserver-based onLayout only fires again if that width changes).
  const measureWeb = () => {
    if (Platform.OS !== 'web') return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) return;
    const previous = node.style.height;
    node.style.height = 'auto';
    // scrollHeight has the padding but not the 1px border on each side.
    const next = node.scrollHeight + 2;
    node.style.height = previous;
    setContentHeight((current) => (current === next ? current : next));
  };
  // The first layout can come before the dialog has its final width (it fades in), and a box that is
  // already the measured size never reports again: measure once more after the first frame and the fade.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const frame = requestAnimationFrame(measureWeb);
    const later = setTimeout(measureWeb, 320);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(later);
    };
  }, [text, windowWidth]);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={t('Close')} style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 480, maxHeight: '80%', backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.surfaceHigh, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <Icon name="chevrons-right" size={18} color={colors.amberText} />
            <View style={{ flex: 1 }}>
              <T variant="labelLg" style={{ fontSize: 15 }}>
                {t('Quote part of the message')}
              </T>
              <T variant="bodySm" color={colors.textMuted}>
                {t('Select the words to quote')}
              </T>
            </View>
            <IconButton name="x" label={t('Close')} onPress={onClose} />
          </View>
          <View style={{ padding: 16, gap: 14, flexShrink: 1 }}>
            <TextInput
              ref={inputRef}
              value={text}
              multiline
              autoFocus
              onLayout={measureWeb}
              // Web: a textarea is two rows tall by default, which a one-line message would keep.
              {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
              onContentSizeChange={(event) => {
                if (Platform.OS === 'web') return;
                const next = Math.ceil(event.nativeEvent.contentSize.height);
                setContentHeight((current) => (current === next ? current : next));
              }}
              // Read-only on the web (still selectable); phones keep it "editable" so the selection
              // handles work, but there's no keyboard and changes are ignored.
              editable={Platform.OS !== 'web'}
              showSoftInputOnFocus={false}
              contextMenuHidden
              onChangeText={() => {}}
              onSelectionChange={(event) => setRange(event.nativeEvent.selection)}
              style={[
                {
                  height: boxHeight,
                  color: colors.text,
                  fontFamily: fonts.regular,
                  fontSize: 16,
                  lineHeight: 24,
                  padding: 12,
                  borderRadius: nestedRadius(radius.xl, 16),
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.surfaceHigh,
                  textAlignVertical: 'top',
                },
                noOutline,
                persianFont(text, { fontFamily: fonts.regular }),
              ]}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Button title={t('Cancel')} variant="ghost" size="sm" onPress={onClose} />
              <Button title={t('Quote')} icon="corner-up-left" size="sm" disabled={!picked} onPress={() => onQuote(picked)} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Small app-styled dialog that picks the target conversation for a forward. */
export function ForwardDialog({
  messages,
  currentConversationId,
  onClose,
  onError,
}: {
  messages: Message[];
  currentConversationId: string;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const conversations = useChat((state) => state.conversations);
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const targets = conversations.filter((c) => !c.secret && c.id !== currentConversationId);

  const forwardTo = async (conversationId: string) => {
    if (busyId) return;
    setBusyId(conversationId);
    setError('');
    try {
      for (const message of messages) await chatStore.forwardMessage(message, conversationId);
      onClose();
    } catch (e) {
      const text = e instanceof Error ? e.message : t('Could not forward the message');
      setError(text);
      onError(text);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel={t('Close')}
        style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: '76%',
            backgroundColor: colors.panel,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            overflow: 'hidden',
          }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.hairline,
            }}>
            <Icon name="corner-up-right" size={18} color={colors.amberText} />
            <View style={{ flex: 1 }}>
              <T variant="labelLg" style={{ fontSize: 15 }}>
                {t('Forward to')}
              </T>
              <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                {messages.length > 1 ? t('{n} messages', { n: messages.length }) : (messages[0]?.attachment?.name ?? messages[0]?.body)}
              </T>
            </View>
            <IconButton name="x" label={t('Close')} onPress={onClose} />
          </View>
          {!!error && (
            <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
              <T variant="bodySm" color={colors.danger}>
                {error}
              </T>
            </View>
          )}
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {targets.length === 0 && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
                  {t('No conversations to forward to.')}
                </T>
              </View>
            )}
            {targets.map((target) => (
              <ForwardRow
                key={target.id}
                conversation={target}
                meId={user?.id}
                busy={busyId === target.id}
                disabled={!!busyId}
                onPress={() => void forwardTo(target.id)}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ForwardRow({
  conversation,
  meId,
  busy,
  disabled,
  onPress,
}: {
  conversation: Conversation;
  meId: string | undefined;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('Forward to {name}', { name: conversation.name })}
      style={({ hovered, pressed }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: nestedRadius(radius.xl, 8 + 1), // 8px in from the sheet (and its 1px border), so the end rows follow its corners
        backgroundColor: pressed ? colors.surfaceHighest : hovered ? colors.surfaceHigh : 'transparent',
        opacity: disabled && !busy ? 0.5 : 1,
      })}>
      <ConversationAvatar conversation={conversation} meId={meId} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="labelLg" numberOfLines={1}>
          {conversation.name}
        </T>
        <T variant="bodySm" color={colors.textMuted}>
          {conversation.isSaved ? t('Notes and messages saved for yourself') : conversation.type === 'group' ? t('Group') : conversation.type === 'channel' ? t('Channel') : t('Direct message')}
        </T>
      </View>
      {busy ? <ActivityIndicator color={colors.amberText} /> : <Icon name="chevron-right" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}
