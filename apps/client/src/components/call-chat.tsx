import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View, type FlatList as FlatListType } from 'react-native';

import { useIsWide } from '@/hooks/use-layout';
import { clock } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useCalls } from '@/state/calls';
import { colors, fonts, radius } from '@/theme';
import { Icon, IconButton, noOutline, T } from './ui';

/**
 * Temporary chat for the current call. Messages travel over the call's signaling channel,
 * are never stored, and disappear when the call ends.
 */
export function CallChatPanel({ onClose }: { onClose: () => void }) {
  const { call, sendChat, readChat } = useCalls();
  const wide = useIsWide();
  const [text, setText] = useState('');
  const listRef = useRef<FlatListType<(typeof call.chat)[number]>>(null);

  // While the panel is open, everything is read; keep the newest message in view.
  useEffect(() => {
    if (call.chatUnread) readChat();
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [call.chat.length, call.chatUnread, readChat]);

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
          backgroundColor: 'rgba(18, 23, 33, 0.94)',
          borderColor: colors.hairline,
          borderWidth: 1,
          overflow: 'hidden',
          zIndex: 20,
          ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as object) : {}),
        },
        wide
          ? { top: 16, bottom: 16, end: 16, width: 340, borderRadius: radius.xl }
          : { start: 8, end: 8, bottom: 8, height: '58%', borderRadius: radius.xl },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
        <Icon name="message-square" size={18} color={colors.amber} />
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
              <T variant="body" color={item.mine ? colors.onAmber : colors.text} selectable>
                {item.text}
              </T>
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
