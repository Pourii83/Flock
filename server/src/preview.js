// One line of a message for notifications, the same as the client's plainPreview (lib/system-message.ts +
// lib/rich-text.ts): ```code``` fences and **bold**, __italic__, ~~strike~~, `mono` lose their marks, and a
// ||spoiler|| stays hidden as •••. Keep the two in step.

const MARKERS = [
  ['**', 'wrap'],
  ['__', 'wrap'],
  ['~~', 'wrap'],
  ['||', 'spoiler'],
  ['`', 'mono'],
];

function stripInline(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    let taken = false;
    for (const [marker, kind] of MARKERS) {
      if (!source.startsWith(marker, i)) continue;
      const start = i + marker.length;
      const end = source.indexOf(marker, start);
      if (end <= start) continue;
      const inner = source.slice(start, end);
      if (/^\s|\s$/.test(inner) || (kind === 'mono' && inner.includes('\n'))) continue;
      out += kind === 'spoiler' ? '•••' : kind === 'mono' ? inner : stripInline(inner);
      i = end + marker.length;
      taken = true;
      break;
    }
    if (!taken) {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

export function plainPreview(body) {
  const unfenced = String(body ?? '')
    .replace(/```(?:[A-Za-z0-9+#._-]{1,20}\n)?([\s\S]*?)```/g, (_, code) => ` ${code.trim()} `)
    .replace(/```/g, '');
  return stripInline(unfenced).replace(/\s+/g, ' ').trim();
}
