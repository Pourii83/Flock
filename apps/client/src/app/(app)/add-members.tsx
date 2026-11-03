import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { MemberPicker } from '@/components/member-picker';
import { ModalFrame } from '@/components/modal-frame';
import { Button, T } from '@/components/ui';
import { api } from '@/lib/api';
import { num, t } from '@/lib/i18n';
import type { User } from '@/lib/types';
import { chatStore, useConversation } from '@/state/chat-store';
import { colors } from '@/theme';

/** Add people to an existing group (owners and admins). */
export default function AddMembersScreen() {
  const { c: conversationId } = useLocalSearchParams<{ c: string }>();
  const conversation = useConversation(conversationId);
  const [selected, setSelected] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.addMembers(conversationId, selected.map((u) => u.id));
      chatStore.upsertConversation(c);
      close();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <ModalFrame title={t('Add members')} subtitle={conversation?.name} onClose={close}>
      <MemberPicker selected={selected} onChange={setSelected} excludeIds={conversation?.members.map((m) => m.id) ?? []} />
      {!!error && (
        <T variant="body" color={colors.danger}>
          {error}
        </T>
      )}
      <Button
        title={selected.length ? t('Add {n} to the group', { n: num(selected.length) }) : t('Select people to add')}
        icon="user-plus"
        disabled={!selected.length}
        loading={busy}
        onPress={add}
      />
    </ModalFrame>
  );
}
