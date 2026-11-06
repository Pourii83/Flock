import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { ModalFrame } from '@/components/modal-frame';
import { MIN_SEARCH, PersonRow, usePeople } from '@/components/member-picker';
import { Icon, SearchBar, T, type IconName } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { User } from '@/lib/types';
import { ensureDevice } from '@/lib/e2e';
import { useAuth } from '@/state/auth';
import { chatStore } from '@/state/chat-store';
import { colors, radius } from '@/theme';

/** New chat: pick one person for a direct chat, or start the New group flow. */
export default function NewChatScreen() {
  const wide = useIsWide();
  const [query, setQuery] = useState('');
  const people = usePeople(query, [], 'directory');
  const ready = query.trim().replace(/^@/, '').length >= MIN_SEARCH;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'normal' | 'secret'>('normal');
  const { user: me } = useAuth();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const open = async (user: User) => {
    setBusy(user.id);
    setError(null);
    try {
      // Secret chats are bound to this device's key, made on first use.
      const c = mode === 'secret' && me ? await api.createSecretConversation(user.id, (await ensureDevice(me.id)).id) : await api.createConversation([user.id]);
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
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <ModeOption
          active={mode === 'normal'}
          onPress={() => setMode('normal')}
          icon="message-square"
          title={t('Normal chat')}
          pros={[t('Works on all your devices'), t('History, search and files')]}
          cons={[t('Stored readable on the Flock server')]}
        />
        <ModeOption
          active={mode === 'secret'}
          onPress={() => setMode('secret')}
          icon="lock"
          title={t('Secret chat')}
          pros={[t('End-to-end encrypted: the server only sees scrambled text'), t('Safety code to verify')]}
          cons={[t('Only on this device and one of theirs'), t('Lost if you clear this browser or reinstall'), t('No files yet')]}
        />
      </View>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('Search people by name or @username')} autoFocus />

      {mode === 'normal' && (
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
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: colors.amber,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
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
      )}

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
          ready && !!people?.length ? (
            <T variant="overline" color={colors.textMuted} style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
              {t('PEOPLE')}
            </T>
          ) : undefined
        }
        ListEmptyComponent={
          !ready ? (
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 24 }}>
              {t('Type at least {n} characters of a username to find someone.', { n: MIN_SEARCH })}
            </T>
          ) : people === null ? (
            <ActivityIndicator color={colors.amberText} style={{ marginTop: 24 }} />
          ) : (
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 24 }}>
              {t('Nobody found with that name.')}
            </T>
          )
        }
        renderItem={({ item }) => (
          <PersonRow
            user={item}
            onPress={() => open(item)}
            trailing={busy === item.id ? <ActivityIndicator color={colors.amberText} /> : <Icon name="message-square" size={18} color={colors.textMuted} />}
          />
        )}
      />
    </ModalFrame>
  );
}

/** One of the two chat kinds, with what you gain and what you give up. */
function ModeOption({
  active,
  onPress,
  icon,
  title,
  pros,
  cons,
}: {
  active: boolean;
  onPress: () => void;
  icon: IconName;
  title: string;
  pros: string[];
  cons: string[];
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ hovered }: any) => ({
        flex: 1,
        gap: 8,
        padding: 12,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: active ? colors.amber : colors.surfaceHigh,
        backgroundColor: active ? colors.amberTint : hovered ? colors.surfaceHigh : colors.surface,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={active ? colors.amberText : colors.textMuted} />
        <T variant="labelLg" color={active ? colors.amberText : colors.text}>
          {title}
        </T>
      </View>
      {pros.map((p) => (
        <View key={p} style={{ flexDirection: 'row', gap: 6 }}>
          <Icon name="plus-circle" size={13} color={colors.teal} />
          <T variant="bodySm" style={{ flex: 1 }}>
            {p}
          </T>
        </View>
      ))}
      {cons.map((c) => (
        <View key={c} style={{ flexDirection: 'row', gap: 6 }}>
          <Icon name="minus-circle" size={13} color={colors.textMuted} />
          <T variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
            {c}
          </T>
        </View>
      ))}
    </Pressable>
  );
}
