import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, getThemePreference, radius, setThemePreference, type ThemePreference } from '@/theme';
import { Icon, T, type IconName } from './ui';

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'smartphone' },
];

/** Dark / Light / System switch (Settings). The app repaints right away. */
export function ThemePicker() {
  const [value, setValue] = useState(getThemePreference());
  // On phones the icon sits above the label: side by side, a wrapped label pushed it to the corner.
  const stacked = useWindowDimensions().width < 520;
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: stacked ? 26 : radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => {
              setValue(o.value);
              void setThemePreference(o.value);
              // The app root remounts to repaint; come back to Settings afterwards.
              setTimeout(() => router.navigate('/settings'), 0);
            }}
            style={({ hovered }: any) => ({
              flex: 1,
              flexBasis: 0,
              minWidth: 0,
              paddingHorizontal: 6,
              flexDirection: stacked ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: stacked ? 4 : 8,
              paddingVertical: stacked ? 8 : 10,
              borderRadius: stacked ? 22 : radius.pill,
              backgroundColor: active ? colors.amber : hovered ? colors.surfaceHigh : 'transparent',
            })}>
            <Icon name={o.icon} size={16} color={active ? colors.onAmber : colors.textMuted} />
            <T variant="labelLg" color={active ? colors.onAmber : colors.text} numberOfLines={2} style={{ flexShrink: 1, textAlign: 'center', fontSize: 14, lineHeight: 19 }}>
              {t(o.label)}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
