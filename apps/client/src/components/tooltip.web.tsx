// Hover tooltip for web/desktop. Native renders the child unchanged (see tooltip.tsx).
// The bubble is plain RN views so it inherits the app's tokens. It is drawn in a portal on the
// page itself (fixed to the control's position), so neighbouring content such as the next message
// bubble can never cover it; it hides on press, scroll or unmount.
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
// @ts-expect-error react-dom ships without type declarations in this app (it is only used on the web).
import { createPortal as portal } from 'react-dom';
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
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const createPortal = portal as (node: ReactNode, container: Element) => ReactNode;
  const [rect, setRect] = useState<{ x: number; top: number; bottom: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    if (!label) return;
    clear();
    timer.current = setTimeout(() => {
      const node = anchor.current as unknown as HTMLElement | null;
      const box = node?.getBoundingClientRect?.();
      if (!box) return;
      setRect({ x: box.left + box.width / 2, top: box.top, bottom: box.bottom });
      setOpen(true);
    }, delay);
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
      ref={anchor}
      style={[{ alignSelf: 'flex-start' }, style]}
      {...({ onMouseEnter: show, onMouseLeave: hide, onPointerDown: hide } as object)}>
      {children}
      {open && !!label && !!rect && typeof document !== 'undefined' && createPortal(
        <View
          pointerEvents="none"
          style={{
            position: 'fixed' as 'absolute',
            // A fixed-width row centered on the control, kept inside the window.
            left: Math.max(4, Math.min(rect.x - 130, window.innerWidth - 264)),
            width: 260,
            alignItems: rect.x - 130 < 4 ? 'flex-start' : rect.x + 130 > window.innerWidth - 4 ? 'flex-end' : 'center',
            zIndex: 100000,
            ...(side === 'top' ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
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
        </View>,
        document.body,
      )}
    </View>
  );
}

const styles = {
  shadow: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
};
