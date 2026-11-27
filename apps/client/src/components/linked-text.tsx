import { Linking, Platform, Text, type TextProps } from 'react-native';

import { contentDirection, T } from './ui';

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
  ...rest
}: Omit<TextProps, 'children'> & {
  children: string;
  color?: string;
  linkColor?: string;
  variant?: TypeVariant;
  /** Tint behind a ```code``` block; it has to read on the bubble's own background. */
  codeBackground?: string;
  codeColor?: string;
}) {
  // Fenced code is cut out first, so links inside it stay plain text.
  const segments: { text: string; code: boolean }[] = [];
  let cut = 0;
  for (const match of children.matchAll(CODE_RE)) {
    if (match.index > cut) segments.push({ text: children.slice(cut, match.index), code: false });
    segments.push({ text: match[1].replace(/^\n/, '').replace(/\n$/, ''), code: true });
    cut = match.index + match[0].length;
  }
  if (cut < children.length) segments.push({ text: children.slice(cut), code: false });

  const direction = contentDirection(children);
  const codeStyle = {
    ...monoFont,
    fontSize: 13.5,
    lineHeight: 20,
    backgroundColor: codeBackground ?? 'rgba(127,127,127,0.16)',
    color: codeColor ?? color,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  };

  return (
    <T variant={variant} color={color} {...({ dataSet: direction.dataSet } as object)} style={[wrapAnywhere, direction.style, style]} {...rest}>
      {segments.map((segment, i) => {
        if (segment.code) {
          return (
            <Text key={`code-${i}`} style={codeStyle}>
              {`\n${segment.text}\n`}
            </Text>
          );
        }
        // Plain text keeps its links clickable.
        const parts: { text: string; url: boolean }[] = [];
        let last = 0;
        for (const match of segment.text.matchAll(URL_RE)) {
          if (match.index > last) parts.push({ text: segment.text.slice(last, match.index), url: false });
          parts.push({ text: match[0], url: true });
          last = match.index + match[0].length;
        }
        if (last < segment.text.length) parts.push({ text: segment.text.slice(last), url: false });
        return parts.map((part, j) =>
          part.url ? (
            <Text
              key={`${i}-${j}`}
              onPress={() => openUrl(part.text)}
              accessibilityRole="link"
              style={[{ color: linkColor ?? color, textDecorationLine: 'underline' }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null]}>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        );
      })}
    </T>
  );
}
