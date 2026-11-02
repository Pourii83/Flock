import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyStage } from '@/components/empty-state';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Icon, SectionLabel, T } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { dayAndTime, duration } from '@/lib/format';
import type { CallLog } from '@/lib/types';
import { useCalls } from '@/state/calls';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { t } from '@/lib/i18n';

function useCallLog() {
  const { historyVersion } = useCalls();
  const [calls, setCalls] = useState<CallLog[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setCalls(await api.calls());
    } catch {
      setCalls((c) => c ?? []);
    }
  }, []);
  // Reload when the tab gains focus and whenever a call just finished.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (!historyVersion) return;
    let cancelled = false;
    api.calls().then((list) => !cancelled && setCalls(list), () => {});
    return () => {
      cancelled = true;
    };
  }, [historyVersion]);
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  return { calls, refreshing, refresh };
}

function Segmented({ value, onChange, total, missed }: { value: 'all' | 'missed'; onChange: (v: 'all' | 'missed') => void; total: number; missed: number }) {
  const seg = (key: 'all' | 'missed', label: string, badge: React.ReactNode) => (
    <Pressable
      onPress={() => onChange(key)}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 12,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: value === key ? colors.surfaceHigh : 'transparent',
      }}>
      <T variant="labelLg" style={{ fontSize: 16 }}>
        {label}
      </T>
      {badge}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 5 }}>
      {seg('all', t('All Calls'), <T variant="labelLg" color={colors.textMuted}>{total}</T>)}
      {seg(
        'missed',
        t('Missed'),
        missed > 0 && (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.dangerDeep, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <T variant="label" color="#FFDAD6">
              {missed}
            </T>
          </View>
        ),
      )}
    </View>
  );
}

function FlockRoomCard() {
  const conversations = useChat((s) => s.conversations);
  const { startCall } = useCalls();
  const latest = conversations[0];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
      }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="share-2" size={22} color={colors.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="labelLg" style={{ fontSize: 17 }}>
          {t('Start Flock Room')}
        </T>
        <T variant="body" color={colors.textMuted} numberOfLines={1}>
          {latest ? t('Instant huddle with {name}', { name: latest.name }) : t('Start a chat first to call someone')}
        </T>
      </View>
      <Pressable
        disabled={!latest}
        onPress={() => latest && startCall(latest, false)}
        accessibilityLabel={t('Voice huddle')}
        style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', opacity: latest ? 1 : 0.4 }}>
        <Icon name="mic" size={20} color={colors.text} />
      </Pressable>
      <Pressable
        disabled={!latest}
        onPress={() => latest && startCall(latest, true)}
        accessibilityLabel={t('Video huddle')}
        style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', opacity: latest ? 1 : 0.4 }}>
        <Icon name="video" size={22} color={colors.onAmber} />
      </Pressable>
    </View>
  );
}

function CallRow({ log }: { log: CallLog }) {
  const { startCall } = useCalls();
  const conversation = useChat((s) => s.conversations.find((c) => c.id === log.conversationId));
  const directionIcon = log.missed ? 'phone-missed' : log.direction === 'outgoing' ? 'arrow-up-right' : 'arrow-down-left';
  const directionColor = log.missed ? colors.danger : log.direction === 'outgoing' ? colors.teal : colors.teal;
  const detail = log.durationSec ? duration(log.durationSec) : log.video ? t('Video call') : t('Audio');
  const callBack = () => conversation && startCall(conversation, log.video);

  return (
    <Pressable
      onPress={() => conversation && router.navigate(`/chat/${conversation.id}`)}
      style={({ hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: radius.lg,
        backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
      })}>
      {log.conversationType === 'group' ? (
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="users" size={22} color={colors.text} />
        </View>
      ) : (
        <Avatar user={log.peer} size={52} ringBg={colors.surface} />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="labelLg" color={log.missed ? '#FF8A80' : colors.text} style={{ fontSize: 17, flexShrink: 1 }} numberOfLines={1}>
            {log.title}
          </T>
          {log.missed && (
            <View style={{ backgroundColor: colors.dangerDeep, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
              <T variant="label" color="#FFDAD6">
                {t('Missed')}
              </T>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={directionIcon} size={15} color={directionColor} />
          <T variant="body" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {dayAndTime(log.startedAt)} •{' '}
            <T variant="body" color={colors.text} style={{ fontVariant: ['tabular-nums'] }}>
              {detail}
            </T>
          </T>
        </View>
      </View>
      <Pressable
        onPress={callBack}
        accessibilityLabel={t('Call back')}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: log.missed ? colors.dangerDeep : colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={log.video ? 'video' : 'phone'} size={20} color={log.missed ? '#FF8A80' : log.video ? colors.amber : colors.teal} />
      </Pressable>
    </Pressable>
  );
}

function CallsList() {
  const { calls, refreshing, refresh } = useCallLog();
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const missed = calls?.filter((c) => c.missed) ?? [];
  const data = filter === 'missed' ? missed : (calls ?? []);

  return (
    <FlatList
      data={data}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.amber} />}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
      ListHeaderComponent={
        <View style={{ gap: 18, marginBottom: 6 }}>
          <Segmented value={filter} onChange={setFilter} total={calls?.length ?? 0} missed={missed.length} />
          <FlockRoomCard />
          <SectionLabel right={<T variant="label" color={colors.textMuted}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</T>}>
            {t('Recent activity')}
          </SectionLabel>
        </View>
      }
      renderItem={({ item }) => <CallRow log={item} />}
      ListEmptyComponent={
        calls === null ? (
          <ActivityIndicator color={colors.amber} />
        ) : (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
            <Icon name="phone" size={28} color={colors.textDim} />
            <T variant="body" color={colors.textMuted}>
              {filter === 'missed' ? t('No missed calls 🎉') : t('No calls yet. Start one from any chat.')}
            </T>
          </View>
        )
      }
      ListFooterComponent={
        data.length > 0 ? (
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 20 }}>
            <View style={{ width: 52, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh }} />
            <T variant="body" color={colors.textMuted}>
              {t('End of recent history')}
            </T>
          </View>
        ) : undefined
      }
    />
  );
}

export default function CallsScreen() {
  const wide = useIsWide();
  const connected = useChat((s) => s.connected);

  if (!wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <MobileHeader />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <PageTitle
            title={t('Calls')}
            pill={connected ? t('Synced') : t('Offline')}
            pillColor={connected ? colors.teal : colors.amber}
            action={<Button title={t('New Call')} icon="phone-call" size="sm" onPress={() => router.push('/new-chat')} />}
          />
        </View>
        <CallsList />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 440, backgroundColor: colors.rail, borderRightWidth: 1, borderRightColor: colors.surfaceHigh }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <PageTitle title={t('Calls')} pill={connected ? t('Synced') : t('Offline')} pillColor={connected ? colors.teal : colors.amber} />
          </View>
          <CallsList />
        </View>
        <EmptyStage
          title={t('Huddle up in one tap')}
          body="Start a crisp voice or video call from any conversation. Calls connect peer-to-peer over WebRTC."
          onNewChat={() => router.push('/new-chat')}
          secondary={{
            label: t('Open chats'),
            icon: 'message-square',
            onPress: () => {
              chatStore.refreshConversations();
              router.navigate('/');
            },
          }}
        />
      </View>
    </View>
  );
}
