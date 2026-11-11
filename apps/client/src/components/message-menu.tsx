// Right-click / long-press menu for a message: Reply, Edit, Forward, Copy, Saved Messages,
// Delete, Pin, plus the quick-reaction row. Uses the shared ContextMenu and EmojiPickerModal.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';

import { confirm } from '@/lib/confirm';
import type { Conversation, Message } from '@/lib/types';
import { t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { ConversationAvatar } from './avatar';
import { ContextMenu, type ContextMenuItem } from './context-menu';
import { EmojiPickerModal } from './emoji-picker';
import { Icon, IconButton, T } from './ui';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😢', '🙏', '👎'] as const;

export function MessageMenu({
  message,
  conversation,
  mine,
  pinned,
  point,
  onReply,
  onEdit,
  onError,
  onClose,
}: {
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

  // The whole menu dismisses only once every layer (menu, forward, picker) is closed.
  const done = !menuPoint && !forwardOpen && !pickerOpen;
  useEffect(() => {
    if (done) onClose();
  }, [done, onClose]);

  const canAct = !message.pending && !message.failed;
  const isText = message.kind === 'text';
  const canDelete = canAct && mine;
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
    const ok = await confirm(t('Delete message'), t('Delete this message for everyone?'), t('Delete'), t('Cancel'));
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
  const menuItems: ContextMenuItem[] = [{ icon: 'corner-up-left', label: t('Reply'), onPress: onReply }];
  if (canAct && isText && mine) menuItems.push({ icon: 'edit-2', label: t('Edit'), onPress: onEdit });
  if (canForward) menuItems.push({ icon: 'corner-up-right', label: t('Forward'), onPress: () => setForwardOpen(true) });
  if (canAct && isText) menuItems.push({ icon: 'copy', label: t('Copy'), onPress: () => void copy() });
  if (canSave) menuItems.push({ icon: 'bookmark', label: t('Saved Messages'), onPress: () => void save() });
  if (canDelete) menuItems.push({ icon: 'trash-2', label: t('Delete'), danger: true, onPress: () => void remove() });
  if (canPin) menuItems.push({ pin: true, label: pinned ? t('Unpin') : t('Pin'), onPress: () => void togglePin() });

  return (
    <>
      <ContextMenu
        point={menuPoint}
        onClose={() => setMenuPoint(null)}
        items={menuItems}
        emoji={QUICK_REACTIONS}
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
        borderRadius: radius.md,
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
