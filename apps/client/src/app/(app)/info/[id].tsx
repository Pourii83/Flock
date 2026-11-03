import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationInfo } from '@/components/contact-panel';
import { colors } from '@/theme';

/** Full-screen contact/group info (phones and narrow windows without the side panel). */
export default function InfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.rail }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <ConversationInfo conversationId={id} onClose={close} />
      </View>
    </SafeAreaView>
  );
}
