import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';

import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { pickAvatar } from '@/lib/avatar-upload';
import { inviteLink } from '@/lib/config';
import { confirm } from '@/lib/confirm';
import { lastSeenLabel } from '@/lib/format';
import { num, t } from '@/lib/i18n';
import type { Conversation, GroupRole, User } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore, useConversation } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { ContextMenu, type ContextMenuItem } from './context-menu';
import { SharedMedia } from './shared-media';
import { Button, Field, Icon, IconButton, PushPin, T, type IconName } from './ui';

const RANK: Record<GroupRole, number> = { member: 0, admin: 1, owner: 2 };

/** Window coordinates of a press (react-native-web exposes clientX/clientY or pageX/pageY). */
function pressPoint(event: any): { x: number; y: number } {
  const native = event?.nativeEvent ?? event ?? {};
  const web = typeof window !== 'undefined' ? (window as any).event : undefined;
  const x = native.pageX ?? native.clientX ?? event?.pageX ?? event?.clientX ?? web?.clientX;
  const y = native.pageY ?? native.clientY ?? event?.pageY ?? event?.clientY ?? web?.clientY;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : { x: 24, y: 120 };
}

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
        borderWidth: 1,
        borderColor: colors.border,
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
    <View style={{ width: 360, backgroundColor: colors.rail, borderStartWidth: 1, borderStartColor: colors.border }}>
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
        <T variant="headlineSm">{conversation.isSaved ? t('Saved Messages') : peer ? t('Contact Info') : isChannel ? t('Channel Info') : t('Group Info')}</T>
        <IconButton name="x" label={t('Close panel')} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 24 }}>
        {isGroup ? (
          <GroupHeader conversation={conversation} />
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', gap: 8 }}>
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
          {!isChannel && !conversation.blocked && !conversation.isSaved && <Action icon="phone" label={t('Call')} onPress={() => startCall(conversation, false)} />}
        </View>

        {/* Secret chats are encrypted per device, so the server can't list what was shared in them. */}
        {!conversation.secret && <SharedMedia conversation={conversation} />}

        {/* Channel subscribers don't get a members list: they only see the owner and admins. */}
        {isGroup && !(isChannel && (conversation.myRole ?? 'member') === 'member') && <Members conversation={conversation} meId={user?.id} />}

        <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
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
        {peer && !conversation.isSaved && <BlockRow conversation={conversation} peer={peer} />}
      </ScrollView>
    </>
  );
}

