import { useState, type ReactNode } from 'react';
import { PanResponder, Platform, View } from 'react-native';

import { isRTL } from '@/lib/i18n';
import { getSidebarWidth, setSidebarWidth, SIDEBAR_MAX, SIDEBAR_MIN, useSidebarWidth } from '@/lib/sidebar-width';
import { colors } from '@/theme';

/**
 * The desktop list column. Its width is shared by Chats, Calls and Contacts and can be dragged from
 * the edge facing the content, between SIDEBAR_MIN and SIDEBAR_MAX.
 */
export function SidebarPane({ children }: { children: ReactNode }) {
  const width = useSidebarWidth();
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const [drag] = useState(() => {
    let startWidth = getSidebarWidth();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startWidth = getSidebarWidth();
        setActive(true);
      },
      // The column sits on the right in Persian, so dragging left grows it there.
      onPanResponderMove: (_event, gesture) => setSidebarWidth(startWidth + (isRTL() ? -gesture.dx : gesture.dx)),
      onPanResponderRelease: (_event, gesture) => {
        setSidebarWidth(startWidth + (isRTL() ? -gesture.dx : gesture.dx), true);
        setActive(false);
      },
      onPanResponderTerminate: () => {
        setSidebarWidth(getSidebarWidth(), true);
        setActive(false);
      },
    });
  });

  const web = Platform.OS === 'web';
  return (
    <View style={{ width, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX, backgroundColor: colors.rail, borderRightWidth: 1, borderRightColor: colors.surfaceHigh }}>
      {children}
      <View
        {...drag.panHandlers}
        {...(web ? ({ onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } as object) : {})}
        accessibilityRole="adjustable"
        accessibilityLabel="Resize list"
        style={[
          { position: 'absolute', top: 0, bottom: 0, end: -5, width: 10, alignItems: 'center', zIndex: 5 },
          web ? ({ cursor: 'col-resize', touchAction: 'none', userSelect: 'none' } as object) : null,
        ]}>
        <View style={{ width: 2, height: '100%', backgroundColor: active || hover ? colors.amber : 'transparent', opacity: active ? 1 : 0.6 }} />
      </View>
    </View>
  );
}
