import { router, useLocalSearchParams } from 'expo-router';
import { SidebarPane } from '@/components/sidebar-pane';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatList } from '@/components/chat-list';
import { ChatThread } from '@/components/chat-thread';
import { ContactPanel } from '@/components/contact-panel';
import { EmptyStage } from '@/components/empty-state';
import { ConnectionBanner, DesktopTopBar, MobileHeader } from '@/components/shell';
import { useIsWide, useShowDetailsPanel } from '@/hooks/use-layout';
import { useChat } from '@/state/chat-store';
import { colors } from '@/theme';
import { t } from '@/lib/i18n';

export default function ChatsScreen() {
  const wide = useIsWide();
  const roomForPanel = useShowDetailsPanel();
  const { c: selectedId } = useLocalSearchParams<{ c?: string }>();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const conversations = useChat((s) => s.conversations);

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
        <ChatList variant="mobile" onOpen={(c) => router.push(`/chat/${c.id}`)} onNewChat={newChat} />
      </SafeAreaView>
    );
  }

  const selected = selectedId && conversations.some((c) => c.id === selectedId) ? selectedId : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SidebarPane>
          <ChatList variant="desktop" selectedId={selected} onOpen={(c) => router.setParams({ c: c.id })} onNewChat={newChat} />
        </SidebarPane>
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
            secondary={{ label: t('Find people'), icon: 'users', onPress: () => router.navigate('/contacts') }}
          />
        )}
      </View>
    </View>
  );
}
