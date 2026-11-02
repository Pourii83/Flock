import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatList } from '@/components/chat-list';
import { ChatThread } from '@/components/chat-thread';
import { ContactPanel } from '@/components/contact-panel';
import { EmptyStage } from '@/components/empty-state';
import { ConnectionBanner, DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Icon } from '@/components/ui';
import { useIsWide, useShowDetailsPanel } from '@/hooks/use-layout';
import { useChat } from '@/state/chat-store';
import { colors } from '@/theme';

export default function ChatsScreen() {
  const wide = useIsWide();
  const roomForPanel = useShowDetailsPanel();
  const { c: selectedId } = useLocalSearchParams<{ c?: string }>();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const conversations = useChat((s) => s.conversations);
  const activeCount = conversations.filter((c) => c.unreadCount > 0).length;

  // Drop a stale selection (e.g. after signing in as someone else).
  const loaded = useChat((s) => s.loaded);
  useEffect(() => {
    if (wide && loaded && selectedId && !conversations.some((c) => c.id === selectedId)) router.setParams({ c: undefined });
  }, [wide, loaded, selectedId, conversations]);

  const newChat = () => router.push('/new-chat');

  if (!wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <MobileHeader />
        <ConnectionBanner />
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
          <PageTitle
            title="Chats"
            pill={activeCount ? `${activeCount} unread` : undefined}
            action={
              <Pressable
                accessibilityLabel="New chat"
                onPress={newChat}
                style={({ pressed }) => ({
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.amber,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                  shadowColor: colors.amber,
                  shadowOpacity: 0.45,
                  shadowRadius: 16,
                  elevation: 8,
                })}>
                <Icon name="plus" size={26} color={colors.onAmber} />
              </Pressable>
            }
          />
        </View>
        <ChatList variant="mobile" onOpen={(c) => router.push(`/chat/${c.id}`)} onNewChat={newChat} />
      </SafeAreaView>
    );
  }

  const selected = selectedId && conversations.some((c) => c.id === selectedId) ? selectedId : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 380, backgroundColor: colors.rail, borderRightWidth: 1, borderRightColor: colors.surfaceHigh }}>
          <ChatList variant="desktop" selectedId={selected} onOpen={(c) => router.setParams({ c: c.id })} onNewChat={newChat} />
        </View>
        {selected ? (
          <>
            <View style={{ flex: 1 }}>
              <ChatThread
                key={selected}
                conversationId={selected}
                variant="desktop"
                detailsOpen={detailsOpen && roomForPanel}
                onToggleDetails={roomForPanel ? () => setDetailsOpen((v) => !v) : undefined}
              />
            </View>
            {roomForPanel && detailsOpen && <ContactPanel conversationId={selected} onClose={() => setDetailsOpen(false)} />}
          </>
        ) : (
          <EmptyStage
            onNewChat={newChat}
            secondary={{ label: 'Find people', icon: 'users', onPress: () => router.navigate('/contacts') }}
          />
        )}
      </View>
    </View>
  );
}
