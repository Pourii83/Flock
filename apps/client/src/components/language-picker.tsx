import { Pressable, View } from 'react-native';

import { LANGUAGES, setLang, useLang } from '@/lib/i18n';
import { colors, radius } from '@/theme';
import { Icon, T } from './ui';

/** Segmented English / فارسی switch. Changing it re-renders the app in the new language and direction. */
export function LanguagePicker({ compact }: { compact?: boolean }) {
  const lang = useLang();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
        alignSelf: compact ? 'center' : 'stretch',
      }}>
      {compact && (
        <View style={{ paddingHorizontal: 8 }}>
          <Icon name="globe" size={15} color={colors.textMuted} />
        </View>
      )}
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <Pressable
            key={l.code}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => setLang(l.code)}
            style={({ hovered }: any) => ({
              flex: compact ? undefined : 1,
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: compact ? 6 : 10,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.amber : hovered ? colors.surfaceHigh : 'transparent',
            })}>
            {/* Each label in its own script/font so both are always readable. */}
            <T
              variant="labelLg"
              color={active ? colors.onAmber : colors.text}
              style={{ fontFamily: l.code === 'fa' ? 'Vazirmatn_600SemiBold' : 'Inter_600SemiBold', letterSpacing: 0 }}>
              {l.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
