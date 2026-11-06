import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { t } from '@/lib/i18n';
import { colors, radius } from '@/theme';
import { IconButton, T } from './ui';

/** Sheet used by New chat / New group / Add members: centered dialog on wide screens, full screen on phones. */
export function ModalFrame({
  title,
  subtitle,
  onClose,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  const wide = useIsWide();
  const content = (
    <View style={{ flex: 1, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onBack && <IconButton name="arrow-left" label={t('Back')} onPress={onBack} bg={colors.surface} />}
        <View style={{ flex: 1 }}>
          <T variant="headline" style={{ fontSize: 24, lineHeight: 30 }}>
            {title}
          </T>
          {!!subtitle && (
            <T variant="body" color={colors.textMuted}>
              {subtitle}
            </T>
          )}
        </View>
        <IconButton name="x" label={t('Close')} onPress={onClose} bg={colors.surface} />
      </View>
      {children}
    </View>
  );

  if (wide) {
    return (
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={
            {
              width: '100%',
              maxWidth: 520,
              height: '82%',
              maxHeight: 740,
              backgroundColor: colors.rail,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.hairline,
              padding: 24,
              cursor: 'auto',
            } as any
          }>
          {content}
        </Pressable>
      </Pressable>
    );
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, padding: 16 }}>{content}</SafeAreaView>;
}
