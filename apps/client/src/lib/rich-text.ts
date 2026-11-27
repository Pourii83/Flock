// Telegram-style text formatting, sent as plain text with markers and drawn by the client:
// **bold**, __italic__, ~~strikethrough~~, ||spoiler|| and `monospace` (```code``` blocks are handled
// separately, in LinkedText). A marker only counts when it closes later in the text and the text
// inside it doesn't start or end with a space, so a lone ** or a "2 ** 3" stays as typed.

export type InlineKind = 'bold' | 'italic' | 'strike' | 'spoiler';
export type Inline = { kind: 'text'; text: string } | { kind: 'mono'; text: string } | { kind: InlineKind; children: Inline[] };

export const INLINE_MARKERS: readonly { marker: string; kind: InlineKind | 'mono' }[] = [
  { marker: '**', kind: 'bold' },
  { marker: '__', kind: 'italic' },
  { marker: '~~', kind: 'strike' },
  { marker: '||', kind: 'spoiler' },
  { marker: '`', kind: 'mono' },
];

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  let i = 0;
  while (i < source.length) {
    let taken = false;
    for (const { marker, kind } of INLINE_MARKERS) {
      if (!source.startsWith(marker, i)) continue;
      const start = i + marker.length;
      const end = source.indexOf(marker, start);
      if (end <= start) continue;
      const inner = source.slice(start, end);
      if (/^\s|\s$/.test(inner) || (kind === 'mono' && inner.includes('\n'))) continue;
      if (plain) out.push({ kind: 'text', text: plain });
      plain = '';
      out.push(kind === 'mono' ? { kind, text: inner } : { kind, children: parseInline(inner) });
      i = end + marker.length;
      taken = true;
      break;
    }
    if (!taken) {
      plain += source[i];
      i += 1;
    }
  }
  if (plain) out.push({ kind: 'text', text: plain });
  return out;
}

export const hasInline = (source: string) => parseInline(source).some((node) => node.kind !== 'text');

/** The text without its markers, for one-line previews; a spoiler stays hidden. */
export function stripInline(source: string): string {
  const flat = (nodes: Inline[]): string =>
    nodes.map((node) => (node.kind === 'text' || node.kind === 'mono' ? node.text : node.kind === 'spoiler' ? '•••' : flat(node.children))).join('');
  return flat(parseInline(source));
}

/**
 * Wraps the selected part of a message in a marker, or takes the marker off when it is already
 * there. Returns the new text and the selection to restore (the same words).
 */
export function toggleMarker(text: string, start: number, end: number, marker: string): { text: string; start: number; end: number } {
  const m = marker.length;
  if (start >= m && text.slice(start - m, start) === marker && text.slice(end, end + m) === marker) {
    return { text: text.slice(0, start - m) + text.slice(start, end) + text.slice(end + m), start: start - m, end: end - m };
  }
  const selected = text.slice(start, end);
  if (selected.length > 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    return { text: text.slice(0, start) + selected.slice(m, -m) + text.slice(end), start, end: end - 2 * m };
  }
  // Spaces at the edges of the selection stay outside the markers, or they wouldn't count.
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const a = start + lead;
  const b = end - trail;
  if (b <= a) return { text, start, end };
  return { text: text.slice(0, a) + marker + text.slice(a, b) + marker + text.slice(b), start: a + m, end: b + m };
}
