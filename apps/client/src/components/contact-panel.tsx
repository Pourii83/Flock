import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';

import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { pickAvatar } from '@/lib/avatar-upload';
import { confirm } from '@/lib/confirm';
import { lastSeenLabel } from '@/lib/format';
import { num, t } from '@/lib/i18n';
import type { Conversation, GroupRole, User } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore, useConversation } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { Button, Field, Icon, IconButton, PushPin, T, type IconName } from './ui';

const RANK: Record<GroupRole, number> = { member: 0, admin: 1, owner: 2 };

function Action({ icon, pin, label, onPress, active }: { icon?: IconName; pin?: boolean; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }: any) => ({
        flex: 1,
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: radius.lg,
        backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
      })}>
      {pin ? <PushPin size={20} color={active ? colors.amberText : colors.text} /> : <Icon name={icon ?? 'circle'} size={20} color={active ? colors.amberText : colors.text} />}
      <T variant="label" color={active ? colors.amberText : colors.textMuted}>
        {label}
      </T>
    </Pressable>
  );
}

/** Desktop right-hand panel ("Contact Info" / "Group Info"). */
export function ContactPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  return (
    <View style={{ width: 360, backgroundColor: colors.rail, borderLeftWidth: 1, borderLeftColor: colors.surfaceHigh }}>
      <ConversationInfo conversationId={conversationId} onClose={onClose} />
    </View>
  );
}

/** Contact or group details, shared by the desktop panel and the full-screen info page. */
export function ConversationInfo({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const conversation = useConversation(conversationId);
  const { user } = useAuth();
  const { startCall } = useCalls();
  if (!conversation) return null;
  const peer = conversation.type === 'direct' ? conversation.members.find((m) => m.id !== user?.id) : undefined;
  const isChannel = conversation.type === 'channel';
  const isGroup = conversation.type === 'group' || isChannel;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 72 }}>
        <T variant="headlineSm">{peer ? t('Contact Info') : isChannel ? t('Channel Info') : t('Group Info')}</T>
        <IconButton name="x" label={t('Close panel')} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 24 }}>
        {isGroup ? (
          <GroupHeader conversation={conversation} />
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 8 }}>
            <Avatar user={peer} size={96} ringBg={colors.surface} />
            <T variant="headline" style={{ fontSize: 26, marginTop: 8, textAlign: 'center' }}>
              {conversation.name}
            </T>
            {peer && (
              <T variant="labelLg" color={colors.amberText}>
                @{peer.username}
              </T>
            )}
            {!!peer?.title && (
              <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 }}>
                <T variant="labelLg">{peer.title}</T>
              </View>
            )}
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
              {peer ? peer.bio || lastSeenLabel(peer.online, peer.lastSeen) : ''}
            </T>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Action
            icon={conversation.muted ? 'bell-off' : 'bell'}
            label={conversation.muted ? t('Muted') : t('Mute')}
            active={conversation.muted}
            onPress={() => chatStore.setMuted(conversation.id, !conversation.muted)}
          />
          <Action
            pin
            label={conversation.pinned ? t('Pinned') : t('Pin')}
            active={conversation.pinned}
            onPress={() => chatStore.setPinned(conversation.id, !conversation.pinned)}
          />
          {!isChannel && <Action icon="phone" label={t('Call')} onPress={() => startCall(conversation, false)} />}
        </View>

        {isGroup && <Members conversation={conversation} meId={user?.id} />}

        <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface }}>
          <Icon name="shield" size={18} color={colors.teal} />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="labelLg" color={colors.teal}>
              {t('Private conversation')}
            </T>
            <T variant="bodySm" color={colors.textMuted}>
              {t('Only members of this {kind} can read these messages. Calls are encrypted peer-to-peer with WebRTC.', {
                kind: isChannel ? t('channel') : isGroup ? t('group') : t('chat'),
              })}
            </T>
          </View>
        </View>

        {isGroup && <LeaveGroup conversation={conversation} meId={user?.id} />}
      </ScrollView>
    </>
  );
}

