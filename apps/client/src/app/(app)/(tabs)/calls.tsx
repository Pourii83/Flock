import * as Clipboard from 'expo-clipboard';
import { SidebarPane } from '@/components/sidebar-pane';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyStage } from '@/components/empty-state';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Field, Icon, IconButton, SectionLabel, T, Tooltip } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { dayAndTime, duration } from '@/lib/format';
import { meetingLink } from '@/lib/config';
import type { CallLog, Room } from '@/lib/types';
import { useCalls } from '@/state/calls';
import { getItem, setItem } from '@/lib/storage';
import { chatStore, useChat, useMark } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { t, num } from '@/lib/i18n';
import { confirm } from '@/lib/confirm';

function useCallLog() {
  const { historyVersion } = useCalls();
  const [calls, setCalls] = useState<CallLog[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setCalls(await api.calls());
    } catch {
      setCalls((c) => c ?? []);
    }
  }, []);
  // Reload when the tab gains focus and whenever a call just finished.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (!historyVersion) return;
    let cancelled = false;
    api.calls().then((list) => !cancelled && setCalls(list), () => {});
    return () => {
      cancelled = true;
    };
  }, [historyVersion]);
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  /** Drops deleted calls from the list without refetching. */
  const hide = useCallback((ids: string[]) => {
    setCalls((list) => (list ?? []).filter((c) => !ids.includes(c.id)));
  }, []);
  return { calls, refreshing, refresh, hide };
}

function Segmented({ value, onChange, total, missed }: { value: 'all' | 'missed'; onChange: (v: 'all' | 'missed') => void; total: number; missed: number }) {
  const seg = (key: 'all' | 'missed', label: string, badge: React.ReactNode) => (
    <Pressable
      onPress={() => onChange(key)}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 12,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: value === key ? colors.surfaceHigh : 'transparent',
      }}>
      <T variant="labelLg" style={{ fontSize: 16 }}>
        {label}
      </T>
      {badge}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 5 }}>
      {seg(
        'all',
        t('All Calls'),
        total > 0 && (
          <T variant="labelLg" color={colors.textMuted}>
            {total}
          </T>
        ),
      )}
      {seg(
        'missed',
        t('Missed'),
        missed > 0 && (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.dangerDeep, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <T variant="label" color="#FFDAD6">
              {missed}
            </T>
          </View>
        ),
      )}
    </View>
  );
}

const DURATIONS: { minutes: number | null; label: string }[] = [
  { minutes: 60, label: '1 hour' },
  { minutes: 24 * 60, label: '1 day' },
  { minutes: 7 * 24 * 60, label: '7 days' },
  { minutes: null, label: 'Until I close it' },
];

function untilLabel(expiresAt: number | null) {
  return expiresAt ? t('Valid until {time}', { time: dayAndTime(expiresAt) }) : t('Open until you close it');
}

