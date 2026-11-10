// Native has no hover: the control renders as-is (the web implementation lives in tooltip.web.tsx).
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function Tooltip({
  children,
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <>{children}</>;
}
