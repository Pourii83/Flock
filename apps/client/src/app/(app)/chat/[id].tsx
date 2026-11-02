import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { ChatThread } from '@/components/chat-thread';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { chatStore, useConversation } from '@/state/chat-store';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useIsWide();
  const conversation = useConversation(id);

  // Deep link to a conversation that isn't in the list yet.
  useEffect(() => {
    if (!conversation && id) api.conversation(id).then((c) => chatStore.upsertConversation(c), () => router.replace('/'));
  }, [conversation, id]);

  // On wide screens the thread lives inside the 3-column chats tab.
  if (wide) return <Redirect href={{ pathname: '/', params: { c: id } }} />;

  return <ChatThread key={id} conversationId={id} variant="mobile" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
