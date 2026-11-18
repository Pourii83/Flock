import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { getAppName } from '@/lib/brand';
import { colors } from '@/theme';

const MARK = require('@/assets/images/flock-mark.png');

/** The app mark: three white birds flying together. `tint` recolors it (e.g. the text color, so it shows on a light theme). */
export function FlockMark({ size = 32, tint }: { size?: number; tint?: string }) {
  return <Image source={MARK} style={{ width: size, height: size }} contentFit="contain" tintColor={tint} accessibilityLabel={getAppName()} />;
}

/** Mark inside the dark rounded tile, optionally with the ambient accent glow. */
export function FlockTile({ size = 56, glow, style }: { size?: number; glow?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: '#0B0B0B',
          borderWidth: 1,
          borderColor: colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
        },
        glow && {
          shadowColor: colors.amber,
          shadowOpacity: 0.35,
          shadowRadius: size * 0.6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 12,
        },
        style,
      ]}>
      <FlockMark size={size * 0.72} />
    </View>
  );
}
