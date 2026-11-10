import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { colors, radius } from '@/theme';
import { LanguagePicker } from './language-picker';
import { FlockMark, FlockTile } from './logo';
import { Icon, T, type IconName } from './ui';
import { t } from '@/lib/i18n';

const FEATURES: { icon: IconName; tone: 'accent' | 'teal'; title: string; body: string }[] = [
  {
    icon: 'lock',
    tone: 'accent',
    title: 'Private by design',
    body: 'Your conversations stay between you and the people you talk to.',
  },
  {
    icon: 'video',
    tone: 'teal',
    title: 'Instant video huddles',
    body: 'Jump from a chat into a crisp call with a single tap.',
  },
  {
    icon: 'monitor',
    tone: 'accent',
    title: 'Every device, in sync',
    body: 'Phone, web and desktop share one live inbox in real time.',
  },
];

/** Shared frame for login/register: centered mobile column or the desktop split hero. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const wide = useIsWide();

  const form = (
    <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: 24 }}>
      <LanguagePicker compact />
      {wide ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <T variant="headline" style={{ fontSize: 34, lineHeight: 42, textAlign: 'center' }}>
            {title}
          </T>
          <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
            {subtitle}
          </T>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <View>
            <View
              style={{
                position: 'absolute',
                left: -60,
                top: -60,
                width: 200,
                height: 200,
                borderRadius: 100,
                backgroundColor: colors.amber,
                opacity: 0.08,
              }}
            />
            <FlockTile size={88} glow />
          </View>
          <T variant="display" style={{ fontSize: 40, marginTop: 8 }}>
            {t('Flock')}
          </T>
          <T variant="bodyLg" color={colors.amberSoftText} style={{ opacity: 0.85 }}>
            {t('Stay together, wherever you are')}
          </T>
        </View>
      )}
      {children}
      <T variant="bodySm" color={colors.textDim} style={{ textAlign: 'center' }}>
        {t('Flock Desktop & Web · v{version}', { version: Constants.expoConfig?.version ?? '' })}
      </T>
    </View>
  );

  const scroll = (content: ReactNode) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (!wide) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <LinearGradient
          colors={[colors.amberTint, `${colors.canvas}00`]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }}
        />
        {scroll(form)}
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.canvas }}>
      <View style={{ flex: 1, padding: 64, justifyContent: 'space-between', overflow: 'hidden' }}>
        <LinearGradient
          colors={[colors.amberTint, `${colors.canvas}00`, colors.rail]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 } as any}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <FlockTile size={52} />
          <View>
            <T variant="headlineSm" style={{ fontSize: 24 }}>
              {t('Flock')}
            </T>
            <T variant="overline" color={colors.textMuted}>
              {t('WORKPLACE & FLUID SYNC')}
            </T>
          </View>
        </View>

        <View style={{ gap: 28, maxWidth: 620 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              alignSelf: 'flex-start',
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 6,
            }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online }} />
            <T variant="label" color={colors.amberText}>
              {t('FLOCK MESSENGER')}
            </T>
          </View>
          <View>
            <T variant="display" style={{ fontSize: 60, lineHeight: 66 }}>
              {t('Stay together,')}
            </T>
            <T variant="display" color={colors.amberText} style={{ fontSize: 60, lineHeight: 66 }}>
              {t('wherever you are.')}
            </T>
          </View>
          <T variant="bodyLg" color={colors.textMuted} style={{ fontSize: 18, lineHeight: 30 }}>
            {t(
              'Built for calm, focused conversations. Instant messages, live presence and one-tap video huddles with the people who matter.',
            )}
          </T>
          <View style={{ gap: 24, marginTop: 8 }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={{ flexDirection: 'row', gap: 18 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name={f.icon} color={f.tone === 'teal' ? colors.teal : colors.amber} size={20} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T variant="headlineSm">{t(f.title)}</T>
                  <T variant="body" color={colors.textMuted} style={{ fontSize: 15, lineHeight: 22 }}>
                    {t(f.body)}
                  </T>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.6 }}>
          <FlockMark size={20} />
          <T variant="bodySm" color={colors.textMuted}>
            {t('One codebase · Android · Web · Desktop')}
          </T>
        </View>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.rail }}>{scroll(form)}</View>
    </View>
  );
}

export function AuthCard({ badge, children }: { badge: string; children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
        padding: 24,
        gap: 20,
        shadowColor: '#000',
        shadowOpacity: 0.45,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 20 },
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.online }} />
          <T variant="overline" color={colors.text}>
            {badge}
          </T>
        </View>
        <View style={{ backgroundColor: colors.tealTint, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
          <T variant="label" color={colors.teal}>
            {t('Secure session')}
          </T>
        </View>
      </View>
      {children}
    </View>
  );
}
