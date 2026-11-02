import { Pressable, ScrollView, View } from 'react-native';

import { lastSeenLabel } from '@/lib/format';
import type { Conversation } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore, useConversation } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { Icon, IconButton, T, type IconName } from './ui';
import { t, num } from '@/lib/i18n';

function Action({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flex: 1,
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: radius.lg,
        backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
      })}>
      <Icon name={icon} size={20} color={active ? colors.amber : colors.text} />
      <T variant="label" color={active ? colors.amber : colors.textMuted}>
        {label}
      </T>
    </Pressable>
  );
}

/** Right-hand "Contact Info" panel from the Stitch desktop chat screen. */
export function ContactPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const conversation = useConversation(conversationId);
  const { user } = useAuth();
  const { startCall } = useCalls();
  if (!conversation) return null;
  const peer = conversation.type === 'direct' ? conversation.members.find((m) => m.id !== user?.id) : undefined;

  return (
    <View style={{ width: 360, backgroundColor: colors.rail, borderLeftWidth: 1, borderLeftColor: colors.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 72 }}>
        <T variant="headlineSm">{peer ? t('Contact Info') : t('Group Info')}</T>
        <IconButton name="x" label={t('Close panel')} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 8 }}>
          {peer ? <Avatar user={peer} size={96} ringBg={colors.surface} /> : <ConversationAvatar conversation={conversation} meId={user?.id} size={96} ringBg={colors.surface} />}
          <T variant="headline" style={{ fontSize: 26, marginTop: 8, textAlign: 'center' }}>
            {conversation.name}
          </T>
          {peer && (
            <T variant="labelLg" color={colors.amber}>
              @{peer.username}
            </T>
          )}
          {!!peer?.title && (
            <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 }}>
              <T variant="labelLg">{peer.title}</T>
            </View>
          )}
          <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
            {peer ? peer.bio || lastSeenLabel(peer.online, peer.lastSeen) : t('{n} members', { n: num(conversation.members.length) })}
          </T>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Action
            icon={conversation.muted ? 'bell-off' : 'bell'}
            label={conversation.muted ? t('Muted') : t('Mute')}
            active={conversation.muted}
            onPress={() => chatStore.setMuted(conversation.id, !conversation.muted)}
          />
          <Action
            icon="bookmark"
            label={conversation.pinned ? t('Pinned') : t('Pin')}
            active={conversation.pinned}
            onPress={() => chatStore.setPinned(conversation.id, !conversation.pinned)}
          />
          <Action icon="phone" label={t('Call')} onPress={() => startCall(conversation, false)} />
          <Action icon="video" label={t('Video')} onPress={() => startCall(conversation, true)} />
        </View>

        <Members conversation={conversation} meId={user?.id} />

        <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface }}>
          <Icon name="shield" size={18} color={colors.teal} />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="labelLg" color={colors.teal}>
              {t('Private conversation')}
            </T>
            <T variant="bodySm" color={colors.textMuted}>
              {t('Only members of this {kind} can read these messages. Calls are encrypted peer-to-peer with WebRTC.', {
                kind: conversation.type === 'group' ? t('group') : t('chat'),
              })}
            </T>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Members({ conversation, meId }: { conversation: Conversation; meId?: string }) {
  if (conversation.type !== 'group') return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T variant="labelLg">{t('Members')}</T>
        <T variant="label" color={colors.textMuted}>
          {conversation.members.length}
        </T>
      </View>
      {conversation.members.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar user={m} size={40} ringBg={colors.rail} />
          <View style={{ flex: 1 }}>
            <T variant="labelLg">
              {m.displayName}
              {m.id === meId ? ' (you)' : ''}
            </T>
            <T variant="bodySm" color={colors.textMuted}>
              @{m.username}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}