/** "Block @user" / "Unblock @user" for a one-to-one chat (Stitch Contact Info). */
function BlockRow({ conversation, peer }: { conversation: Conversation; peer: User }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blocked = !!conversation.blocked;
  const toggle = async () => {
    if (
      !blocked &&
      !(await confirm(
        t('Block {name}?', { name: conversation.name }),
        t('They won’t be able to message or call you here, and you won’t be able to message them until you unblock.'),
        t('Block'),
        t('Cancel'),
      ))
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api.blockUser(peer.id, !blocked);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => void toggle()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={blocked ? t('Unblock @{username}', { username: peer.username }) : t('Block @{username}', { username: peer.username })}
        style={({ hovered }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: radius.lg,
          backgroundColor: hovered ? (blocked ? colors.surfaceHigh : colors.dangerTint) : 'transparent',
          opacity: busy ? 0.6 : 1,
        })}>
        {busy ? (
          <ActivityIndicator size="small" color={blocked ? colors.text : colors.danger} />
        ) : (
          <Icon name={blocked ? 'unlock' : 'slash'} size={18} color={blocked ? colors.text : colors.danger} />
        )}
        <T variant="labelLg" color={blocked ? colors.text : colors.danger}>
          {blocked ? t('Unblock @{username}', { username: peer.username }) : t('Block @{username}', { username: peer.username })}
        </T>
      </Pressable>
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
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
            {conversation.type === 'channel'
              ? t('{n} subscribers', { n: num(conversation.memberCount ?? conversation.members.length) })
              : t('{n} members', { n: num(conversation.memberCount ?? conversation.members.length) })}
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

/** Invite link of a group or channel: admins can create and copy it, only the owner can revoke or replace it. */
function InviteLink({ conversation }: { conversation: Conversation }) {
  const isOwner = (conversation.myRole ?? 'member') === 'owner';
  const channel = conversation.type === 'channel';
  // undefined = loading, null = no active link.
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.groupInvite(conversation.id).then(
      (res) => !cancelled && setCode(res.code),
      () => !cancelled && setCode(null),
    );
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  const run = async (fn: () => Promise<{ code: string | null }>) => {
    setBusy(true);
    setError('');
    try {
      setCode((await fn()).code);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not update the invite link'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(inviteLink(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async () => {
    const ok = await confirm(
      t('Revoke link'),
      t('The current link stops working right away. People already in the {kind} stay.', { kind: channel ? t('channel') : t('group') }),
      t('Revoke link'),
      t('Cancel'),
    );
    if (ok) await run(() => api.revokeGroupInvite(conversation.id));
  };

  const replace = async () => {
    const ok = await confirm(
      t('New link (revokes the old one)'),
      t('The current link stops working right away and a new one is made.'),
      t('Create invite link'),
      t('Cancel'),
    );
    if (ok) await run(() => api.createGroupInvite(conversation.id, true));
  };

  if (code === undefined) return null;
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="link" size={16} color={colors.amberText} />
        <T variant="labelLg">{t('Invite link')}</T>
      </View>
      {code ? (
        <>
          <T
            variant="bodySm"
            color={colors.textMuted}
            numberOfLines={2}
            selectable
            style={{ writingDirection: 'ltr', textAlign: 'left', ...(Platform.OS === 'web' ? ({ direction: 'ltr', unicodeBidi: 'isolate', wordBreak: 'break-all' } as object) : {}) }}>
            {inviteLink(code)}
          </T>
          <Button title={copied ? t('Link copied') : t('Copy link')} icon={copied ? 'check' : 'copy'} size="sm" onPress={() => void copy()} />
          {isOwner && (
            // Full width, one under the other, like Copy link above them.
            <View style={{ gap: 8 }}>
              <Button title={t('New link (revokes the old one)')} icon="refresh-cw" size="sm" variant="subtle" loading={busy} onPress={() => void replace()} />
              <Button title={t('Revoke link')} icon="slash" size="sm" variant="danger" loading={busy} onPress={() => void revoke()} />
            </View>
          )}
          <T variant="bodySm" color={colors.textDim}>
            {isOwner ? t('Anyone with this link can join. Only the owner can revoke it.') : t('Anyone with this link can join.')}
          </T>
        </>
      ) : (
        <Button title={t('Create invite link')} icon="plus" size="sm" loading={busy} onPress={() => void run(() => api.createGroupInvite(conversation.id))} />
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

function Members({ conversation, meId }: { conversation: Conversation; meId?: string }) {
  const wide = useIsWide();
  const myRole = conversation.myRole ?? 'member';
  const canAdd = RANK[myRole] >= RANK.admin;
  // Member actions open in their own menu, over the panel, instead of expanding the row.
  const [menu, setMenu] = useState<{ member: User & { role?: GroupRole }; point: { x: number; y: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<Conversation | { ok: true }>) => {
    setBusy(true);
    setError(null);
    try {
      const c = await fn();
      if ('id' in c) chatStore.upsertConversation(c);
      else chatStore.refreshConversations();
      setMenu(null);
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
      setMenu(null);
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
      {canAdd && <InviteLink conversation={conversation} />}
      {conversation.members.map((m) => {
        const actions = actionsFor(m);
        const open = menu?.member.id === m.id;
        return (
          <Pressable
            key={m.id}
            onPress={actions.length ? (event: any) => setMenu({ member: m, point: pressPoint(event) }) : undefined}
            disabled={!actions.length}
            accessibilityRole="button"
            accessibilityLabel={m.displayName}
            accessibilityState={actions.length ? { expanded: open } : undefined}
            style={({ hovered }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 8,
              borderRadius: radius.lg,
              backgroundColor: open || (hovered && actions.length) ? colors.surface : 'transparent',
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
              {actions.length > 0 && <Icon name="more-vertical" size={18} color={open ? colors.amberText : colors.textMuted} />}
          </Pressable>
        );
      })}
      <ContextMenu
        point={menu?.point ?? null}
        title={menu?.member.displayName}
        items={
          menu
            ? actionsFor(menu.member).map(
                (a): ContextMenuItem => ({
                  icon: a.icon,
                  label: a.label,
                  danger: a.danger,
                  disabled: busy,
                  onPress: () => {
                    setMenu(null);
                    a.run();
                  },
                }),
              )
            : []
        }
        onClose={() => setMenu(null)}
      />
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
    if (!(await confirm(conversation.type === 'channel' ? t('Leave channel') : t('Leave group'), message, t('Leave'), t('Cancel')))) return;
    setBusy(true);
    try {
      await api.removeMember(conversation.id, meId);
      chatStore.dropConversation(conversation.id);
      router.replace('/');
    } catch {
      setBusy(false);
    }
  };
  return <Button title={conversation.type === 'channel' ? t('Leave channel') : t('Leave group')} icon="log-out" variant="danger" onPress={leave} loading={busy} />;
}
