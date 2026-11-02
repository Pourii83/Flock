import { useWindowDimensions } from 'react-native';

import { WIDE_BREAKPOINT } from '@/theme';

/** Desktop/web 3-column layout vs. single-pane phone layout. */
export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}

/** Room for the right-hand contact panel next to the thread. */
export function useShowDetailsPanel() {
  const { width } = useWindowDimensions();
  return width >= 1280;
}
