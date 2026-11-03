import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { getNoisePreference, setNoisePreference, strongNoiseSupported, type NoiseMode } from '@/lib/noise';
import { colors, radius } from '@/theme';
import { T } from './ui';

const OPTIONS: { mode: NoiseMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'standard', label: 'Standard' },
  { mode: 'strong', label: 'Strong (AI)' },
];

/** Default noise cancellation for calls (Settings). In a call, the dock button switches it live. */
export function NoisePicker() {
  const [mode, setMode] = useState(getNoisePreference());
  const options = OPTIONS.filter((o) => o.mode !== 'strong' || strongNoiseSupported());
  return (
    <View style={{ gap: 8 }}>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
        {options.map((o) => {
          const active = o.mode === mode;
          return (
            <Pressable
              key={o.mode}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setMode(o.mode);
                setNoisePreference(o.mode);
              }}
              style={({ hovered }: any) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.amber : hovered ? colors.surfaceHigh : 'transparent',
              })}>
              <T variant="labelLg" color={active ? colors.onAmber : colors.text}>
                {t(o.label)}
              </T>
            </Pressable>
          );
        })}
      </View>
      <T variant="bodySm" color={colors.textDim}>
        {t(
          mode === 'strong'
            ? 'Removes keyboard, fan and street noise with an on-device AI filter. Your audio never leaves the call.'
            : mode === 'standard'
              ? "Your device's built-in noise suppression."
              : 'Natural, unfiltered sound — best for music.',
        )}
      </T>
    </View>
  );
}
