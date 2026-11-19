import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { t } from '@/lib/i18n';
import { markRemount } from '@/lib/settings-scroll';
import { colors, getAccent, getThemePreference, radius, setThemePreference, type ThemePreference } from '@/theme';
import { Icon, T, type IconName } from './ui';

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: IconName }[] = [
  { value: 'dark', label: 'Dark', hint: 'Deep slate, easy on the eyes', icon: 'moon' },
  { value: 'light', label: 'Light', hint: 'Bright and crisp', icon: 'sun' },
  { value: 'system', label: 'System', hint: 'Follows your device', icon: 'smartphone' },
];

// Fixed colors: each card previews its own theme, whatever theme is showing now.
const SWATCH = {
  dark: { canvas: '#0A0D14', card: '#141A26', line: '#20293D' },
  light: { canvas: '#F8FAFC', card: '#FFFFFF', line: '#E2E8F0' },
};

/** A tiny chat window drawn in one theme's colors. */
function Mini({ tone }: { tone: 'dark' | 'light' }) {
  const c = SWATCH[tone];
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas, padding: 8, gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {['#EF4444', '#F59E0B', '#10B981'].map((dot) => (
          <View key={dot} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dot }} />
        ))}
      </View>
      <View style={{ height: 7, width: '70%', borderRadius: 4, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }} />
      <View style={{ height: 7, width: '45%', borderRadius: 4, backgroundColor: getAccent(), alignSelf: 'flex-end' }} />
      <View style={{ height: 7, width: '58%', borderRadius: 4, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }} />
    </View>
  );
}

/** Dark / Light / System as preview cards (Stitch Settings). The app repaints right away. */
export function ThemePicker() {
  const [value, setValue] = useState(getThemePreference());
  // Phones: three cards share a narrow row, so the label stands alone (the amber edge marks the choice).
  const compact = useWindowDimensions().width < 520;
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={t(o.label)}
            accessibilityState={{ selected: active }}
            onPress={() => {
              setValue(o.value);
              markRemount();
              void setThemePreference(o.value);
              // The app root remounts to repaint; come back to Settings afterwards.
              setTimeout(() => router.navigate('/settings'), 0);
            }}
            style={({ hovered }: any) => ({
              flex: 1,
              flexBasis: 0,
              minWidth: 0,
              padding: 8,
              gap: 8,
              borderRadius: radius.lg,
              borderWidth: 1.5,
              borderColor: active ? colors.amber : hovered ? colors.surfaceHighest : colors.border,
              backgroundColor: active ? colors.amberTint : colors.canvas,
            })}>
            <View style={{ height: 64, borderRadius: radius.md, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: colors.border }}>
              {o.value === 'system' ? (
                <>
                  <Mini tone="dark" />
                  <Mini tone="light" />
                </>
              ) : (
                <Mini tone={o.value} />
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
              {!compact && <Icon name={o.icon} size={14} color={active ? colors.amberText : colors.textMuted} />}
              <T variant="labelLg" color={active ? colors.amberText : colors.text} numberOfLines={1} style={{ flex: 1 }}>
                {t(o.label)}
              </T>
              {active && !compact && <Icon name="check-circle" size={15} color={colors.amberText} />}
            </View>
            {!compact && (
              <T variant="bodySm" color={colors.textMuted} numberOfLines={2} style={{ paddingHorizontal: 2, marginTop: -4 }}>
                {t(o.hint)}
              </T>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
