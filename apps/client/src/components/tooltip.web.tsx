// Hover tooltip for web/desktop. Native renders the child unchanged (see tooltip.tsx).
// The bubble is plain RN views so it inherits the app's tokens; it is positioned above the
// wrapped control and hidden on press, scroll or unmount.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

export function Tooltip({
  label,
  children,
  side = 'top',
  delay = 350,
  style,
}: {
  label: string;
  children: ReactNode;
  /** Where the label appears relative to the control. */
  side?: 'top' | 'bottom';
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    if (!label) return;
    clear();
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };
  useEffect(() => () => clear(), []);
  // A pressed control opens its panel/menu; the label must not stay on top of it.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open]);

  return (
    <View
      style={[{ alignSelf: 'flex-start' }, style]}
      {...({ onMouseEnter: show, onMouseLeave: hide, onPointerDown: hide } as object)}>
      {children}
      {open && !!label && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            // Fixed width centered on the control: the wrapper itself is only as wide as the
            // control, which would otherwise clamp the label to a narrow column and wrap it.
            left: '50%',
            marginLeft: -130,
            width: 260,
            alignItems: 'center',
            zIndex: 2000,
            ...(side === 'top' ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
          }}>
          <View
            style={{
              maxWidth: 260,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.surfaceHigh,
              borderRadius: radius.md,
              paddingHorizontal: 10,
              paddingVertical: 5,
              ...(styles.shadow as object),
            }}>
            <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 }}>
              {label}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = {
  shadow: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
};