/** Group photo, name and description; owners and admins can edit them. */
function GroupHeader({ conversation }: { conversation: Conversation }) {
  const canEdit = conversation.myRole === 'owner' || conversation.myRole === 'admin';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conversation.name);
  const [description, setDescription] = useState(conversation.description);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'photo' | 'save', fn: () => Promise<Conversation | void>) => {
    setBusy(kind);
    setError(null);
    try {
      const c = await fn();
      if (c) chatStore.upsertConversation(c);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changePhoto = () =>
    run('photo', async () => {
      const base64 = await pickAvatar();
      if (base64) return api.setGroupAvatar(conversation.id, base64);
    });

  const save = async () => {
    if (await run('save', () => api.updateGroupInfo(conversation.id, { name: name.trim(), description: description.trim() }))) setEditing(false);
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 8 }}>
      <Pressable onPress={canEdit ? changePhoto : undefined} disabled={!canEdit || !!busy} accessibilityLabel={t('Group photo')}>
        <ConversationAvatar conversation={conversation} meId={undefined} size={96} ringBg={colors.surface} />
        {canEdit && (
          <View
            style={{
              position: 'absolute',
              end: -2,
              bottom: -2,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: colors.amber,
              borderWidth: 3,
              borderColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {busy === 'photo' ? <ActivityIndicator size="small" color={colors.onAmber} /> : <Icon name="camera" size={15} color={colors.onAmber} />}
          </View>
        )}
      </Pressable>
      {canEdit && !!conversation.avatarUrl && (
        <Pressable onPress={() => run('photo', () => api.removeGroupAvatar(conversation.id))} hitSlop={6}>
          <T variant="label" color={colors.textMuted}>
            {t('Remove photo')}
          </T>
        </Pressable>
      )}

      {editing ? (
        <View style={{ alignSelf: 'stretch', gap: 12, marginTop: 8 }}>
          <Field label={t('Group name')} icon="users" value={name} onChangeText={setName} maxLength={80} />
          <Field label={t('Description (optional)')} icon="align-left" value={description} onChangeText={setDescription} maxLength={500} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={t('Cancel')} variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => setEditing(false)} />
            <Button title={t('Save changes')} size="sm" style={{ flex: 1 }} onPress={save} loading={busy === 'save'} disabled={!name.trim()} />
          </View>
        </View>
      ) : (
        <>
          <T variant="headline" style={{ fontSize: 26, marginTop: 8, textAlign: 'center' }}>
            {conversation.name}
          </T>
          {!!conversation.description && (
            <T variant="body" color={colors.amberSoftText} style={{ textAlign: 'center' }}>
              {conversation.description}
            </T>
          )}
          <T variant="body" color={colors.textMuted}>
            {t('{n} members', { n: num(conversation.members.length) })}
          </T>
          {canEdit && (
            <Button
              title={t('Edit group')}
              icon="edit-2"
              variant="ghost"
              size="sm"
              onPress={() => {
                setName(conversation.name);
                setDescription(conversation.description);
                setEditing(true);
              }}
            />
          )}
        </>
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

function RoleBadge({ role }: { role?: GroupRole }) {
  if (!role || role === 'member') return null;
  const owner = role === 'owner';
  return (
    <View style={{ backgroundColor: owner ? colors.amberTint : colors.tealTint, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T variant="labelSm" color={owner ? colors.amberText : colors.teal}>
        {owner ? t('Owner') : t('Admin')}
      </T>
    </View>
  );
}

function Members({ conversation, meId }: { conversation: Conversation; meId?: string }) {
  const wide = useIsWide();
  const myRole = conversation.myRole ?? 'member';
  const canAdd = RANK[myRole] >= RANK.admin;
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<Conversation | { ok: true }>) => {
    setBusy(true);
    setError(null);
    try {
      const c = await fn();
      if ('id' in c) chatStore.upsertConversation(c);
      else chatStore.refreshConversations();
      setOpenId(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /** Opens (or creates) the direct chat with a member; same call as contacts.tsx / new-chat.tsx. */
  const message = async (m: User) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.createConversation([m.id]);
      chatStore.upsertConversation(c);
      setOpenId(null);
      if (wide) router.navigate({ pathname: '/', params: { c: c.id } });
      else router.push(`/chat/${c.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /** What I may do to this member, given both roles. */
  const actionsFor = (m: User & { role?: GroupRole }) => {
    const role = m.role ?? 'member';
    const list: { icon: IconName; label: string; danger?: boolean; run: () => void }[] = [];
    if (m.id === meId) return list;
    // Anyone in the group can message any other member.
    list.push({ icon: 'message-circle', label: t('Send message'), run: () => message(m) });
    if (myRole === 'owner') {
      if (role === 'member')
        list.push({ icon: 'shield', label: t('Make admin'), run: () => act(() => api.setMemberRole(conversation.id, m.id, 'admin')) });
      if (role === 'admin')
        list.push({ icon: 'shield-off', label: t('Remove admin'), run: () => act(() => api.setMemberRole(conversation.id, m.id, 'member')) });
      list.push({
        icon: 'award',
        label: t('Make group owner'),
        run: async () => {
          if (await confirm(t('Make group owner'), t('{name} will become the owner and you will become an admin.', { name: m.displayName }), t('Make owner'), t('Cancel')))
            act(() => api.setMemberRole(conversation.id, m.id, 'owner'));
        },
      });
    }
    if (RANK[myRole] > RANK[role] && RANK[myRole] >= RANK.admin)
      list.push({
        icon: 'user-x',
        label: t('Remove from group'),
        danger: true,
        run: async () => {
          if (await confirm(t('Remove from group'), t('Remove {name} from this group?', { name: m.displayName }), t('Remove'), t('Cancel')))
            act(() => api.removeMember(conversation.id, m.id));
        },
      });
    return list;
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 4 }}>
        <T variant="labelLg">{t('Members')}</T>
        <T variant="label" color={colors.textMuted}>
          {num(conversation.members.length)}
        </T>
      </View>
      {canAdd && (
        <Pressable
          onPress={() => router.push({ pathname: '/add-members', params: { c: conversation.id } })}
          accessibilityRole="button"
          style={({ hovered }: any) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 8,
            borderRadius: radius.lg,
            backgroundColor: hovered ? colors.surface : 'transparent',
          })}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user-plus" size={18} color={colors.amberText} />
          </View>
          <T variant="labelLg" color={colors.amberText}>
            {t('Add members')}
          </T>
        </Pressable>
      )}
      {conversation.members.map((m) => {
        const actions = actionsFor(m);
        const open = openId === m.id;
        return (
          <View key={m.id} style={{ borderRadius: radius.lg, backgroundColor: open ? colors.surface : 'transparent' }}>
            <Pressable
              onPress={actions.length ? () => setOpenId(open ? null : m.id) : undefined}
              disabled={!actions.length}
              accessibilityLabel={m.displayName}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 8,
                borderRadius: radius.lg,
                backgroundColor: hovered && actions.length && !open ? colors.surface : 'transparent',
              })}>
              <Avatar user={m} size={40} ringBg={colors.rail} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {m.displayName}
                    {m.id === meId ? ` ${t('(you)')}` : ''}
                  </T>
                  <RoleBadge role={m.role} />
                  {/* On the same line as the name; the handle stays left-to-right even in Persian. */}
                  <T
                    variant="bodySm"
                    color={colors.textMuted}
                    numberOfLines={1}
                    style={{ flexShrink: 2, minWidth: 0, writingDirection: 'ltr', ...(Platform.OS === 'web' ? ({ direction: 'ltr', unicodeBidi: 'isolate' } as object) : {}) }}>
                    @{m.username}
                  </T>
                </View>
              </View>
              {actions.length > 0 && <Icon name={open ? 'chevron-up' : 'more-vertical'} size={18} color={colors.textMuted} />}
            </Pressable>
            {open && (
              <View style={{ paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
                {actions.map((a) => (
                  <Pressable
                    key={a.label}
                    onPress={a.run}
                    disabled={busy}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      backgroundColor: hovered ? colors.surfaceHigh : 'transparent',
                    })}>
                    <Icon name={a.icon} size={16} color={a.danger ? colors.danger : colors.text} />
                    <T variant="body" color={a.danger ? colors.danger : colors.text}>
                      {a.label}
                    </T>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

function LeaveGroup({ conversation, meId }: { conversation: Conversation; meId?: string }) {
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (!meId) return;
    const message =
      conversation.myRole === 'owner'
        ? t('You are the owner. An admin (or the longest-standing member) will become the new owner.')
        : t('You will stop receiving messages from this group.');
    if (!(await confirm(t('Leave group'), message, t('Leave'), t('Cancel')))) return;
    setBusy(true);
    try {
      await api.removeMember(conversation.id, meId);
      chatStore.dropConversation(conversation.id);
      router.replace('/');
    } catch {
      setBusy(false);
    }
  };
  return <Button title={t('Leave group')} icon="log-out" variant="danger" onPress={leave} loading={busy} />;
}