/** Meeting links: rooms anyone can join from a link, even without an account. */
function MeetingsCard() {
  const { joinRoom, call } = useCalls();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number | null>(60);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A short confirmation under the list (link copied, created and copied).
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const load = useCallback(() => {
    api.rooms().then(setRooms, () => setRooms((r) => r ?? []));
  }, []);
  useFocusEffect(load);

  const create = async () => {
    setBusy('new');
    setError(null);
    try {
      const room = await api.createRoom(title.trim(), minutes);
      setRooms((list) => [room, ...(list ?? [])]);
      setCreating(false);
      setTitle('');
      await copy(room, t('Meeting link created and copied to the clipboard'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const copy = async (room: Room, message = t('Link copied to clipboard')) => {
    try {
      await Clipboard.setStringAsync(meetingLink(room.code));
      setCopied(room.id);
      setTimeout(() => setCopied((id) => (id === room.id ? null : id)), 2000);
      flash(message);
    } catch {
      setError(t('Could not copy the link'));
    }
  };
  const close = async (room: Room) => {
    // Closing a room that people are in drops everyone: ask first, and say how many.
    const people = room.participants ?? 0;
    if (
      people > 0 &&
      !(await confirm(
        t('Close room'),
        t('{n} people are in this room right now. Closing it ends the call for everyone. Continue?', { n: num(people) }),
        t('Close anyway'),
        t('Cancel'),
      ))
    )
      return;
    setBusy(room.id);
    try {
      await api.closeRoom(room.id);
      setRooms((list) => (list ?? []).filter((r) => r.id !== room.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const join = async (room: Room) => {
    const problem = await joinRoom(room.code);
    if (problem) setError(problem);
  };

  // Decided by the card's own width (the desktop list column can be narrow too), not the window's.
  const [cardWidth, setCardWidth] = useState(0);
  const roomy = cardWidth >= 420;
  const [choicesWidth, setChoicesWidth] = useState(0);
  return (
    <View
      onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)}
      style={{ gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="link" size={20} color={colors.amberText} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="labelLg" style={{ fontSize: 16 }}>
            {t('Meeting links')}
          </T>
          <T variant="bodySm" color={colors.textMuted}>
            {t('Anyone with the link can join, even without an account.')}
          </T>
        </View>
        {/* Beside the text on wide screens; on phones it drops below so the description gets the full width. */}
        {!creating && roomy && <Button title={t('New link')} icon="plus" size="sm" onPress={() => setCreating(true)} />}
      </View>
      {!creating && !roomy && <Button title={t('New link')} icon="plus" size="sm" onPress={() => setCreating(true)} />}

      {creating && (
        <View style={{ gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceHigh }}>
          <Field label={t('Meeting name (optional)')} icon="type" placeholder={t('Weekly sync')} value={title} onChangeText={setTitle} maxLength={80} />
          <T variant="label">{t('Link stays valid for')}</T>
          {/* Four in one row when they fit, otherwise a 2×2 grid (never a lone chip on its own line). */}
          <View onLayout={(e) => setChoicesWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DURATIONS.map((d) => {
              const active = d.minutes === minutes;
              return (
                <Pressable
                  key={d.label}
                  onPress={() => setMinutes(d.minutes)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexGrow: 1,
                    flexBasis: choicesWidth >= 470 ? 0 : '40%',
                    alignItems: 'center',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.amber : colors.surfaceHighest,
                    backgroundColor: active ? colors.amberTint : colors.surface,
                  }}>
                  <T variant="label" color={active ? colors.amberText : colors.text} style={{ textAlign: 'center' }}>
                    {t(d.label)}
                  </T>
                </Pressable>
              );
            })}
          </View>
          {/* A hairline marks where the choices end and the actions begin: without it the buttons
              read as two more options of "stays valid for" (user request). */}
          <View style={{ height: 1, backgroundColor: colors.surfaceHighest }} />
          {/* Side by side when there's room; on narrow screens they stack full width instead of spilling out of the card. */}
          {roomy ? (
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <Button title={t('Cancel')} variant="ghost" size="sm" onPress={() => setCreating(false)} />
              <Button title={t('Create and copy link')} icon="link" size="sm" loading={busy === 'new'} onPress={create} />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Button title={t('Create and copy link')} icon="link" size="sm" loading={busy === 'new'} onPress={create} />
              <Button title={t('Cancel')} variant="ghost" size="sm" onPress={() => setCreating(false)} />
            </View>
          )}
        </View>
      )}

      {rooms?.map((room) => {
        const people = room.participants ?? 0;
        const expiry = untilLabel(room.expiresAt);
        return (
        // Name and expiry on the left, actions beside them; a stronger border so each link stands out.
        <View key={room.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.surfaceHighest, backgroundColor: colors.canvas }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: people > 0 ? colors.tealTint : colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="video" size={16} color={people > 0 ? colors.teal : colors.textMuted} />
          </View>
          <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <T variant="labelLg" numberOfLines={1}>
              {room.title || t('Meeting')}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {/* A narrow list cuts the expiry short; the tooltip always has the whole line. */}
              <Tooltip label={expiry} side="bottom" style={{ flexShrink: 1, minWidth: 0 }}>
                <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                  {expiry}
                </T>
              </Tooltip>
              {people > 0 && (
                <T variant="labelSm" color={colors.teal} numberOfLines={1}>
                  {t('{n} in the room', { n: num(people) })}
                </T>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {/* Compact icon actions with tooltips so the three actions fit on one line. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                padding: 3,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.surfaceHighest,
                backgroundColor: colors.surface,
              }}>
              <Tooltip label={copied === room.id ? t('Copied') : t('Copy link')} style={{ alignSelf: 'center' }}>
                <IconButton
                  name={copied === room.id ? 'check' : 'copy'}
                  label={copied === room.id ? t('Copied') : t('Copy link')}
                  onPress={() => void copy(room)}
                  size={36}
                  iconSize={16}
                  bg={copied === room.id ? colors.tealTint : colors.surfaceHigh}
                  activeBg={colors.surfaceHighest}
                  color={copied === room.id ? colors.teal : colors.text}
                />
              </Tooltip>
              <View style={{ width: 1, height: 20, backgroundColor: colors.surfaceHighest }} />
              <Tooltip label={t('Join')} style={{ alignSelf: 'center' }}>
                <IconButton
                  name="video"
                  label={t('Join')}
                  onPress={() => void join(room)}
                  disabled={call.phase !== 'idle'}
                  size={36}
                  iconSize={16}
                  bg={colors.amber}
                  activeBg={colors.amberSoft}
                  color={colors.onAmber}
                />
              </Tooltip>
              <View style={{ width: 1, height: 20, backgroundColor: colors.surfaceHighest }} />
              <Tooltip label={t('Close room')} style={{ alignSelf: 'center' }}>
                <IconButton
                  name="x-circle"
                  label={t('Close room')}
                  onPress={() => void close(room)}
                  disabled={busy === room.id}
                  size={36}
                  iconSize={16}
                  bg={colors.dangerTint}
                  activeBg={colors.dangerTint}
                  color={colors.danger}
                />
              </Tooltip>
            </View>
          </View>
        </View>
        );
      })}
      {!!notice && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.tealTint }}>
          <Icon name="check-circle" size={16} color={colors.teal} />
          <T variant="bodySm" color={colors.teal} style={{ flex: 1 }}>
            {notice}
          </T>
        </View>
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

function CallRow({
  log,
  selectable,
  selected,
  onToggle,
  onSelect,
}: {
  log: CallLog;
  /** Selection mode: the row becomes a checkbox instead of opening the chat. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** Long-press (or right-click) starts selection with this row picked. */
  onSelect?: () => void;
}) {
  const { startCall } = useCalls();
  const conversation = useChat((s) => s.conversations.find((c) => c.id === log.conversationId));
  const directionIcon = log.missed ? 'phone-missed' : log.direction === 'outgoing' ? 'arrow-up-right' : 'arrow-down-left';
  const directionColor = log.missed ? colors.danger : log.direction === 'outgoing' ? colors.teal : colors.teal;
  const detail = log.durationSec ? duration(log.durationSec) : log.video ? t('Video call') : t('Audio');
  const callBack = () => conversation && startCall(conversation, log.video);

  return (
    <Pressable
      onPress={selectable ? onToggle : () => conversation && router.navigate(`/chat/${conversation.id}`)}
      onLongPress={selectable ? undefined : onSelect}
      delayLongPress={400}
      // A button only while selecting: otherwise the row holds its own call-back button (no button inside a button).
      accessibilityRole={selectable ? 'button' : undefined}
      accessibilityState={selectable ? { selected: !!selected } : undefined}
      style={({ hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: radius.lg,
        backgroundColor: selected ? colors.amberTint : hovered ? colors.surfaceHigh : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.amberGlow : colors.surfaceHigh,
      })}>
      {log.conversationType === 'group' ? (
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="users" size={22} color={colors.text} />
        </View>
      ) : (
        <Avatar user={log.peer} size={52} ringBg={colors.surface} />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="labelLg" color={log.missed ? colors.danger : colors.text} style={{ fontSize: 17, flexShrink: 1 }} numberOfLines={1}>
            {log.title}
          </T>
          {log.missed && (
            <View style={{ backgroundColor: colors.dangerDeep, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
              <T variant="label" color="#FFDAD6">
                {t('Missed')}
              </T>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={directionIcon} size={15} color={directionColor} />
          {/* The line is cut short in a narrow column; the tooltip always carries all of it. */}
          <Tooltip label={`${dayAndTime(log.startedAt)} · ${detail}`} style={{ flexShrink: 1, alignSelf: 'center' }}>
            <T variant="body" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
              {dayAndTime(log.startedAt)} •{' '}
              <T variant="body" color={colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                {detail}
              </T>
            </T>
          </Tooltip>
        </View>
      </View>
      {selectable ? (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: selected ? colors.amber : colors.surfaceHighest,
            backgroundColor: selected ? colors.amber : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {selected && <Icon name="check" size={16} color={colors.onAmber} />}
        </View>
      ) : (
        <Tooltip label={t('Call back')} style={{ alignSelf: 'center' }}>
          <Pressable
            onPress={callBack}
            accessibilityRole="button"
            accessibilityLabel={t('Call back')}
            style={({ hovered, pressed }: any) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: log.missed ? colors.dangerDeep : hovered || pressed ? colors.surfaceHighest : colors.surfaceHigh,
              alignItems: 'center',
              justifyContent: 'center',
            })}>
            <Icon name={log.video ? 'video' : 'phone'} size={20} color={log.missed ? colors.danger : log.video ? colors.amberText : colors.teal} />
          </Pressable>
        </Tooltip>
      )}
    </Pressable>
  );
}

const SEEN_ALL_KEY = 'flock.calls.seenAll';
const SEEN_MISSED_KEY = 'flock.calls.seenMissed';

function CallsList() {
  const { calls, refreshing, refresh, hide } = useCallLog();
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const missed = calls?.filter((c) => c.missed) ?? [];
  const data = filter === 'missed' ? missed : (calls ?? []);

  // Selection mode: delete one call, a few, or the whole list from my own history.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const allSelected = data.length > 0 && data.every((c) => selected.includes(c.id));
  const beginSelect = (id?: string) => {
    setSelecting(true);
    setSelected(id ? [id] : []);
  };
  const cancelSelect = () => {
    setSelecting(false);
    setSelected([]);
  };
  const toggleSelect = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirm(
      t('Delete call history?'),
      t('{n} calls will be removed from your history. The other people on those calls keep theirs.', { n: num(ids.length) }),
      t('Delete'),
      t('Cancel'),
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await api.hideCalls(ids);
      hide(ids);
      cancelSelect();
    } catch {
      // Keep the selection so the delete can be tried again.
    } finally {
      setDeleting(false);
    }
  };

  // Each tab's badge counts only calls newer than the last time that tab was looked at. The markers
  // live on the server, so looking at the list on one device clears the badge on the others.
  const seenAllMark = useMark('callsSeenAll');
  const seenMissedMark = useMark('callsSeenMissed');
  const [local, setLocal] = useState<{ all: number; missed: number } | null>(null);
  const seen = local ? { all: Math.max(local.all, seenAllMark), missed: Math.max(local.missed, seenMissedMark) } : null;
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    let alive = true;
    // Markers from before they were kept on the server: move them there once.
    Promise.all([getItem(SEEN_ALL_KEY), getItem(SEEN_MISSED_KEY)]).then(([a, m]) => {
      if (!alive) return;
      const all = Number(a) || 0;
      const missedAt = Number(m) || 0;
      setLocal({ all, missed: missedAt });
      if (all) chatStore.setMark('callsSeenAll', all);
      if (missedAt) chatStore.setMark('callsSeenMissed', missedAt);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!seen || !focused || calls === null) return;
    const newest = data.reduce((max, c) => Math.max(max, c.startedAt), 0);
    if (newest <= seen[filter]) return;
    setLocal((prev) => (prev ? { ...prev, [filter]: newest } : prev));
    void setItem(filter === 'all' ? SEEN_ALL_KEY : SEEN_MISSED_KEY, String(newest));
    chatStore.setMark(filter === 'all' ? 'callsSeenAll' : 'callsSeenMissed', newest);
  }, [seen, focused, calls, data, filter]);
  const unseenAll = seen ? (calls ?? []).filter((c) => c.startedAt > seen.all).length : 0;
  const unseenMissed = seen ? missed.filter((c) => c.startedAt > seen.missed).length : 0;

  return (
    <FlatList
      data={data}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.amber} />}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ gap: 18, marginBottom: 6 }}>
          <MeetingsCard />
          <SectionLabel
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <T variant="label" color={colors.textMuted}>
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </T>
                {data.length > 0 && !selecting && (
                  <Pressable onPress={() => beginSelect()} accessibilityRole="button" hitSlop={8}>
                    <T variant="label" color={colors.amberText}>
                      {t('Select')}
                    </T>
                  </Pressable>
                )}
              </View>
            }>
            {t('Recent activity')}
          </SectionLabel>
          {/* The two views belong to the history under this heading, not to the page above it. */}
          <Segmented value={filter} onChange={setFilter} total={unseenAll} missed={unseenMissed} />
          {selecting && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh }}>
              <Pressable
                onPress={() => setSelected(allSelected ? [] : data.map((c) => c.id))}
                accessibilityRole="button"
                accessibilityState={{ selected: allSelected }}
                style={({ hovered }: any) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 6,
                  paddingVertical: 4,
                  borderRadius: radius.md,
                  backgroundColor: hovered ? colors.surfaceHigh : 'transparent',
                })}>
                <Icon name={allSelected ? 'check-circle' : 'circle'} size={17} color={allSelected ? colors.amberText : colors.textMuted} />
                <T variant="labelLg">{t('Select all')}</T>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Button
                title={selected.length ? t('Delete ({n})', { n: num(selected.length) }) : t('Delete')}
                variant="danger"
                size="sm"
                disabled={!selected.length || deleting}
                loading={deleting}
                onPress={() => void deleteSelected()}
              />
              <Button title={t('Cancel')} variant="ghost" size="sm" onPress={cancelSelect} />
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <CallRow
          log={item}
          selectable={selecting}
          selected={selected.includes(item.id)}
          onToggle={() => toggleSelect(item.id)}
          onSelect={() => beginSelect(item.id)}
        />
      )}
      ListEmptyComponent={
        calls === null ? (
          <ActivityIndicator color={colors.amberText} />
        ) : (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
            <Icon name="phone" size={28} color={colors.textDim} />
            <T variant="body" color={colors.textMuted}>
              {filter === 'missed' ? t('No missed calls 🎉') : t('No calls yet. Start one from any chat.')}
            </T>
          </View>
        )
      }
      ListFooterComponent={
        data.length > 0 ? (
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 20 }}>
            <View style={{ width: 52, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh }} />
            <T variant="body" color={colors.textMuted}>
              {t('End of recent history')}
            </T>
          </View>
        ) : undefined
      }
    />
  );
}

export default function CallsScreen() {
  const wide = useIsWide();
  const connected = useChat((s) => s.connected);

  if (!wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <MobileHeader />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <PageTitle
            title={t('Calls')}
            pill={connected ? t('Synced') : t('Offline')}
            pillColor={connected ? colors.teal : colors.amber}
            action={<Button title={t('New Call')} icon="phone-call" size="sm" onPress={() => router.push('/new-chat')} />}
          />
        </View>
        <CallsList />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SidebarPane>
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <PageTitle title={t('Calls')} pill={connected ? t('Synced') : t('Offline')} pillColor={connected ? colors.teal : colors.amber} />
          </View>
          <CallsList />
        </SidebarPane>
        <EmptyStage
          title={t('Huddle up in one tap')}
          body={t('Start a crisp voice or video call from any conversation. Calls connect peer-to-peer over WebRTC.')}
          onNewChat={() => router.push('/new-chat')}
          secondary={{
            label: t('Open chats'),
            icon: 'message-square',
            onPress: () => {
              chatStore.refreshConversations();
              router.navigate('/');
            },
          }}
        />
      </View>
    </View>
  );
}
