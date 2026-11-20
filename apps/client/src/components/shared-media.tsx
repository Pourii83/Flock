// Info panel tabs (Stitch "Chat Details"): the photos/videos, files, links and audio shared in a
// conversation. Read-only views of messages that already exist; nothing here sends or changes data.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, View } from 'react-native';

import { router } from 'expo-router';

import { useIsWide } from '@/hooks/use-layout';
import { api, type SharedCounts, type SharedKind } from '@/lib/api';
import { attachmentSource, openAttachment } from '@/lib/attachments';
import { requestJump } from '@/lib/jump';
import { shortTime } from '@/lib/format';
import { num, t } from '@/lib/i18n';
import type { Conversation, Message } from '@/lib/types';
import { colors, radius } from '@/theme';
import { MediaViewer, type ViewerMedia } from './media-viewer';
import { Icon, IconButton, T, Tooltip, type IconName } from './ui';
import { VideoThumb } from './video-thumb';

const TABS: { kind: SharedKind; label: string }[] = [
  { kind: 'media', label: 'Media' },
  { kind: 'files', label: 'Files' },
  { kind: 'links', label: 'Links' },
  { kind: 'audio', label: 'Audio' },
];
/** Media tiles shown before the "+N" tile opens the rest. */
const PREVIEW = 6;
const URL_RE = /https?:\/\/[^\s<>"']+/i;

function bytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

function fileIcon(mimeType: string): IconName {
  if (mimeType.startsWith('audio/')) return 'music';
  if (mimeType.includes('pdf') || mimeType.startsWith('text/')) return 'file-text';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'archive';
  return 'file';
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The tabs plus their content. Hidden while the conversation has shared nothing. */
export function SharedMedia({ conversation }: { conversation: Conversation }) {
  const [counts, setCounts] = useState<SharedCounts | null>(null);
  const [tab, setTab] = useState<SharedKind>('media');
  const [items, setItems] = useState<Partial<Record<SharedKind, Message[]>>>({});
  const [expanded, setExpanded] = useState(false);
  const [viewing, setViewing] = useState<{ media: ViewerMedia; messageId: string } | null>(null);
  const wide = useIsWide();
  // Desktop: the chat sits beside the panel and scrolls at once. Phones: the info page closes first.
  const showInChat = (messageId: string) => {
    setViewing(null);
    if (!wide && router.canGoBack()) router.back();
    requestJump(conversation.id, messageId);
  };
  // Always three columns: the tile size comes from the grid's own width (the panel can be resized).
  const [gridWidth, setGridWidth] = useState(0);
  const tile = gridWidth ? Math.floor((gridWidth - 8) / 3) : 0;
  const id = conversation.id;
  const lastMessage = conversation.lastMessage?.id;

  // Both refresh when a new message arrives, so a photo sent a moment ago shows up.
  useEffect(() => {
    let cancelled = false;
    api
      .sharedCounts(id)
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, lastMessage]);

  useEffect(() => {
    let cancelled = false;
    api
      .shared(id, tab)
      .then((list) => {
        if (!cancelled) setItems((prev) => ({ ...prev, [tab]: list }));
      })
      .catch(() => {
        if (!cancelled) setItems((prev) => ({ ...prev, [tab]: prev[tab] ?? [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [id, tab, lastMessage]);

  if (!counts || !Object.values(counts).some(Boolean)) return null;
  // Until a tab's first answer arrives it shows a spinner; refreshes keep the old list on screen.
  const loading = items[tab] === undefined;
  const list = items[tab] ?? [];

  return (
    <View style={{ gap: 14 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {TABS.map((x) => {
          const active = x.kind === tab;
          return (
            <Pressable
              key={x.kind}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setTab(x.kind);
                setExpanded(false);
              }}
              style={({ hovered }: any) => ({
                paddingBottom: 8,
                marginBottom: -1,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.amber : 'transparent',
                opacity: hovered && !active ? 0.8 : 1,
              })}>
              <T variant="labelLg" color={active ? colors.amberText : colors.textMuted}>
                {`${t(x.label)} (${num(counts[x.kind])})`}
              </T>
            </Pressable>
          );
        })}
      </View>

      {loading && !list.length ? (
        <ActivityIndicator color={colors.amber} style={{ paddingVertical: 16 }} />
      ) : !list.length ? (
        <T variant="bodySm" color={colors.textDim} style={{ paddingVertical: 8 }}>
          {t('Nothing shared here yet')}
        </T>
      ) : tab === 'media' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {!!tile && (expanded ? list : list.slice(0, PREVIEW)).map((m, index) => {
            const a = m.attachment;
            if (!a) return null;
            const more = !expanded && index === PREVIEW - 1 && counts.media > PREVIEW;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={more ? t('Show all') : a.name}
                onPress={() => {
                  if (more) setExpanded(true);
                  else if (a.url) setViewing({ media: { url: a.url, name: a.name, mimeType: a.mimeType }, messageId: m.id });
                }}
                style={{ width: tile, height: tile, borderRadius: radius.md + 2, overflow: 'hidden', backgroundColor: colors.surfaceHigh }}>
                {a.expired || !a.url ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="clock" size={18} color={colors.textDim} />
                  </View>
                ) : a.mimeType.startsWith('video/') ? (
                  <View style={{ flex: 1 }}>
                    {Platform.OS === 'web' && <VideoThumb url={a.url} />}
                    <View
                      style={{
                        position: 'absolute',
                        end: 6,
                        bottom: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Icon name="play" size={11} color="#fff" />
                    </View>
                  </View>
                ) : (
                  <Image source={attachmentSource(a.url)} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                )}
                {more && (
                  <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10,13,20,0.62)', alignItems: 'center', justifyContent: 'center' }}>
                    <T variant="headlineSm" color="#fff">{`+${num(counts.media - PREVIEW + 1)}`}</T>
                  </View>
                )}
                {/* The Files tab has an eye in every row; media tiles get one too, so a photo can be
                    found in the chat again. */}
                {!more && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Show in chat')}
                    onPress={() => showInChat(m.id)}
                    style={{ position: 'absolute', top: 4, start: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,13,20,0.6)' }}>
                    <Icon name="eye" size={13} color="#fff" />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : tab === 'links' ? (
        <View style={{ gap: 6 }}>
          {list.map((m) => {
            const url = URL_RE.exec(m.body)?.[0] ?? '';
            return (
              // The row's main part opens the link; the button beside it scrolls the chat (no button inside a link).
              <View key={m.id} style={[rowStyle(), { paddingVertical: 0, paddingStart: 0 }]}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={url}
                  onPress={() => {
                    if (url) void Linking.openURL(url);
                  }}
                  style={({ hovered }: any) => ({
                    flex: 1,
                    minWidth: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: radius.lg,
                    backgroundColor: hovered ? colors.surfaceHigh : 'transparent',
                  })}>
                  <View style={iconTile()}>
                    <Icon name="link-2" size={18} color={colors.amberText} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T variant="labelLg" numberOfLines={1}>
                      {hostOf(url)}
                    </T>
                    <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                      {`${url} · ${shortTime(m.createdAt)}`}
                    </T>
                  </View>
                </Pressable>
                <ShowInChat onPress={() => showInChat(m.id)} />
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {list.map((m) => {
            const a = m.attachment;
            if (!a) return null;
            const voice = a.mimeType.startsWith('audio/') && !!a.waveform;
            return (
              <View key={m.id} style={rowStyle()}>
                <View style={iconTile()}>
                  <Icon name={voice ? 'mic' : fileIcon(a.mimeType)} size={18} color={colors.amberText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T variant="labelLg" numberOfLines={1}>
                    {voice ? t('Voice message') : a.name}
                  </T>
                  <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                    {a.expired ? t('File expired') : `${bytes(a.size)} · ${shortTime(m.createdAt)}`}
                  </T>
                </View>
                <ShowInChat onPress={() => showInChat(m.id)} />
                {!a.expired && !!a.url && (
                  <IconButton
                    name="download"
                    label={t('Download')}
                    onPress={() => void openAttachment(a.url!, a.name, a.mimeType).catch(() => {})}
                    size={34}
                    iconSize={17}
                    color={colors.textMuted}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
      <MediaViewer
        media={viewing?.media ?? null}
        onClose={() => setViewing(null)}
        onShowInChat={viewing ? () => showInChat(viewing.messageId) : undefined}
      />
    </View>
  );
}

/** Scrolls the chat to the message this row came from. */
function ShowInChat({ onPress }: { onPress: () => void }) {
  return (
    <Tooltip label={t('Show in chat')}>
      <IconButton name="eye" label={t('Show in chat')} onPress={onPress} size={34} iconSize={17} color={colors.textMuted} />
    </Tooltip>
  );
}

// Functions, not constants: the palette is swapped in place when the theme changes.
const rowStyle = () => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 12,
  padding: 10,
  borderRadius: radius.lg,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
});
const iconTile = () => ({
  width: 40,
  height: 40,
  borderRadius: radius.md + 2,
  backgroundColor: colors.amberTint,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});
