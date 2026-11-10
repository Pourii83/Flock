import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { getAppName, getRepoUrl } from '@/lib/brand';
import { t } from '@/lib/i18n';
import {
  CLIENT_VERSION,
  displayVersion,
  isNewerVersion,
  markChangelogSeen,
  repoReleasesUrl,
  takeChangelog,
  useUpdateInfo,
} from '@/lib/update';
import { colors, radius } from '@/theme';
import { Icon, T } from './ui';

/**
 * "New Version" box that takes the place the sidebar search used to occupy (top of the chat list
 * on phones). Web reloads into the new bundle; installed apps open the repository's release page.
 * Hidden when there is nothing newer, and on native when repository links are hidden.
 */
export function UpdateBanner() {
  const { version } = useUpdateInfo();
  const web = Platform.OS === 'web';
  const repo = getRepoUrl();
  const newer = isNewerVersion(version, CLIENT_VERSION);
  if (!newer || (!web && !repo)) return null;

  const update = () => {
    if (web) {
      if (typeof window !== 'undefined') window.location.reload();
      return;
    }
    const url = repoReleasesUrl(version);
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
        backgroundColor: colors.surface,
      }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: colors.amberTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name="volume-2" size={19} color={colors.amberText} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="labelLg" numberOfLines={1}>
          {t('New Version')}
        </T>
        <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
          {t('v{version} is available', { version: displayVersion(version) })}
        </T>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Update')}
        onPress={update}
        style={({ pressed, hovered }: any) => ({
          height: 34,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: colors.amber,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...(hovered && Platform.OS === 'web' ? ({ filter: 'brightness(1.06)' } as object) : {}),
        })}>
        <T variant="label" color={colors.onAmber}>
          {t('Update')}
        </T>
      </Pressable>
    </View>
  );
}

/**
 * Post-update changelog. Shows once when the client bundle version differs from the last version
 * the user saw, with the notes packaged into the server release. Never blocks the app.
 */
export function ChangelogModal() {
  const { notes } = useUpdateInfo();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    takeChangelog().then((pending) => {
      if (alive && pending) setOpen(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!open) return null;
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s*•\-]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  const close = () => {
    setOpen(false);
    void markChangelogSeen();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 460,
            maxHeight: '80%',
            backgroundColor: colors.rail,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            padding: 24,
            gap: 16,
            ...(shadow as object),
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="volume-2" size={20} color={colors.amberText} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <T variant="headline" style={{ fontSize: 22, lineHeight: 28 }}>
                {t("What's new")}
              </T>
              <T variant="bodySm" color={colors.textMuted}>
                {t('{name} updated to v{version}', { name: getAppName(), version: CLIENT_VERSION })}
              </T>
            </View>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
            {lines.length ? (
              lines.map((line, index) => (
                <View key={`${index}-${line}`} style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.amber, marginTop: 7 }} />
                  <T variant="body" color={colors.text} style={{ flex: 1, lineHeight: 20 }}>
                    {line}
                  </T>
                </View>
              ))
            ) : (
              <T variant="body" color={colors.textMuted}>
                {t('Small fixes and improvements behind the scenes.')}
              </T>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Got it')}
            onPress={close}
            style={({ pressed, hovered }: any) => ({
              height: 44,
              borderRadius: radius.pill,
              backgroundColor: colors.amber,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              ...(hovered && Platform.OS === 'web' ? ({ filter: 'brightness(1.06)' } as object) : {}),
            })}>
            <T variant="labelLg" color={colors.onAmber}>
              {t('Got it')}
            </T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 18 }, elevation: 20 };
