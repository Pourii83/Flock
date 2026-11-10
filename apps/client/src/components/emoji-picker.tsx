// Full emoji picker: search, category tabs, recents. The dataset comes from Unicode's
// emoji-test.txt (see lib/emoji.ts) and covers every fully-qualified emoji (including flags).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type TextInputInstance,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

import { EMOJI_ALIASES, EMOJI_CATEGORY_TABS, EMOJI_GROUPS, EMOJI_NAMES, type EmojiCategoryId } from '@/lib/emoji';
import { t } from '@/lib/i18n';
import { getItem, setItem } from '@/lib/storage';
import { colors, fonts, radius } from '@/theme';
import { Icon, T, Tooltip, noOutline, persianFont } from './ui';

const RECENT_KEY = 'flock.emoji.recent';
const MAX_RECENT = 24;
const COLUMNS = 8;
const HEADER_H = 32;

type Row = { key: string; header?: string; emojis?: string[] };

const ALL: { emoji: string; haystack: string }[] = EMOJI_GROUPS.flatMap((group) =>
  group.emojis.map((emoji) => ({
    emoji,
    haystack: `${EMOJI_NAMES[emoji] ?? ''} ${EMOJI_ALIASES[emoji] ?? ''} ${group.name}`.toLowerCase(),
  })),
);

const chunk = (list: string[], size: number, prefix: string): Row[] => {
  const rows: Row[] = [];
  for (let i = 0; i < list.length; i += size) rows.push({ key: `${prefix}-${i}`, emojis: list.slice(i, i + size) });
  return rows;
};

const categoryRows = (recents: string[]): Row[] => {
  const rows: Row[] = [];
  if (recents.length) {
    rows.push({ key: 'header-recent', header: t('Recent') });
    rows.push(...chunk(recents, COLUMNS, 'recent'));
  }
  for (const group of EMOJI_GROUPS) {
    rows.push({ key: `header-${group.id}`, header: t(group.name) });
    rows.push(...chunk(group.emojis, COLUMNS, group.id));
  }
  return rows;
};

export function EmojiPicker({
  onPick,
  onClose,
  closeOnPick = false,
  autoFocus = false,
  maxHeight = 264,
  style,
}: {
  onPick: (emoji: string) => void;
  onClose?: () => void;
  /** Close after a pick (used when the picker reacts to a message). */
  closeOnPick?: boolean;
  autoFocus?: boolean;
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [active, setActive] = useState<EmojiCategoryId>('smileys');
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<Row>>(null);
  const searchRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    let mounted = true;
    void getItem(RECENT_KEY).then((raw) => {
      if (!mounted || !raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecents(parsed.filter((e): e is string => typeof e === 'string').slice(0, MAX_RECENT));
      } catch {
        // Ignore a corrupt recents list.
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panelWidth = width || 336;
  const gridWidth = Math.max(200, panelWidth - 20);
  const cell = Math.floor(gridWidth / COLUMNS);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const matches = ALL.filter((entry) => entry.haystack.includes(q)).map((entry) => entry.emoji);
      return matches.length ? chunk(matches, COLUMNS, 'search') : [];
    }
    return categoryRows(recents);
  }, [query, recents]);

  // Fixed row heights let the list scroll to a category tab without measuring.
  const layout = useMemo(() => {
    const offsets: number[] = [];
    let top = 0;
    for (const row of rows) {
      offsets.push(top);
      top += row.header ? HEADER_H : cell;
    }
    return { offsets, length: top };
  }, [rows, cell]);

  const pick = (emoji: string) => {
    const next = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    setRecents(next);
    void Promise.resolve(setItem(RECENT_KEY, JSON.stringify(next))).catch(() => {});
    onPick(emoji);
    if (closeOnPick) onClose?.();
  };

  const scrollToCategory = (id: EmojiCategoryId) => {
    setActive(id);
    setQuery('');
    const index = rows.findIndex((row) => row.key === `header-${id}`);
    if (index >= 0) listRef.current?.scrollToOffset({ offset: layout.offsets[index] ?? 0, animated: true });
  };

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        {
          width: '100%',
          maxWidth: 380,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.surfaceHigh,
          padding: 10,
          gap: 8,
        },
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 38,
            backgroundColor: colors.canvas,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            paddingHorizontal: 10,
          }}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search emoji')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[
              { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.regular, fontSize: 14, height: '100%' },
              noOutline,
              persianFont(query || t('Search emoji'), [{ fontFamily: fonts.regular }]),
            ]}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} accessibilityLabel={t('Clear search')} hitSlop={6}>
              <Icon name="x" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        {!!onClose && (
          <Tooltip label={t('Close')}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('Close')}
              style={({ hovered, pressed }: any) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed || hovered ? colors.surfaceHigh : 'transparent',
              })}>
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          </Tooltip>
        )}
      </View>
      {!query && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={{ maxHeight: 36 }}>
          {EMOJI_CATEGORY_TABS.map((tab) => {
            const selected = active === tab.id && !query;
            return (
              <Tooltip key={tab.id} label={t(tab.name)}>
                <Pressable
                  onPress={() => scrollToCategory(tab.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t(tab.name)}
                  style={({ hovered, pressed }: any) => ({
                    width: 34,
                    height: 34,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.amberTint : pressed || hovered ? colors.surfaceHigh : 'transparent',
                    borderWidth: 1,
                    borderColor: selected ? colors.amber : 'transparent',
                  })}>
                  <T style={{ fontSize: 17, lineHeight: 22 }}>{tab.icon}</T>
                </Pressable>
              </Tooltip>
            );
          })}
        </ScrollView>
      )}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        style={{ maxHeight }}
        contentContainerStyle={{ paddingBottom: 4 }}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, index) => ({
          length: rows[index]?.header ? HEADER_H : cell,
          offset: layout.offsets[index] ?? 0,
          index,
        })}
        onScrollToIndexFailed={() => {
          // Rows are fixed-height so this should not happen; retry once after layout settles.
          setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 50);
        }}
        ListEmptyComponent={
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <T variant="bodySm" color={colors.textMuted}>
              {t('No emoji found.')}
            </T>
          </View>
        }
        renderItem={({ item }) =>
          item.header ? (
            <View style={{ height: HEADER_H, justifyContent: 'center', paddingHorizontal: 4 }}>
              <T variant="labelSm" color={colors.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {item.header}
              </T>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', height: cell }}>
              {(item.emojis ?? []).map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => pick(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={EMOJI_NAMES[emoji] ?? emoji}
                  style={({ hovered, pressed }: any) => ({
                    width: cell,
                    height: cell,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.surfaceHighest : hovered ? colors.surfaceHigh : 'transparent',
                  })}>
                  <T style={{ fontSize: Math.round(cell * 0.58), lineHeight: Math.round(cell * 0.72) }}>{emoji}</T>
                </Pressable>
              ))}
            </View>
          )
        }
      />
    </View>
  );
}

/** Centered dialog version, used by the message menu's "+" button. */
export function EmojiPickerModal({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onPress={onClose}
        accessibilityLabel={t('Close')}>
        <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: '84%' }}>
          <EmojiPicker onPick={onPick} onClose={onClose} closeOnPick autoFocus maxHeight={320} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
