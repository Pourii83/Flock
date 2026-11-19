import { router, useFocusEffect } from 'expo-router';
import { SidebarPane } from '@/components/sidebar-pane';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyStage } from '@/components/empty-state';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Icon, IconButton, SearchBar, SectionLabel, T, Tooltip, type IconName } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { lastSeenLabel } from '@/lib/format';
import type { User } from '@/lib/types';
import { useCalls } from '@/state/calls';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { t, num } from '@/lib/i18n';

/** Opens (or creates) the DM with a user and returns the conversation. */
async function directWith(user: User) {
  const c = await api.createConversation([user.id]);
  chatStore.upsertConversation(c);
  return c;
}

function PersonRow({ user, wide }: { user: User; wide: boolean }) {
  const { startCall } = useCalls();
  // Presence for people we already chat with comes live from the store.
  const live = useChat((s) => {
    for (const c of s.conversations) {
      const m = c.members.find((x) => x.id === user.id);
      if (m) return m;
    }
    return undefined;
  });
  const person = live ?? user;
  const message = async () => {
    const c = await directWith(user);
    if (wide) router.navigate({ pathname: '/', params: { c: c.id } });
    else router.push(`/chat/${c.id}`);
  };
  const call = async (video: boolean) => startCall(await directWith(user), video);

  // A narrow row keeps the name readable: the buttons move into a bar that a tap opens.
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);
  const compact = width > 0 && width < COMPACT_BELOW;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ borderRadius: radius.lg, backgroundColor: compact && open ? colors.surface : 'transparent', borderWidth: 1, borderColor: compact && open ? colors.border : 'transparent' }}>
      <Pressable
        onPress={compact ? () => setOpen((o) => !o) : message}
        // Only the compact row is a button: the wide one holds its own buttons (no button inside a button).
        {...(compact ? { accessibilityRole: 'button' as const, accessibilityLabel: person.displayName, accessibilityState: { expanded: open } } : {})}
        style={({ hovered }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: hovered && !(compact && open) ? colors.surface : 'transparent',
        })}>
        <Avatar user={person} size={compact ? 44 : 50} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T variant="labelLg" style={{ fontSize: 16 }} numberOfLines={1}>
            {person.displayName}
          </T>
          <T variant="body" color={person.online ? colors.teal : colors.textMuted} numberOfLines={1}>
            {person.title ? `${person.title} · ` : `@${person.username} · `}
            {lastSeenLabel(person.online, person.lastSeen)}
          </T>
        </View>
        {compact ? (
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        ) : (
          <>
            <Tooltip label={t('Message')} style={{ alignSelf: 'center' }}>
              <IconButton name="message-square" label={t('Message')} onPress={message} bg={colors.surface} />
            </Tooltip>
            <Tooltip label={t('Voice call')} style={{ alignSelf: 'center' }}>
              <IconButton name="phone" label={t('Voice call')} onPress={() => call(false)} bg={colors.surface} color={colors.teal} />
            </Tooltip>
            <Tooltip label={t('Video call')} style={{ alignSelf: 'center' }}>
              <IconButton name="video" label={t('Video call')} onPress={() => call(true)} bg={colors.surface} color={colors.amberText} />
            </Tooltip>
          </>
        )}
      </Pressable>
      {compact && open && (
        // Message on its own line, the two calls side by side under it, so no label gets cut.
        <View style={{ gap: 6, paddingHorizontal: 10, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <RowAction icon="message-square" label={t('Message')} color={colors.text} onPress={message} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <RowAction icon="phone" label={t('Voice')} color={colors.teal} onPress={() => call(false)} />
            <RowAction icon="video" label={t('Video')} color={colors.amberText} onPress={() => call(true)} />
          </View>
        </View>
      )}
    </View>
  );
}

/** Rows narrower than this show the name in full and keep their buttons behind a tap. */
const COMPACT_BELOW = 380;

/** One of the actions a tap on a narrow contact row reveals. */
function RowAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        // Room inside the edges so a long label ("Message") never pushes the icon against the side.
        paddingHorizontal: 10,
        minWidth: 0,
        borderRadius: radius.md + 2,
        backgroundColor: pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
      })}>
      <Icon name={icon} size={16} color={color} />
      <T variant="label" color={colors.text} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}

function PeopleList({ wide }: { wide: boolean }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<User[] | null>(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => setReload((n) => n + 1), []));

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api.contacts(query.trim()).then(
        (list) => !cancelled && setPeople(list),
        () => !cancelled && setPeople([]),
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, reload]);

  const online = people?.filter((p) => p.online) ?? [];
  const rest = people?.filter((p) => !p.online) ?? [];
  const sections: (User | string)[] = [
    ...(online.length ? [t('Online — {n}', { n: num(online.length) }), ...online] : []),
    ...(rest.length ? [t('Contacts — {n}', { n: num(rest.length) }), ...rest] : []),
  ];

  return (
    <FlatList
      data={sections}
      keyExtractor={(item) => (typeof item === 'string' ? item : item.id)}
      contentContainerStyle={{ padding: 16, gap: 2, paddingBottom: 24 }}
      ListHeaderComponent={
        <SearchBar value={query} onChangeText={setQuery} placeholder={t('Search people by name or @username')} style={{ marginBottom: 16 }} />
      }
      renderItem={({ item }) =>
        typeof item === 'string' ? (
          <View style={{ paddingTop: 12, paddingBottom: 6 }}>
            <SectionLabel>{item}</SectionLabel>
          </View>
        ) : (
          <PersonRow user={item} wide={wide} />
        )
      }
      ListEmptyComponent={
        people === null ? (
          <ActivityIndicator color={colors.amberText} />
        ) : (
          <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 24 }}>
            {query ? t('Nobody found.') : t('People you chat or call with show up here. Start a new chat to find someone.')}
          </T>
        )
      }
    />
  );
}

export default function ContactsScreen() {
  const wide = useIsWide();

  if (!wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <MobileHeader />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <PageTitle title={t('Contacts')} />
        </View>
        <PeopleList wide={false} />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SidebarPane>
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <PageTitle title={t('Contacts')} />
          </View>
          <PeopleList wide />
        </SidebarPane>
        <EmptyStage
          title={t('Your flock, all in one place')}
          body={t('People you chat or call with show up here. Message them, or jump straight into a voice or video call.')}
          onNewChat={() => router.push('/new-chat')}
        />
      </View>
    </View>
  );
}
