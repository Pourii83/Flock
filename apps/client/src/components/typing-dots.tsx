import { useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';

import { colors } from '@/theme';

/**
 * Three dots that grow and fade in turn, so a line reads as someone writing (or a call ringing)
 * instead of a still picture.
 */
export function TypingDots({ color = colors.amber, size = 6 }: { color?: string; size?: number }) {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    // The browser has no native driver; RN Web animates these values itself.
    const driver = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.stagger(
        150,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: driver }),
            Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: driver }),
            Animated.delay(300),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: size }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) }],
          }}
        />
      ))}
    </View>
  );
}
