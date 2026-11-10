// App-styled context menu used for message long-press/right-click and sidebar chat menus.
// Positions itself at the press point, clamped to the window, and closes on a scrim press.
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';

import { colors, radius } from '@/theme';
import { Icon, PushPin, T, type IconName } from './ui';
import { t } from '@/lib/i18n';

export type ContextMenuItem = {
  icon?: IconName;
  /** Use the pushpin glyph instead of a Feather icon. */
  pin?: boolean;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

// The menu shrinks to its content: the emoji row (6 emoji + the "+" picker) is the widest part.
// 7 × 28 px + 6 × 2 px gaps + padding = 224 px; the estimate is only used to clamp the position.
const MENU_ESTIMATE = 236;
const ROW_H = 44;

export function ContextMenu({
  point,
  items,
  emoji,
  onEmoji,
  onEmojiMore,
  onClose,
  title,
}: {
  /** Press point in window coordinates; null keeps the menu closed. */
  point: { x: number; y: number } | null;
  items: ContextMenuItem[];
  /** Quick-reaction row shown under the items (message menu). */
  emoji?: readonly string[];
  onEmoji?: (emoji: string) => void;
  onEmojiMore?: () => void;
  onClose: () => void;
  title?: string;
}) {
  const { width, height } = useWindowDimensions();
  if (!point) return null;

  const menuH = 10 + (title ? 28 : 0) + items.length * ROW_H + (emoji?.length ? 50 : 0);
  const x = Math.min(Math.max(8, point.x), Math.max(8, width - MENU_ESTIMATE - 8));
  const y = point.y + menuH + 8 > height ? Math.max(8, height - menuH - 8) : Math.max(8, point.y);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('Close')} />
        <View
          style={{
            position: 'absolute',
            left: x,
            top: y,
            minWidth: 190,
            backgroundColor: colors.panel,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            paddingVertical: 6,
            ...(shadow as object),
          }}>
          {!!title && (
            <T variant="labelSm" color={colors.textMuted} style={{ paddingHorizontal: 16, paddingVertical: 6 }} numberOfLines={1}>
              {title}
            </T>
          )}
          {items.map((item, index) => (
            <Pressable
              key={`${item.label}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              disabled={item.disabled}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ hovered, pressed }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                marginHorizontal: 4,
                height: ROW_H - 4,
                borderRadius: radius.md,
                backgroundColor: pressed ? colors.surfaceHighest : hovered ? colors.surfaceHigh : 'transparent',
                opacity: item.disabled ? 0.4 : 1,
              })}>
              {item.pin ? (
                <PushPin size={16} color={item.danger ? colors.danger : colors.textMuted} />
              ) : item.icon ? (
                <Icon name={item.icon} size={16} color={item.danger ? colors.danger : colors.textMuted} />
              ) : (
                <View style={{ width: 16 }} />
              )}
              <T variant="body" color={item.danger ? colors.danger : colors.text} style={{ fontSize: 14 }}>
                {item.label}
              </T>
            </Pressable>
          ))}
          {!!emoji?.length && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                marginTop: 4,
                paddingTop: 8,
                paddingHorizontal: 8,
                borderTopWidth: 1,
                borderTopColor: colors.hairline,
              }}>
              {emoji.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={e}
                  onPress={() => {
                    onClose();
                    onEmoji?.(e);
                  }}
                  style={({ hovered, pressed }: any) => ({
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.surfaceHighest : hovered ? colors.surfaceHigh : 'transparent',
                  })}>
                  <T style={{ fontSize: 18 }}>{e}</T>
                </Pressable>
              ))}
              {!!onEmojiMore && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('More emojis')}
                  onPress={onEmojiMore}
                  style={({ hovered }: any) => ({
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
                    borderWidth: 1,
                    borderColor: colors.surfaceHigh,
                  })}>
                  <Icon name="plus" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16 };
