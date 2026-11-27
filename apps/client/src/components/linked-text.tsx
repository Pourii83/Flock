import * as Clipboard from 'expo-clipboard';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, View, type TextProps, type TextStyle } from 'react-native';

import { t } from '@/lib/i18n';
import { parseInline, type Inline } from '@/lib/rich-text';
import { fonts, radius } from '@/theme';

import { contentDirection, IconButton, persianFont, T } from './ui';

type TypeVariant = NonNullable<Parameters<typeof T>[0]['variant']>;

// http(s) links and bare www. hosts; trailing punctuation stays outside the link.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

/** ```fenced``` blocks: sent as plain text, shown as code (other messengers do the same). */
const CODE_RE = /```([\s\S]*?)```/g;

/** Long unbroken strings (URLs, hashes) must wrap inside the bubble instead of overflowing it. */
const wrapAnywhere = Platform.OS === 'web' ? ({ overflowWrap: 'anywhere', wordBreak: 'break-word' } as object) : null;

const monoFont =
  Platform.OS === 'web'
    ? ({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } as object)
    : ({ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' } as object);

function openUrl(raw: string) {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else void Linking.openURL(url);
}

/** Message text with clickable links and code blocks that never overflow their container. */
export function LinkedText({
  children,
  color,
  linkColor,
  variant = 'body',
  style,
  codeBackground,
  codeColor,
  mark,
  markColor,
  ...rest
}: Omit<TextProps, 'children'> & {
  children: string;
  color?: string;
  linkColor?: string;
  variant?: TypeVariant;
  /** Tint behind a ```code``` block; it has to read on the bubble's own background. */
  codeBackground?: string;
  codeColor?: string;
  /** Words to tint for a moment (the part a reply quoted, after jumping to it). */
  mark?: string;
  markColor?: string;
}) {
  // Fenced code is cut out first, so links inside it stay plain text.
  const segments: { text: string; code: boolean }[] = [];
  let cut = 0;
  for (const match of children.matchAll(CODE_RE)) {
    if (match.index > cut) segments.push({ text: children.slice(cut, match.index), code: false });
    // Kept raw: a word right after the opening fence (```js) is the language; CodeBlock trims the rest.
    segments.push({ text: match[1], code: true });
    cut = match.index + match[0].length;
  }
  if (cut < children.length) segments.push({ text: children.slice(cut), code: false });

  const direction = contentDirection(children);
  const links = (text: string, key: string) => {
    // Plain text keeps its links clickable.
    const parts: { text: string; url: boolean }[] = [];
    let last = 0;
    for (const match of text.matchAll(URL_RE)) {
      if (match.index > last) parts.push({ text: text.slice(last, match.index), url: false });
      parts.push({ text: match[0], url: true });
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), url: false });
    return parts.map((part, j) =>
      part.url ? (
        <Text
          key={`${key}-${j}`}
          onPress={() => openUrl(part.text)}
          accessibilityRole="link"
          style={[{ color: linkColor ?? color, textDecorationLine: 'underline' }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null]}>
          {part.text}
        </Text>
      ) : (
        part.text
      ),
    );
  };

  // The quoted words, if this text holds them, get a tint over their own run; the rest keeps its links.
  const marked = (text: string, key: string) => {
    const at = mark ? text.indexOf(mark) : -1;
    if (!mark || at < 0) return links(text, key);
    return [
      ...links(text.slice(0, at), `${key}-a`),
      <Text key={`${key}-mark`} style={[{ backgroundColor: markColor ?? 'rgba(255,184,77,0.45)', borderRadius: 4 }, Platform.OS === 'web' ? ({ transition: 'background-color 400ms ease' } as object) : null]}>
        {mark}
      </Text>,
      ...links(text.slice(at + mark.length), `${key}-b`),
    ];
  };

  // **bold**, __italic__, ~~strike~~, ||spoiler|| and `mono`, like Telegram (user request); the plain
  // runs inside them keep their links and the quote tint.
  const rich = (text: string, key: string): ReturnType<typeof marked> => {
    const draw = (nodes: Inline[], prefix: string): ReturnType<typeof marked> =>
      nodes.flatMap((node, j) => {
        const k = `${prefix}-${j}`;
        if (node.kind === 'text') return marked(node.text, k);
        if (node.kind === 'mono')
          return [
            <Text key={k} style={[monoFont, { fontSize: 14, backgroundColor: codeBackground ?? 'rgba(127,127,127,0.16)', color: codeColor ?? color, borderRadius: 4 }]}>
              {Platform.OS === 'web' ? node.text : ` ${node.text} `}
            </Text>,
          ];
        if (node.kind === 'spoiler') return [<Spoiler key={k} color={color}>{draw(node.children, k)}</Spoiler>];
        const look: TextStyle =
          node.kind === 'bold'
            ? { fontFamily: fonts.bold, ...(persianFont(text, { fontFamily: fonts.bold }) ?? {}) }
            : node.kind === 'italic'
              ? { fontStyle: 'italic' }
              : { textDecorationLine: 'line-through' };
        return [
          <Text key={k} style={look}>
            {draw(node.children, k)}
          </Text>,
        ];
      });
    return draw(parseInline(text), key);
  };

  if (!segments.some((segment) => segment.code)) {
    return (
      <T variant={variant} color={color} {...({ dataSet: direction.dataSet } as object)} style={[wrapAnywhere, direction.style, style]} {...rest}>
        {rich(children, 'text')}
      </T>
    );
  }

  // Code turns the message into blocks: the text around it as paragraphs, each fence as its own box
  // with a copy button (user request; inline it broke up and ran the wrong way in RTL text).
  // Padding (a framed caption) belongs to the whole column, not to each paragraph.
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { padding, paddingHorizontal, paddingVertical, paddingTop, paddingBottom, paddingStart, paddingEnd, paddingLeft, paddingRight, ...textStyle } = flat;
  const box = { padding, paddingHorizontal, paddingVertical, paddingTop, paddingBottom, paddingStart, paddingEnd, paddingLeft, paddingRight };
  return (
    <View style={[{ gap: 6, alignSelf: 'stretch' }, box]}>
      {segments.map((segment, i) => {
        if (segment.code) return <CodeBlock key={`code-${i}`} code={segment.text} background={codeBackground} color={codeColor ?? color} selectable={rest.selectable} />;
        const text = segment.text.replace(/^\n+/, '').replace(/\n+$/, '');
        if (!text.trim()) return null;
        const own = contentDirection(text);
        return (
          <T key={`text-${i}`} variant={variant} color={color} {...({ dataSet: own.dataSet } as object)} style={[wrapAnywhere, own.style, textStyle]} {...rest}>
            {rich(text, `text-${i}`)}
          </T>
        );
      })}
    </View>
  );
}

