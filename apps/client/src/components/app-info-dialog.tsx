import { Linking, Modal, Pressable, View } from 'react-native';

import { getRepoUrl, useBranding } from '@/lib/brand';
import { t } from '@/lib/i18n';
import { CLIENT_VERSION } from '@/lib/update';
import { colors, radius } from '@/theme';
import { FlockTile } from './logo';
import { Button, Icon, T } from './ui';

/**
 * App info dialog opened from the logo (rail tile / mobile header brand) and from Settings.
 * Shows the mark, the (admin-chosen) app name, the client version, the project link when the
 * admin shows repo links, the license note and a close action.
 */
export function AppInfoDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const brand = useBranding();
  if (!visible) return null;
  const repo = getRepoUrl();
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={t('Close')} style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors.rail,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            padding: 24,
            gap: 18,
            ...(shadow as object),
          }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <FlockTile size={68} glow />
            <T variant="headline" style={{ fontSize: 26, textAlign: 'center' }}>
              {brand.appName}
            </T>
            <T variant="label" color={colors.textMuted}>
              {t('Version {v}', { v: CLIENT_VERSION })}
            </T>
          </View>

          <T variant="body" color={colors.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>
            {t('A calm, self-hosted messenger for teams. Real-time chat, calls and meeting links on web, desktop and Android.')}
          </T>

          {!!repo && (
            <Pressable
              onPress={() => void openUrl(repo)}
              accessibilityRole="link"
              accessibilityLabel={t('Open the project repository')}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.surfaceHigh,
                backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
              })}>
              <Icon name="github" size={18} color={colors.amberText} />
              <View style={{ flex: 1, gap: 1 }}>
                <T variant="labelLg" color={colors.text}>
                  {t('Project repository')}
                </T>
                <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                  {repo.replace(/^https?:\/\//, '')}
                </T>
              </View>
              <Icon name="external-link" size={16} color={colors.textMuted} />
            </Pressable>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="shield" size={13} color={colors.textMuted} />
            <T variant="bodySm" color={colors.textMuted} style={{ flexShrink: 1 }}>
              {t('Released under the Flock Source-Available License.')}
            </T>
          </View>

          <Button title={t('Close')} variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** External links open in the system browser on native and a new tab on web. */
function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 18 }, elevation: 20 };
