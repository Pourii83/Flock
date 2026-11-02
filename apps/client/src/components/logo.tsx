import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '@/theme';

/** The Flock mark: white and amber chevron birds flying together. */
export function FlockMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFD08A" />
          <Stop offset="1" stopColor={colors.amber} />
        </LinearGradient>
      </Defs>
      <Path d="M8 40 L22 28 L36 40" stroke="url(#amber)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M28 30 L40 19 L52 30" stroke={colors.text} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M34 47 L44 38 L54 47" stroke={colors.text} strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Mark inside the dark rounded tile, optionally with the ambient amber glow. */
export function FlockTile({ size = 56, glow, style }: { size?: number; glow?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: colors.canvas,
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
      <FlockMark size={size * 0.62} />
    </View>
  );
}

