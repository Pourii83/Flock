import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Platform, Pressable, TextInput, View, type FlatList as FlatListType, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { clock } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useCalls } from '@/state/calls';
import { appear, colors, fonts, radius } from '@/theme';
import { EmojiPicker } from './emoji-picker';
import { LinkedText } from './linked-text';
import { Icon, IconButton, noOutline, persianFont, PushPin, T, Tooltip } from './ui';

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
 *
 * On a wide screen the panel can be pinned: it then docks to the trailing edge and the call
 * stage reserves that width, so nothing sits underneath it.
 */
export function CallChatPanel({
  onClose,
  pinned = false,
  onTogglePin,
  dockWidth = 340,
}: {
  onClose: () => void;
  /** Pinned beside the call (wide screens only). */
  pinned?: boolean;
  /** Present on wide screens: shows the pin/unpin button in the header. */
  onTogglePin?: () => void;
  dockWidth?: number;
}) {
  const { call, sendChat, readChat, setChatOpen } = useCalls();
  const wide = useIsWide();
  const docked = wide && pinned;
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  // Where the caret is, so an emoji goes in there and not always at the end.
  const caret = useRef({ start: 0, end: 0 });
  const listRef = useRef<FlatListType<(typeof call.chat)[number]>>(null);

  // Tells the call that the panel is open: no notification sound for messages read on screen.
  useEffect(() => {
    setChatOpen(true);
    return () => setChatOpen(false);
  }, [setChatOpen]);

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
    caret.current = { start: 0, end: 0 };
  };

  // Emoji and copying in the call chat, like the main chat (user request).
  const insertEmoji = (emoji: string) => {
    const { start, end } = caret.current;
    const a = Math.min(start, text.length);
    const b = Math.min(Math.max(end, a), text.length);
    setText(text.slice(0, a) + emoji + text.slice(b));
    caret.current = { start: a + emoji.length, end: a + emoji.length };
    if (wide) inputRef.current?.focus();
  };
  /** Phones: the panel takes the keyboard's place, never both. */
  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      if (!wide) inputRef.current?.focus();
      return;
    }
    if (!wide) {
      inputRef.current?.blur();
      Keyboard.dismiss();
    }
    setEmojiOpen(true);
  };
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const copy = (id: string, body: string) => {
    Clipboard.setStringAsync(body)
      .then(() => {
        setCopiedId(id);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
      })
      .catch(() => {});
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
          ? docked
            ? { top: 0, end: 0, bottom: 0, width: dockWidth, borderRadius: 0, borderWidth: 0, borderStartWidth: 1 }
            : { top: 16, bottom: 16, end: 16, width: dockWidth, borderRadius: radius.xl }
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
        {onTogglePin && (
          <Tooltip label={pinned ? t('Unpin chat') : t('Pin chat')}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pinned ? t('Unpin chat') : t('Pin chat')}
              onPress={onTogglePin}
              style={({ pressed, hovered }: any) => ({
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pinned ? colors.amberTint : pressed || hovered ? colors.surfaceHigh : 'transparent',
              })}>
              <PushPin size={17} color={pinned ? colors.amberText : colors.textMuted} />
            </Pressable>
          </Tooltip>
        )}
        <Tooltip label={t('Close')}>
          <IconButton name="x" label={t('Close')} onPress={onClose} size={34} iconSize={18} />
        </Tooltip>
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
            {/* Long press (phone) or right click copies the message; on a desktop a copy button shows on hover. */}
            <Pressable
              onLongPress={() => copy(item.id, item.text)}
              delayLongPress={450}
              accessibilityHint={t('Copy text')}
              {...(Platform.OS === 'web'
                ? ({
                    onContextMenu: (e: { preventDefault: () => void }) => {
                      e.preventDefault();
                      copy(item.id, item.text);
                    },
                  } as object)
                : {})}
              style={{ maxWidth: '85%', flexDirection: item.mine ? 'row-reverse' : 'row', alignItems: 'center', gap: 4 }}>
              {({ hovered }: any) => (
                <>
                  <View
                    style={{
                      flexShrink: 1,
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
                    <LinkedText color={item.mine ? colors.onAmberSoft : colors.text} linkColor={item.mine ? colors.amberSoftLink : colors.amberText} selectable>
                      {item.text}
                    </LinkedText>
                  </View>
                  {Platform.OS === 'web' && wide && (
                    <View style={{ opacity: hovered ? 1 : 0, transition: 'opacity 140ms ease' } as object}>
                      <Tooltip label={t('Copy text')}>
                        <IconButton name="copy" label={t('Copy text')} onPress={() => copy(item.id, item.text)} size={28} iconSize={14} color={colors.textMuted} />
                      </Tooltip>
                    </View>
                  )}
                </>
              )}
            </Pressable>
            <T variant="labelSm" color={copiedId === item.id ? colors.amberText : colors.textDim} style={{ marginTop: 2, paddingHorizontal: 4 }}>
              {copiedId === item.id ? t('Copied') : clock(item.at)}
            </T>
          </View>
        )}
      />

      {emojiOpen && (
        <View {...appear} style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} maxHeight={wide ? 260 : 220} style={{ maxWidth: '100%' }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
        <Tooltip label={t('Emoji')}>
          <IconButton name="smile" label={t('Emoji')} onPress={toggleEmoji} size={42} iconSize={20} color={emojiOpen ? colors.amberText : colors.textMuted} />
        </Tooltip>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSelectionChange={(e) => {
            caret.current = e.nativeEvent.selection;
          }}
          onFocus={() => {
            // Phones: the keyboard takes the emoji panel's place.
            if (!wide) setEmojiOpen(false);
          }}
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
        <Tooltip label={t('Send')} side="bottom">
          <Pressable
            onPress={send}
            disabled={!text.trim()}
            accessibilityLabel={t('Send')}
            style={({ pressed, hovered }: any) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : 1 }],
              backgroundColor: text.trim() ? colors.amber : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
            })}>
            <Icon name="send" size={17} color={text.trim() ? colors.onAmber : colors.textMuted} />
          </Pressable>
        </Tooltip>
      </View>
    </View>
  );
}
