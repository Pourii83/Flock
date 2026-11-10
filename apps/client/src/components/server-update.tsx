// Admin-only "server update" control: compares the installed server release with the latest GitHub
// Release (not commits) and, after confirmation, asks the server to update itself. Shown in the
// desktop rail under Settings and next to the profile picture on phones; hidden when up to date.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { api, type ServerUpdateInfo } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { colors, radius } from '@/theme';
import { Icon, T, Tooltip } from './ui';

const POLL_MS = 10 * 60 * 1000;
const pollMs = 3000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ServerUpdateButton({ variant }: { variant: 'rail' | 'header' }) {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [info, setInfo] = useState<ServerUpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'updating' | 'done'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const refresh = () => void api.serverUpdate().then((next) => alive && setInfo(next)).catch(() => {});
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isAdmin]);

  if (!isAdmin || !info?.updateAvailable) return null;
  const latest = info.latest!;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError('');
    setPhase('idle');
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.startServerUpdate(latest);
      if (!res.ok) throw new Error(res.error ? t(res.error) : t('Could not start the update'));
      setPhase('updating');
      // The server restarts during the update; wait for a different installed version to come back.
      for (let i = 0; i < 80; i += 1) {
        await sleep(pollMs);
        const branding = await api.branding().catch(() => null);
        if (branding?.version && branding.version !== info.current) {
          setPhase('done');
          if (Platform.OS === 'web' && typeof window !== 'undefined') setTimeout(() => window.location.reload(), 1200);
          return;
        }
      }
      setError(t('The server did not come back with a new version. Check the server logs.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not start the update'));
    } finally {
      setBusy(false);
    }
  };

  const label = t('Update server');
  const trigger =
    variant === 'rail' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ hovered, pressed }: any) => ({
          width: 52,
          height: 52,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed || hovered ? colors.amberGlow : colors.amberTint,
          borderWidth: 1,
          borderColor: colors.amber,
        })}>
        <Icon name="download-cloud" size={22} color={colors.amberText} />
      </Pressable>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }: any) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.surfaceHigh : colors.amberTint,
          borderWidth: 1,
          borderColor: colors.amber,
        })}>
        <Icon name="download-cloud" size={18} color={colors.amberText} />
      </Pressable>
    );

  return (
    <>
      <Tooltip label={label} side="bottom">
        {trigger}
      </Tooltip>
      <Modal transparent animationType="fade" visible={open} onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: '82%',
              backgroundColor: colors.rail,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.surfaceHigh,
              padding: 22,
              gap: 14,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="download-cloud" size={20} color={colors.amberText} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="headlineSm" style={{ fontSize: 20 }}>
                  {t('Server update')}
                </T>
                <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                  {t('Installed v{current} · latest v{latest}', { current: info.current ?? '—', latest })}
                </T>
              </View>
              <Pressable onPress={close} accessibilityLabel={t('Close')} style={{ padding: 8 }}>
                <Icon name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* The server update does not touch phones or the Windows app; they need the release too. */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.amberTint, borderWidth: 1, borderColor: colors.amber }}>
              <Icon name="alert-triangle" size={18} color={colors.amberText} />
              <T variant="bodySm" color={colors.amberText} style={{ flex: 1 }}>
                {t('This updates the server only. If you use the Windows or Android app, you must also install the new version from the GitHub release.')}
              </T>
            </View>

            {phase === 'updating' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                <ActivityIndicator color={colors.amberText} />
                <T variant="body" color={colors.textMuted} style={{ flex: 1 }}>
                  {t('Updating the server to v{version}. It restarts in a moment.', { version: latest })}
                </T>
              </View>
            ) : phase === 'done' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                <Icon name="check-circle" size={18} color={colors.teal} />
                <T variant="body" color={colors.text} style={{ flex: 1 }}>
                  {t('The server is updated to v{version}. Reload the page to get the new client.', { version: latest })}
                </T>
              </View>
            ) : (
              <ScrollView style={{ flexGrow: 0, maxHeight: 220 }} contentContainerStyle={{ gap: 6 }}>
                {info.notes
                  .split(/\r?\n/)
                  .map((line) => line.replace(/^[#>\s*•\-]+/, '').replace(/\*\*/g, '').trim())
                  .filter((line) => !!line && !/^Full Changelog/i.test(line) && !/^Upgrading:/i.test(line))
                  .slice(0, 12)
                  .map((line, index) => (
                    <View key={`${index}-${line}`} style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.amber, marginTop: 7 }} />
                      <T variant="body" color={colors.text} style={{ flex: 1, lineHeight: 20 }}>
                        {line}
                      </T>
                    </View>
                  ))}
              </ScrollView>
            )}

            {!!error && (
              <T variant="bodySm" color={colors.danger}>
                {error}
              </T>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={close}
                disabled={busy}
                accessibilityLabel={t('Cancel')}
                style={{ paddingHorizontal: 18, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh }}>
                <T variant="labelLg" color={colors.text}>
                  {t('Cancel')}
                </T>
              </Pressable>
              <Pressable
                onPress={() => void start()}
                disabled={busy || phase !== 'idle'}
                accessibilityLabel={label}
                style={({ pressed }: any) => ({
                  paddingHorizontal: 20,
                  height: 42,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.amber,
                  opacity: busy || phase !== 'idle' ? 0.6 : pressed ? 0.85 : 1,
                })}>
                {busy && phase === 'idle' ? (
                  <ActivityIndicator color={colors.onAmber} size="small" />
                ) : (
                  <T variant="labelLg" color={colors.onAmber}>
                    {phase === 'updating' ? t('Updating…') : t('Update server')}
                  </T>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
