import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, View, useWindowDimensions } from 'react-native';

import { ModalFrame } from '@/components/modal-frame';
import { Button, Field, Icon, T, type IconName } from '@/components/ui';
import { api, type AppSettings, type ServerUsage } from '@/lib/api';
import { DEFAULT_REPO, setBranding } from '@/lib/brand';
import { num, t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { colors, radius } from '@/theme';

/** The panel's numbers refresh on their own this often (paused while the tab is in the background). */
const REFRESH_MS = 3_000;
/** CPU samples kept for the little history chart (a minute and a half at 3 s). */
const HISTORY = 30;
/** Quick picks for the upload limit (Stitch "Cluster Policies"); any other value goes in the field. */
const UPLOAD_PRESETS = [100, 250, 500, 1024];

function bytes(n: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${num(v >= 100 || i === 0 ? Math.round(v) : Math.round(v * 10) / 10)} ${units[i]}`;
}

function duration(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? t('{d}d {h}h', { d: num(d), h: num(h) }) : h ? t('{h}h {m}m', { h: num(h), m: num(m) }) : t('{m}m', { m: num(m) });
}

/** Polls the server usage on a timer, keeps a short CPU history, and pauses while the page is hidden. */
function useLiveUsage() {
  const [usage, setUsage] = useState<ServerUsage | null>(null);
  const [cpu, setCpu] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return;
    inFlight.current = true;
    api
      .adminUsage()
      .then(
        (u) => {
          setUsage(u);
          setCpu((prev) => [...prev, u.cpu.percent].slice(-HISTORY));
          setUpdatedAt(Date.now());
          setError('');
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    // Coming back to the tab refreshes at once instead of waiting for the next tick.
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) load();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { usage, cpu, error, updatedAt };
}

/** Admin only: server-wide settings and live server telemetry (Stitch "Server Administration"). */
export default function AdminScreen() {
  const { user } = useAuth();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const { width } = useWindowDimensions();
  const twoColumns = width >= 1000;
  return (
    <ModalFrame title={t('Server administration')} subtitle={t('Live server status and server-wide settings')} onClose={close} maxWidth={1120}>
      {user?.isAdmin ? (
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
          <Dashboard twoColumns={twoColumns} />
        </ScrollView>
      ) : (
        <T color={colors.textMuted}>{t('Only the server admin can do this')}</T>
      )}
    </ModalFrame>
  );
}

function Dashboard({ twoColumns }: { twoColumns: boolean }) {
  const { usage, cpu, error, updatedAt } = useLiveUsage();
  // Ticks once a second so "updated 2s ago" stays true between refreshes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!usage) return error ? <T color={colors.danger}>{error}</T> : <ActivityIndicator color={colors.amber} />;
  const c = usage.counts;
  const ago = Math.max(0, Math.round((now - updatedAt) / 1000));
  const stale = !!error || ago > (REFRESH_MS / 1000) * 3;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: radius.pill,
            backgroundColor: stale ? colors.dangerTint : colors.tealTint,
          }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stale ? colors.danger : colors.online }} />
          <T variant="label" color={stale ? colors.danger : colors.teal}>
            {stale ? t('Not updating') : t('Live')}
          </T>
        </View>
        <T variant="bodySm" color={colors.textMuted}>
          {[
            t('Updated {n}s ago', { n: num(ago) }),
            t('Up {time}', { time: duration(usage.uptime.flock) }),
            usage.version ? t('Version {v}', { v: usage.version }) : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </T>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Kpi icon="users" label={t('Users')} value={num(c.users)} detail={t('{n} online', { n: num(c.online) })} live={c.online > 0} />
        <Kpi icon="phone" label={t('Live calls')} value={num(c.liveCalls + c.liveRooms)} detail={t('{n} people in calls', { n: num(c.inCalls) })} live={c.inCalls > 0} />
        <Kpi icon="message-square" label={t('Messages')} value={num(c.messages)} detail={t('{n} chats', { n: num(c.conversations) })} />
        <Kpi icon="link" label={t('Open meeting links')} value={num(c.openRooms)} detail={t('{n} files kept', { n: num(c.files) })} />
      </View>

      <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: twoColumns ? 1.4 : undefined, alignSelf: 'stretch', gap: 16 }}>
          <Resources usage={usage} cpu={cpu} />
        </View>
        <View style={{ flex: twoColumns ? 1 : undefined, alignSelf: 'stretch' }}>
          <SettingsForm />
        </View>
      </View>
    </View>
  );
}

/** A card with an amber icon tile and a title, like the Settings sections. */
function Panel({ icon, title, subtitle, right, children }: { icon: IconName; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: 16, padding: 20, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={colors.amberText} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="headlineSm" style={{ fontSize: 18 }}>
            {title}
          </T>
          {!!subtitle && (
            <T variant="bodySm" color={colors.textMuted}>
              {subtitle}
            </T>
          )}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function Kpi({ icon, label, value, detail, live }: { icon: IconName; label: string; value: string; detail: string; live?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 200, gap: 10, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T variant="overline" color={colors.textMuted} style={{ flex: 1, textTransform: 'uppercase' }} numberOfLines={1}>
          {label}
        </T>
        {live ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online }} /> : <Icon name={icon} size={16} color={colors.textMuted} />}
      </View>
      <T variant="headline" style={{ fontSize: 32, lineHeight: 38, fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      <T variant="bodySm" color={colors.textMuted}>
        {detail}
      </T>
    </View>
  );
}

function Resources({ usage, cpu }: { usage: ServerUsage; cpu: number[] }) {
  const memUsed = usage.memory.total - usage.memory.free;
  const diskUsed = usage.disk ? usage.disk.total - usage.disk.free : 0;
  return (
    <Panel icon="activity" title={t('Server resources')} subtitle={t('Refreshes on its own every few seconds')}>
      <View style={{ gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Icon name="cpu" size={15} color={colors.textMuted} />
          <T variant="label" color={colors.textMuted} style={{ flex: 1 }}>
            {t('CPU')}
          </T>
          <T variant="headlineSm" style={{ fontVariant: ['tabular-nums'] }}>{`${num(usage.cpu.percent)}%`}</T>
        </View>
        <Sparkline values={cpu} />
        <T variant="bodySm" color={colors.textMuted}>
          {t('{n} cores · load {load}', { n: num(usage.cpu.cores), load: usage.cpu.load.map((l) => l.toFixed(2)).join(' / ') })}
        </T>
      </View>
      <Meter
        icon="layers"
        label={t('Memory')}
        value={`${bytes(memUsed)} / ${bytes(usage.memory.total)}`}
        detail={t('Flock uses {size}', { size: bytes(usage.memory.flock) })}
        ratio={memUsed / usage.memory.total}
      />
      {usage.disk && (
        <Meter
          icon="hard-drive"
          label={t('Disk')}
          value={`${bytes(diskUsed)} / ${bytes(usage.disk.total)}`}
          detail={t('{size} free', { size: bytes(usage.disk.free) })}
          ratio={diskUsed / usage.disk.total}
        />
      )}
      <Meter
        icon="database"
        label={t('Flock data')}
        value={bytes(usage.storage.database + usage.storage.uploads)}
        detail={t('Database {db} · files {files}', { db: bytes(usage.storage.database), files: bytes(usage.storage.uploads) })}
      />
    </Panel>
  );
}

/** CPU history as thin bars, newest on the right; amber above 75%, red above 90%. */
function Sparkline({ values }: { values: number[] }) {
  const bars = [...Array(Math.max(0, HISTORY - values.length)).fill(null), ...values];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 44, direction: 'ltr' }}>
      {bars.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: v === null ? 2 : Math.max(3, (Math.min(100, v) / 100) * 44),
            borderRadius: 2,
            backgroundColor: v === null ? colors.surfaceHigh : v > 90 ? colors.danger : v > 75 ? colors.amber : colors.teal,
            opacity: v === null ? 1 : 0.55 + (0.45 * i) / HISTORY,
          }}
        />
      ))}
    </View>
  );
}

function Meter({ icon, label, value, detail, ratio }: { icon: IconName; label: string; value: string; detail?: string; ratio?: number }) {
  const r = ratio === undefined ? undefined : Math.max(0, Math.min(1, ratio));
  const tone = r === undefined ? colors.amber : r > 0.9 ? colors.danger : r > 0.75 ? colors.amber : colors.teal;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={15} color={colors.textMuted} />
        <T variant="label" color={colors.textMuted} style={{ flex: 1 }}>
          {label}
        </T>
        <T variant="labelLg" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
      </View>
      {r !== undefined && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHighest, overflow: 'hidden', direction: 'ltr' }}>
          <View style={{ width: `${r * 100}%`, height: '100%', backgroundColor: tone, borderRadius: 3 }} />
        </View>
      )}
      {!!detail && (
        <T variant="bodySm" color={colors.textMuted}>
          {detail}
        </T>
      )}
    </View>
  );
}

function SettingsForm() {
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [upload, setUpload] = useState('');
  const [retention, setRetention] = useState('');
  const [appName, setAppName] = useState('');
  const [mirrorUrl, setMirrorUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.adminSettings().then(
      (s) => {
        setSaved(s);
        setDraft(s);
        setUpload(String(s.maxUploadMb));
        setRetention(String(s.fileRetentionDays));
        setAppName(s.appName);
        setMirrorUrl(s.mirrorUrl ?? '');
      },
      (e) => setMessage({ text: e instanceof Error ? e.message : String(e), ok: false }),
    );
  }, []);

  if (!draft || !saved) return message ? <T color={colors.danger}>{message.text}</T> : null;
  const uploadMb = Number(upload);
  const retentionDays = Number(retention);
  const name = appName.trim();
  const mirror = mirrorUrl.trim();
  const nameValid = name.length >= 1 && name.length <= 40;
  // Empty means "update from the main repository"; otherwise a GitHub repository URL.
  const mirrorValid = !mirror || /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/?$/i.test(mirror);
  const valid =
    Number.isInteger(uploadMb) &&
    uploadMb >= 1 &&
    uploadMb <= 4096 &&
    Number.isInteger(retentionDays) &&
    retention !== '' &&
    retentionDays >= 0 &&
    retentionDays <= 365 &&
    nameValid &&
    mirrorValid;
  const dirty =
    draft.allowRegistration !== saved.allowRegistration ||
    draft.allowGuestMeetings !== saved.allowGuestMeetings ||
    uploadMb !== saved.maxUploadMb ||
    retentionDays !== saved.fileRetentionDays ||
    name !== saved.appName ||
    mirror !== (saved.mirrorUrl ?? '');

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.updateAdminSettings({
        ...draft,
        maxUploadMb: uploadMb,
        fileRetentionDays: retentionDays,
        appName: name,
        mirrorUrl: mirror,
      });
      setSaved(next);
      setDraft(next);
      setAppName(next.appName);
      setMirrorUrl(next.mirrorUrl ?? '');
      setMessage({ text: t('Settings saved — they apply right away'), ok: true });
      // The brand store feeds the app name/link everywhere: refresh it after a save.
      api.branding().then(setBranding, () => {});
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon="sliders" title={t('Server settings')} subtitle={t('Apply to everyone on this server')}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <T variant="labelLg" style={{ flex: 1 }}>
            {t('Largest file people can send')}
          </T>
          <T variant="labelLg" color={colors.amberText} style={{ fontVariant: ['tabular-nums'] }}>
            {Number.isInteger(uploadMb) && uploadMb > 0 ? (uploadMb >= 1024 && uploadMb % 1024 === 0 ? `${num(uploadMb / 1024)} GB` : `${num(uploadMb)} MB`) : '—'}
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {UPLOAD_PRESETS.map((mb) => {
            const active = uploadMb === mb;
            return (
              <Pressable
                key={mb}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setUpload(String(mb))}
                style={({ hovered }: any) => ({
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: active ? colors.amber : colors.border,
                  backgroundColor: active ? colors.amber : hovered ? colors.surfaceHigh : colors.canvas,
                })}>
                <T variant="label" color={active ? colors.onAmber : colors.text}>
                  {mb >= 1024 ? `${num(mb / 1024)} GB` : `${num(mb)} MB`}
                </T>
              </Pressable>
            );
          })}
        </View>
        <Field
          label={t('Or another size (MB)')}
          icon="upload"
          keyboardType="number-pad"
          value={upload}
          onChangeText={(v) => setUpload(v.replace(/[^0-9]/g, ''))}
          maxLength={4}
          error={Number.isInteger(uploadMb) && uploadMb >= 1 && uploadMb <= 4096 ? null : t('1 to 4096')}
        />
        <T variant="bodySm" color={colors.textMuted}>
          {t('Behind Nginx, raise client_max_body_size too when going above 100 MB.')}
        </T>
      </View>

      <View style={{ gap: 8 }}>
        <Field
          label={t('Keep sent files for (days)')}
          icon="clock"
          keyboardType="number-pad"
          value={retention}
          onChangeText={(v) => setRetention(v.replace(/[^0-9]/g, ''))}
          maxLength={3}
          error={retention !== '' && Number.isInteger(retentionDays) && retentionDays >= 0 && retentionDays <= 365 ? null : t('0 to 365')}
        />
        <T variant="bodySm" color={retention !== '' && retentionDays === 0 ? colors.amberText : colors.textMuted}>
          {t('0 turns this off: files are never deleted and stay on the server for good. Applies to files sent from now on; files already sent keep their date.')}
        </T>
      </View>

      <Toggle
        label={t('Open sign-up')}
        hint={t('Anyone who can reach this server can create an account. Turn off to keep the server to existing accounts.')}
        value={draft.allowRegistration}
        onChange={(v) => setDraft({ ...draft, allowRegistration: v })}
      />
      <Toggle
        label={t('Guests in meetings')}
        hint={t('People without an account can join meeting links.')}
        value={draft.allowGuestMeetings}
        onChange={(v) => setDraft({ ...draft, allowGuestMeetings: v })}
      />

      <View style={{ gap: 8 }}>
        <Field
          label={t('App name')}
          icon="type"
          value={appName}
          onChangeText={setAppName}
          maxLength={40}
          placeholder={t('Flock')}
          error={nameValid ? null : t('1 to 40 characters')}
        />
        <T variant="bodySm" color={colors.textMuted}>
          {t('Every "Flock" in the app becomes this name, for everyone on this server.')}
        </T>
      </View>
      <View style={{ gap: 8 }}>
        <Field
          label={t('Update mirror')}
          icon="github"
          value={mirrorUrl}
          onChangeText={setMirrorUrl}
          placeholder={DEFAULT_REPO}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={200}
          error={mirrorValid ? null : t('Use a GitHub repository link like https://github.com/owner/name')}
        />
        <T variant="bodySm" color={colors.textMuted}>
          {t('Only sets where this server looks for updates (a mirror of the project). Leave empty to use the main repository, which the apps always link to.')}
        </T>
      </View>

      {message && (
        <T variant="body" color={message.ok ? colors.teal : colors.danger}>
          {message.text}
        </T>
      )}
      <Button title={t('Save changes')} icon="check" onPress={save} loading={busy} disabled={!dirty || !valid} />
    </Panel>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="labelLg">{label}</T>
        <T variant="bodySm" color={colors.textMuted}>
          {hint}
        </T>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceHighest, true: colors.amber }}
        thumbColor={colors.text}
        {...({ activeThumbColor: colors.onAmber } as object)}
      />
    </View>
  );
}
