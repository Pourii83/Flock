import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, radius } from '@/theme';
import { FlockTile } from './logo';
import { Button, Icon, T, type IconName } from './ui';
import { t } from '@/lib/i18n';

/** Desktop "Select a conversation" stage. */
export function EmptyStage({
  title = t('Select a conversation to start chatting'),
  body = t('Send messages in real time, start instant Flock video huddles, or catch up with your teams.'),
  onNewChat,
  secondary,
}: {
  title?: string;
  body?: string;
  onNewChat?: () => void;
  secondary?: { label: string; icon: IconName; onPress: () => void };
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' }}>
      <Svg width={1000} height={1000} style={{ position: 'absolute' }} pointerEvents="none">
        <Defs>
          <RadialGradient id="stageGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.amber} stopOpacity={0.12} />
            <Stop offset="0.55" stopColor={colors.amber} stopOpacity={0.04} />
            <Stop offset="1" stopColor={colors.amber} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={1000} height={1000} fill="url(#stageGlow)" />
      </Svg>
      <View style={{ alignItems: 'center', gap: 18, maxWidth: 640 }}>
        <View>
          <FlockTile size={120} glow />
          <View
            style={{
              position: 'absolute',
              bottom: -10,
              right: -14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
            <T variant="labelSm" color={colors.textMuted}>
              v1.0
            </T>
          </View>
        </View>
        <T variant="headline" style={{ fontSize: 36, lineHeight: 44, textAlign: 'center', marginTop: 12 }}>
          {title}
        </T>
        <T variant="bodyLg" color={colors.amberSoftText} style={{ textAlign: 'center', opacity: 0.8, fontSize: 18, lineHeight: 28 }}>
          {body}
        </T>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {onNewChat && <Button title={t('New Chat')} icon="plus" size="lg" onPress={onNewChat} />}
          {secondary && <Button title={secondary.label} icon={secondary.icon} variant="ghost" size="lg" onPress={secondary.onPress} />}
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="lock" size={13} color={colors.teal} />
        <T variant="bodySm" color={colors.textMuted}>
          {t('Private messaging · Flock Desktop')}
        </T>
      </View>
    </View>
  );
}
