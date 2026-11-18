import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';

import { getRepoUrl, useBranding } from '@/lib/brand';
import { t } from '@/lib/i18n';
import { CLIENT_VERSION, displayVersion } from '@/lib/update';
import { colors, radius } from '@/theme';
import { FlockTile } from './logo';
import { Button, Icon, IconButton, T, Tooltip } from './ui';

/** Where the project takes donations (same as the README). Each coin only on its own network. */
const WALLETS: { label: string; address: string }[] = [
  { label: 'BNB · USDT (BEP-20)', address: '0x33F5E7CEd703f514D08361732aECed623e9DceE0' },
  { label: 'TRX · USDT (TRC-20)', address: 'TWF2qgU9AFHHEf1TdJKnVnNjjZ1fszhitZ' },
  { label: 'TON', address: 'UQDDkfbmIFjcGO7tyDahkuzxwJ3-PApAQHiBx6AZzfaxBzwL' },
];

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
            maxWidth: 440,
            maxHeight: '92%',
            backgroundColor: colors.rail,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            overflow: 'hidden',
            ...(shadow as object),
          }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <FlockTile size={68} glow />
            <T variant="headline" style={{ fontSize: 26, textAlign: 'center' }}>
              {brand.appName}
            </T>
            <T variant="label" color={colors.textMuted}>
              {t('Version {v}', { v: displayVersion(CLIENT_VERSION) })}
            </T>
          </View>


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

          <SupportCard />

          <Button title={t('Close')} variant="ghost" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "Support the project": the donation wallets, each with a copy button. */
function SupportCard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (address: string) => {
    await Clipboard.setStringAsync(address).catch(() => {});
    setCopied(address);
    setTimeout(() => setCopied((c) => (c === address ? null : c)), 2000);
  };
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.surfaceHigh, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="heart" size={16} color={colors.amberText} />
        <T variant="labelLg" color={colors.amberText}>
          {t('Support the project')}
        </T>
      </View>
      <T variant="bodySm" color={colors.textMuted}>
        {t('If Flock is useful to you, you can support its development with these wallets. Send each coin only on the network named above it.')}
      </T>
      {WALLETS.map((w) => (
        <View key={w.address} style={{ gap: 6 }}>
          <T variant="label">{w.label}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: 10, paddingEnd: 4, paddingVertical: 4, borderRadius: radius.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.surfaceHigh }}>
            <T variant="bodySm" selectable style={{ flex: 1, fontFamily: 'monospace', writingDirection: 'ltr', textAlign: 'left' }} numberOfLines={1}>
              {w.address}
            </T>
            <Tooltip label={copied === w.address ? t('Copied') : t('Copy')}>
              <IconButton
                name={copied === w.address ? 'check' : 'copy'}
                label={copied === w.address ? t('Copied') : t('Copy')}
                onPress={() => void copy(w.address)}
                size={32}
                iconSize={15}
                color={copied === w.address ? colors.teal : colors.textMuted}
              />
            </Tooltip>
          </View>
        </View>
      ))}
    </View>
  );
}

/** External links open in the system browser on native and a new tab on web. */
function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 18 }, elevation: 20 };
