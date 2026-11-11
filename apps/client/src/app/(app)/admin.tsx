import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';

import { ModalFrame } from '@/components/modal-frame';
import { Button, Field, Icon, SectionLabel, T, type IconName } from '@/components/ui';
import { api, type AppSettings, type ServerUsage } from '@/lib/api';
import { DEFAULT_REPO, setBranding } from '@/lib/brand';
import { num, t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { colors, radius } from '@/theme';

const REFRESH_MS = 10_000;

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

/** Admin only: server-wide settings and how the server is doing. */
export default function AdminScreen() {
  const { user } = useAuth();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  return (
    <ModalFrame title={t('App settings')} subtitle={t('Server-wide settings and usage')} onClose={close}>
      {user?.isAdmin ? (
        <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 24 }}>
          <Usage />
          <SettingsForm />
        </ScrollView>
      ) : (
        <T color={colors.textMuted}>{t('Only the server admin can do this')}</T>
      )}
    </ModalFrame>
  );
}

function Usage() {
  const [usage, setUsage] = useState<ServerUsage | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.adminUsage().then(
      (u) => {
        setUsage(u);
        setError('');
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (!usage) return error ? <T color={colors.danger}>{error}</T> : <ActivityIndicator color={colors.amber} />;
  const memUsed = usage.memory.total - usage.memory.free;
  const diskUsed = usage.disk ? usage.disk.total - usage.disk.free : 0;
  const c = usage.counts;
  return (
    <View style={{ gap: 12 }}>
      <SectionLabel right={<Button title={t('Refresh')} icon="refresh-cw" size="sm" variant="ghost" onPress={load} />}>{t('Server usage')}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Meter
          icon="cpu"
          label={t('CPU')}
          value={`${num(usage.cpu.percent)}%`}
          detail={t('{n} cores · load {load}', { n: num(usage.cpu.cores), load: usage.cpu.load.map((l) => l.toFixed(2)).join(' / ') })}
          ratio={usage.cpu.percent / 100}
        />
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
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat icon="users" label={t('Users')} value={num(c.users)} detail={t('{n} online', { n: num(c.online) })} />
        <Stat icon="message-square" label={t('Messages')} value={num(c.messages)} detail={t('{n} chats', { n: num(c.conversations) })} />
        <Stat icon="paperclip" label={t('Files kept')} value={num(c.files)} />
        <Stat icon="phone" label={t('Live calls')} value={num(c.liveCalls + c.liveRooms)} detail={t('{n} people in calls', { n: num(c.inCalls) })} />
        <Stat icon="link" label={t('Open meeting links')} value={num(c.openRooms)} />
        <Stat
          icon="clock"
          label={t('Uptime')}
          value={duration(usage.uptime.flock)}
          detail={usage.version ? t('Version {v}', { v: usage.version }) : t('Server up {time}', { time: duration(usage.uptime.system) })}
        />
      </View>
    </View>
  );
}

function Meter({ icon, label, value, detail, ratio }: { icon: IconName; label: string; value: string; detail?: string; ratio?: number }) {
  const r = ratio === undefined ? undefined : Math.max(0, Math.min(1, ratio));
  const tone = r === undefined ? colors.amber : r > 0.9 ? colors.danger : r > 0.75 ? colors.amber : colors.teal;
  return (
    <View style={{ flexGrow: 1, flexBasis: 220, gap: 8, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={15} color={colors.textMuted} />
        <T variant="label" color={colors.textMuted}>
          {label}
        </T>
      </View>
      <T variant="labelLg" style={{ fontSize: 17, fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      {r !== undefined && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHighest, overflow: 'hidden', direction: 'ltr' }}>
          <View style={{ width: `${r * 100}%`, height: '100%', backgroundColor: tone }} />
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

function Stat({ icon, label, value, detail }: { icon: IconName; label: string; value: string; detail?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 140, gap: 4, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={14} color={colors.textMuted} />
        <T variant="labelSm" color={colors.textMuted}>
          {label}
        </T>
      </View>
      <T variant="headlineSm" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
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
    retentionDays >= 1 &&
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
    <View style={{ gap: 12 }}>
      <SectionLabel>{t('App settings')}</SectionLabel>
      <View style={{ gap: 16, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
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
        <Field
          label={t('Largest file people can send (MB)')}
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
        <Field
          label={t('Keep sent files for (days)')}
          icon="clock"
          keyboardType="number-pad"
          value={retention}
          onChangeText={(v) => setRetention(v.replace(/[^0-9]/g, ''))}
          maxLength={3}
          error={Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 365 ? null : t('1 to 365')}
        />
        {message && (
          <T variant="body" color={message.ok ? colors.teal : colors.danger}>
            {message.text}
          </T>
        )}
        <Button title={t('Save changes')} icon="check" onPress={save} loading={busy} disabled={!dirty || !valid} />
      </View>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