/** ||Hidden|| text: covered until tapped, like Telegram's spoilers. */
function Spoiler({ children, color }: { children: ReactNode; color?: string }) {
  const [open, setOpen] = useState(false);
  // Web: Telegram's look, a cloud of drifting dots over the hidden words that dissolves when tapped
  // (user request; styled in theme.ts). The dots are light on dark text backgrounds and dark on light, and
  // keep their tone while they scatter (open-light / open-dark).
  if (Platform.OS === 'web') {
    return (
      <Text
        onPress={open ? undefined : () => setOpen(true)}
        accessibilityRole={open ? undefined : 'button'}
        accessibilityLabel={open ? undefined : t('Show hidden text')}
        {...({ dataSet: { spoiler: `${open ? 'open-' : ''}${isLight(color) ? 'light' : 'dark'}` } } as object)}>
        {children}
      </Text>
    );
  }
  if (open) return <Text>{children}</Text>;
  return (
    <Text
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={t('Show hidden text')}
      style={{ color: 'transparent', backgroundColor: color ?? '#94A3B8', borderRadius: 4, opacity: 0.35 }}>
      {children}
    </Text>
  );
}

/** Whether a text color is light (so it sits on a dark background). */
function isLight(color?: string) {
  const hex = /^#([0-9a-f]{6})/i.exec(color ?? '')?.[1];
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color ?? '');
  const [r, g, b] = hex ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) : rgb ? [rgb[1], rgb[2], rgb[3]].map(Number) : [248, 250, 252];
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/** A ```fenced``` block: its own box, always left-to-right, with a copy button in its header. A first
 *  line that is only a word (```js) is read as the language, as other messengers do. */
function CodeBlock({ code, background, color, selectable }: { code: string; background?: string; color?: string; selectable?: boolean | null }) {
  const lang = /^([A-Za-z0-9+#._-]{1,20})\n/.exec(code);
  const body = (lang ? code.slice(lang[0].length) : code).replace(/^\n/, '').replace(/\n$/, '');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  const tint = background ?? 'rgba(127,127,127,0.16)';
  return (
    <View style={{ alignSelf: 'stretch', minWidth: 200, borderRadius: radius.md, overflow: 'hidden', backgroundColor: tint }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingStart: 10, paddingEnd: 2, height: 30, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(127,127,127,0.25)' }}>
        <T variant="labelSm" color={color} style={{ flex: 1, opacity: 0.7, ...(monoFont as object) }} numberOfLines={1}>
          {lang ? lang[1] : t('Code')}
        </T>
        <IconButton
          name={copied ? 'check' : 'copy'}
          label={copied ? t('Copied') : t('Copy code')}
          size={28}
          iconSize={14}
          color={color}
          onPress={() => {
            void Clipboard.setStringAsync(body);
            setCopied(true);
          }}
        />
      </View>
      <Text
        selectable={selectable ?? undefined}
        style={[
          monoFont,
          wrapAnywhere,
          { color, fontSize: 13.5, lineHeight: 20, paddingHorizontal: 10, paddingVertical: 8, writingDirection: 'ltr', textAlign: 'left' },
          Platform.OS === 'web' ? ({ direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'pre-wrap' } as object) : null,
        ]}>
        {body}
      </Text>
    </View>
  );
}
