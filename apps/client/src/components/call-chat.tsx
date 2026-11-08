import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Platform, Pressable, TextInput, View, type FlatList as FlatListType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { clock } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useCalls } from '@/state/calls';
import { colors, fonts, radius } from '@/theme';
import { LinkedText } from './linked-text';
import { Icon, IconButton, noOutline, persianFont, T } from './ui';

/**
 * Height of the on-screen keyboard on phones (0 elsewhere). The call overlay floats above the
 * app's screens, so no KeyboardAvoidingView wraps it; and Android edge-to-edge windows report
 * the IME without resizing, so the panel lifts itself explicitly.
 */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Temporary chat for the current call. Messages travel over the call's signaling channel,
 * are never stored, and disappear when the call ends.
 */
export function CallChatPanel({ onClose }: { onClose: () => void }) {
  const { call, sendChat, readChat } = useCalls();
  const wide = useIsWide();
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const listRef = useRef<FlatListType<(typeof call.chat)[number]>>(null);

  // While the panel is open, everything is read; keep the newest message in view.
  useEffect(() => {
    if (call.chatUnread) readChat();
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [call.chat.length, call.chatUnread, readChat, keyboard]);

  const send = () => {
    if (!text.trim()) return;
    sendChat(text);
    setText('');
  };

  return (
    <View
      style={[
        {
          position: 'absolute',
          backgroundColor: colors.panel,
          borderColor: colors.hairline,
          borderWidth: 1,
          overflow: 'hidden',
          zIndex: 20,
          ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as object) : {}),
        },
        wide
          ? { top: 16, bottom: 16, end: 16, width: 340, borderRadius: radius.xl }
          : keyboard
            ? // Keyboard up: sit right above it and use the space that's left.
              // Android draws behind the navigation bar, and the reported keyboard height leaves it out.
              { start: 8, end: 8, bottom: keyboard + insets.bottom + 8, top: insets.top + 8, borderRadius: radius.xl }
            : { start: 8, end: 8, bottom: insets.bottom + 8, height: '58%', borderRadius: radius.xl },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
        <Icon name="message-square" size={18} color={colors.amberText} />
        <View style={{ flex: 1 }}>
          <T variant="labelLg">{t('Call chat')}</T>
          <T variant="bodySm" color={colors.textMuted}>
            {t('Messages disappear when the call ends.')}
          </T>
        </View>
        <IconButton name="x" label={t('Close')} onPress={onClose} size={34} iconSize={18} />
      </View>

      <FlatList
        ref={listRef}
        data={call.chat}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
              {t('No messages yet — say something!')}
            </T>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
            <View
              style={{
                maxWidth: '85%',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: item.mine ? colors.amberSoft : colors.surfaceHigh,
              }}>
              {!item.mine && !!item.author && (
                <T variant="labelSm" color={colors.amberText} numberOfLines={1}>
                  {item.author}
                </T>
              )}
              <LinkedText color={item.mine ? colors.onAmber : colors.text} linkColor={item.mine ? '#5A3A00' : colors.amberText} selectable>
                {item.text}
              </LinkedText>
            </View>
            <T variant="labelSm" color={colors.textDim} style={{ marginTop: 2, paddingHorizontal: 4 }}>
              {clock(item.at)}
            </T>
          </View>
        )}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('Write a message…')}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
          style={[
            {
              flex: 1,
              minWidth: 0,
              height: 42,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              color: colors.text,
              fontFamily: fonts.regular,
              fontSize: 15,
            },
            noOutline,
            persianFont(text || t('Write a message…'), { fontFamily: fonts.regular }),
          ]}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim()}
          accessibilityLabel={t('Send')}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: text.trim() ? colors.amber : colors.surfaceHigh,
          }}>
          <Icon name="send" size={17} color={text.trim() ? colors.canvas : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}
