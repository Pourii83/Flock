import { Linking, Platform, Text, type TextProps } from 'react-native';

import { contentDirection, T } from './ui';

type TypeVariant = NonNullable<Parameters<typeof T>[0]['variant']>;

// http(s) links and bare www. hosts; trailing punctuation stays outside the link.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

/** Long unbroken strings (URLs, hashes) must wrap inside the bubble instead of overflowing it. */
const wrapAnywhere = Platform.OS === 'web' ? ({ overflowWrap: 'anywhere', wordBreak: 'break-word' } as object) : null;

function openUrl(raw: string) {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else void Linking.openURL(url);
}

/** Message text with clickable links that never overflows its container. */
export function LinkedText({
  children,
  color,
  linkColor,
  variant = 'body',
  style,
  ...rest
}: Omit<TextProps, 'children'> & { children: string; color?: string; linkColor?: string; variant?: TypeVariant }) {
  const parts: { text: string; url: boolean }[] = [];
  let last = 0;
  for (const match of children.matchAll(URL_RE)) {
    if (match.index > last) parts.push({ text: children.slice(last, match.index), url: false });
    parts.push({ text: match[0], url: true });
    last = match.index + match[0].length;
  }
  if (last < children.length) parts.push({ text: children.slice(last), url: false });
  const direction = contentDirection(children);

  return (
    <T variant={variant} color={color} {...({ dataSet: direction.dataSet } as object)} style={[wrapAnywhere, direction.style, style]} {...rest}>
      {parts.map((part, i) =>
        part.url ? (
          <Text
            key={i}
            onPress={() => openUrl(part.text)}
            accessibilityRole="link"
            style={[{ color: linkColor ?? color, textDecorationLine: 'underline' }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null]}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </T>
  );
}
