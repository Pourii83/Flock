import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { ModalFrame } from '@/components/modal-frame';
import { PersonRow, usePeople } from '@/components/member-picker';
import { Icon, SearchBar, T } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { User } from '@/lib/types';
import { chatStore } from '@/state/chat-store';
import { colors, radius } from '@/theme';

/** New chat: pick one person for a direct chat, or start the New group flow. */
export default function NewChatScreen() {
  const wide = useIsWide();
  const [query, setQuery] = useState('');
  const people = usePeople(query);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const open = async (user: User) => {
    setBusy(user.id);
    setError(null);
    try {
      const c = await api.createConversation([user.id]);
      chatStore.upsertConversation(c);
      if (router.canGoBack()) router.back();
      if (wide) router.navigate({ pathname: '/', params: { c: c.id } });
      else router.push(`/chat/${c.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <ModalFrame title={t('New chat')} onClose={close}>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('Search people by name or @username')} autoFocus />

      <Pressable
        onPress={() => router.replace('/new-group')}
        accessibilityRole="button"
        style={({ hovered, pressed }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: pressed || hovered ? colors.surfaceHigh : colors.surface,
          borderWidth: 1,
          borderColor: colors.surfaceHigh,
        })}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="users" size={20} color={colors.onAmber} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="labelLg" style={{ fontSize: 16 }}>
            {t('New group')}
          </T>
          <T variant="body" color={colors.textMuted}>
            {t('Chat and call with several people')}
          </T>
        </View>
        <Icon name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>

      {!!error && (
        <T variant="body" color={colors.danger}>
          {error}
        </T>
      )}

      <FlatList
        data={people ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ gap: 4, paddingBottom: 24 }}
        ListHeaderComponent={
          <T variant="overline" color={colors.textMuted} style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
            {t('PEOPLE')}
          </T>
        }
        ListEmptyComponent={
          people === null ? (
            <ActivityIndicator color={colors.amber} style={{ marginTop: 24 }} />
          ) : (
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 24 }}>
              {query ? t('Nobody found with that name.') : t('No one else has joined Flock yet. Invite a friend to register!')}
            </T>
          )
        }
        renderItem={({ item }) => (
          <PersonRow
            user={item}
            onPress={() => open(item)}
            trailing={busy === item.id ? <ActivityIndicator color={colors.amber} /> : <Icon name="message-square" size={18} color={colors.textMuted} />}
          />
        )}
      />
    </ModalFrame>
  );
}
