import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { User } from '@/lib/types';
import { colors, radius } from '@/theme';
import { Avatar } from './avatar';
import { Icon, SearchBar, T } from './ui';

/** Searches people on this server (debounced), leaving out `excludeIds`. */
export function usePeople(query: string, excludeIds: string[] = []) {
  const [people, setPeople] = useState<User[] | null>(null);
  const exclude = excludeIds.join(',');
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.users(query.trim()).then(
        (list) => !cancelled && setPeople(list.filter((u) => !exclude.split(',').includes(u.id))),
        () => !cancelled && setPeople([]),
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, exclude]);
  return people;
}

export function PersonRow({
  user,
  onPress,
  selected,
  trailing,
}: {
  user: User;
  onPress: () => void;
  selected?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={user.displayName}
      style={({ hovered, pressed }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 12,
        borderRadius: radius.lg,
        backgroundColor: selected || pressed ? colors.surface : hovered ? 'rgba(22,29,42,0.6)' : 'transparent',
      })}>
      <Avatar user={user} size={46} />
      <View style={{ flex: 1 }}>
        <T variant="labelLg" style={{ fontSize: 16 }} numberOfLines={1}>
          {user.displayName}
        </T>
        <T variant="body" color={colors.textMuted} numberOfLines={1}>
          @{user.username}
          {user.title ? ` · ${user.title}` : ''}
        </T>
      </View>
      {selected !== undefined && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: selected ? colors.amber : colors.surfaceHighest,
            backgroundColor: selected ? colors.amber : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {selected && <Icon name="check" size={14} color={colors.canvas} />}
        </View>
      )}
      {trailing}
    </Pressable>
  );
}

/** Multi-select people list with search and removable chips of the current selection. */
export function MemberPicker({
  selected,
  onChange,
  excludeIds,
}: {
  selected: User[];
  onChange: (users: User[]) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState('');
  const people = usePeople(query, excludeIds);
  const toggle = (u: User) =>
    onChange(selected.some((x) => x.id === u.id) ? selected.filter((x) => x.id !== u.id) : [...selected, u]);

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('Search people by name or @username')} autoFocus />
      {selected.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {selected.map((u) => (
            <Pressable
              key={u.id}
              onPress={() => toggle(u)}
              accessibilityLabel={t('Remove {name}', { name: u.displayName })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.amberTint, borderRadius: radius.pill, paddingStart: 4, paddingEnd: 10, paddingVertical: 4 }}>
              <Avatar user={u} size={24} showPresence={false} />
              <T variant="label" color={colors.amber}>
                {u.displayName}
              </T>
              <Icon name="x" size={12} color={colors.amber} />
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={people ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ gap: 4, paddingBottom: 12 }}
        ListEmptyComponent={
          people === null ? (
            <ActivityIndicator color={colors.amber} style={{ marginTop: 24 }} />
          ) : (
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 24 }}>
              {query ? t('Nobody found with that name.') : t('No one else to add yet.')}
            </T>
          )
        }
        renderItem={({ item }) => <PersonRow user={item} selected={selected.some((x) => x.id === item.id)} onPress={() => toggle(item)} />}
      />
    </View>
  );
}
