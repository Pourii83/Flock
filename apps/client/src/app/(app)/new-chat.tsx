import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button, Icon, IconButton, noOutline, SearchBar, T } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { chatStore } from '@/state/chat-store';
import { colors, fonts, radius } from '@/theme';
import { t, num } from '@/lib/i18n';

export default function NewChatScreen() {
  const wide = useIsWide();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<User[] | null>(null);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api.users(query.trim()).then(
        (list) => !cancelled && setPeople(list),
        () => !cancelled && setPeople([]),
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const toggle = (u: User) =>
    setSelected((s) => (s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const open = async (users: User[]) => {
    if (!users.length) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.createConversation(
        users.map((u) => u.id),
        users.length > 1 ? groupName.trim() || undefined : undefined,
      );
      chatStore.upsertConversation(c);
      if (router.canGoBack()) router.back();
      if (wide) router.navigate({ pathname: '/', params: { c: c.id } });
      else router.push(`/chat/${c.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const content = (
    <View style={{ flex: 1, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T variant="headline" style={{ flex: 1, fontSize: 26 }}>
          {t('New chat')}
        </T>
        <IconButton name="x" label={t('Close')} onPress={close} bg={colors.surface} />
      </View>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('Search people by name or @username')} autoFocus />

      {selected.length > 0 && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {selected.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => toggle(u)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.amberTint, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 10, paddingVertical: 4 }}>
                <Avatar user={u} size={24} showPresence={false} />
                <T variant="label" color={colors.amber}>
                  {u.displayName}
                </T>
                <Icon name="x" size={12} color={colors.amber} />
              </Pressable>
            ))}
          </View>
          {selected.length > 1 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 14, height: 48 }}>
              <Icon name="users" size={17} color={colors.textMuted} />
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder={t('Group name (optional)')}
                placeholderTextColor={colors.textMuted}
                style={[{ flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15, height: '100%' }, noOutline]}
              />
            </View>
          )}
          <Button
            title={selected.length > 1 ? t('Create group with {n} people', { n: num(selected.length) }) : t('Message {name}', { name: selected[0]!.displayName })}
            icon={selected.length > 1 ? 'users' : 'message-square'}
            onPress={() => open(selected)}
            loading={busy}
          />
        </View>
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
        ListEmptyComponent={
          people === null ? (
            <ActivityIndicator color={colors.amber} style={{ marginTop: 24 }} />
          ) : (
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 24 }}>
              {query ? t('Nobody found with that name.') : t('No one else has joined Flock yet. Invite a friend to register!')}
            </T>
          )
        }
        renderItem={({ item }) => {
          const isSelected = selected.some((x) => x.id === item.id);
          return (
            <Pressable
              onPress={() => (selected.length ? toggle(item) : open([item]))}
              onLongPress={() => toggle(item)}
              style={({ hovered, pressed }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 12,
                borderRadius: radius.lg,
                backgroundColor: isSelected || pressed ? colors.surface : hovered ? 'rgba(22,29,42,0.6)' : 'transparent',
              })}>
              <Avatar user={item} size={46} />
              <View style={{ flex: 1 }}>
                <T variant="labelLg" style={{ fontSize: 16 }}>
                  {item.displayName}
                </T>
                <T variant="body" color={colors.textMuted}>
                  @{item.username}
                  {item.title ? ` · ${item.title}` : ''}
                </T>
              </View>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation(); // don't also trigger the row's "open chat"
                  toggle(item);
                }}
                hitSlop={8}
                accessibilityLabel={t('Select {name}', { name: item.displayName })}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.amber : colors.surfaceHighest,
                    backgroundColor: isSelected ? colors.amber : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {isSelected && <Icon name="check" size={14} color={colors.canvas} />}
                </View>
              </Pressable>
            </Pressable>
          );
        }}
      />
      <T variant="bodySm" color={colors.textDim} style={{ textAlign: 'center' }}>
        {t('Tap a person to message them · tick several to start a group')}
      </T>
    </View>
  );

  if (wide) {
    return (
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            height: '80%',
            maxHeight: 720,
            backgroundColor: colors.rail,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.hairline,
            padding: 24,
            cursor: 'auto',
          } as any}>
          {content}
        </Pressable>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, padding: 16 }}>
      {content}
    </SafeAreaView>
  );
}
