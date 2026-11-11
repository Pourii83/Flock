import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar, MegaphoneIcon } from '@/components/avatar';
import { MemberPicker } from '@/components/member-picker';
import { ModalFrame } from '@/components/modal-frame';
import { Button, Field, Icon, T } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { pickAvatar } from '@/lib/avatar-upload';
import { num, t } from '@/lib/i18n';
import type { User } from '@/lib/types';
import { chatStore } from '@/state/chat-store';
import { colors } from '@/theme';

/** New group or channel in two clear steps: ① choose members ② name, photo and description. */
export default function NewGroupScreen() {
  const wide = useIsWide();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const channel = kind === 'channel';
  const [step, setStep] = useState<1 | 2>(1);
  const [members, setMembers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const choosePhoto = async () => {
    try {
      const base64 = await pickAvatar();
      if (base64) setPhoto(base64);
    } catch {}
  };

  const create = async () => {
    if (!name.trim()) return setError(channel ? t('Give the channel a name') : t('Give the group a name'));
    setBusy(true);
    setError(null);
    try {
      let c = await api.createGroup(
        members.map((m) => m.id),
        name.trim(),
        description.trim(),
        channel,
      );
      if (photo) c = await api.setGroupAvatar(c.id, photo).catch(() => c);
      chatStore.upsertConversation(c);
      if (router.canGoBack()) router.back();
      if (wide) router.navigate({ pathname: '/', params: { c: c.id } });
      else router.push(`/chat/${c.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (step === 1) {
    return (
      <ModalFrame
        title={channel ? t('New channel') : t('New group')}
        subtitle={channel ? t('Step 1 of 2 · Add subscribers') : t('Step 1 of 2 · Add members')}
        onClose={close}>
        <MemberPicker selected={members} onChange={setMembers} />
        <Button
          title={
            members.length
              ? t('Next · {n} selected', { n: num(members.length) })
              : channel
                ? t('Skip · add subscribers later')
                : t('Select at least one person')
          }
          iconRight="arrow-right"
          disabled={!channel && !members.length}
          onPress={() => setStep(2)}
        />
      </ModalFrame>
    );
  }

  return (
    <ModalFrame
      title={channel ? t('New channel') : t('New group')}
      subtitle={channel ? t('Step 2 of 2 · Channel details') : t('Step 2 of 2 · Group details')}
      onClose={close}
      onBack={() => setStep(1)}>
      <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Pressable onPress={choosePhoto} accessibilityRole="button" accessibilityLabel={t('Group photo')}>
            {photo ? (
              <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
                {channel ? <MegaphoneIcon size={34} color={colors.amberText} /> : <Icon name="users" size={34} color={colors.amberText} />}
              </View>
            )}
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
                borderColor: colors.rail,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="camera" size={15} color={colors.onAmber} />
            </View>
          </Pressable>
          <T variant="bodySm" color={colors.textMuted}>
            {photo ? t('Tap to change the photo') : t('Add a group photo (optional)')}
          </T>
        </View>

        <Field
          label={channel ? t('Channel name') : t('Group name')}
          icon={channel ? 'volume-2' : 'users'}
          placeholder={channel ? t('e.g. Product news') : t('e.g. Design team')}
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoFocus
        />
        <Field
          label={t('Description (optional)')}
          icon="align-left"
          placeholder={channel ? t('What is this channel about?') : t('What is this group about?')}
          value={description}
          onChangeText={setDescription}
          maxLength={500}
        />

        <View style={{ gap: 8 }}>
          <T variant="labelLg">{channel ? t('{n} subscribers', { n: num(members.length + 1) }) : t('{n} members', { n: num(members.length + 1) })}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {members.map((m) => (
              <View key={m.id} style={{ alignItems: 'center', gap: 4, width: 64 }}>
                <Avatar user={m} size={44} showPresence={false} />
                <T variant="labelSm" color={colors.textMuted} numberOfLines={1}>
                  {m.displayName.split(' ')[0]}
                </T>
              </View>
            ))}
          </View>
          <T variant="bodySm" color={colors.textDim}>
            {channel ? t('You will be the channel owner. Only you and the admins you pick can post.') : t('You will be the group owner and can make others admins.')}
          </T>
        </View>

        {!!error && (
          <T variant="body" color={colors.danger}>
            {error}
          </T>
        )}
      </ScrollView>
      <Button title={channel ? t('Create channel') : t('Create group')} icon="check" onPress={create} loading={busy} disabled={!name.trim()} />
    </ModalFrame>
  );
}
