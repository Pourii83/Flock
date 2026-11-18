// Changing the theme, accent or language remounts the whole app to repaint it. Settings remembers
// where it was scrolled so the page comes back to the same spot instead of jumping to the top.
//
// On the web the remount also has a moment where the fresh navigator is hidden while it returns to
// Settings. To make the change look instant, a frozen copy of the page stays on screen until the new
// page is back at its old scroll position, then it is removed in one frame.
import { Platform } from 'react-native';

let offset = 0;
/** The offset at the moment of the change: the old page reports 0 while it is torn down, so the live value can't be trusted. */
let restoreOffset = 0;
let restoreUntil = 0;
let frozen: HTMLElement | null = null;
let thawTimer: ReturnType<typeof setTimeout> | null = null;

export const rememberSettingsScroll = (y: number) => {
  offset = y;
};

/** Keeps a picture of the current page on top while the app remounts underneath (web only). */
function freeze() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;
  thaw();
  revealed = false;
  pageReady = false;
  const copy = root.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  // Same box as #root (index.html styles it by id, which the copy can't keep), pinned on top.
  copy.style.cssText = 'position:fixed;inset:0;display:flex;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(copy);
  // cloneNode doesn't carry scroll positions: copy them so the picture matches what was on screen.
  const from = root.querySelectorAll<HTMLElement>('*');
  const to = copy.querySelectorAll<HTMLElement>('*');
  from.forEach((el, i) => {
    const twin = to[i];
    if (twin && (el.scrollTop || el.scrollLeft)) {
      twin.scrollTop = el.scrollTop;
      twin.scrollLeft = el.scrollLeft;
    }
  });
  frozen = copy;
  // Never leave the picture up if the new page doesn't report back.
  thawTimer = setTimeout(thaw, 1500);
}

// The picture goes away once the app is visible again and, on Settings, back at its old spot.
let revealed = false;
let pageReady = false;

/** The remounted app is visible again; `onSettings`: Settings will report when it has scrolled back. */
export function appRevealed(onSettings: boolean) {
  revealed = true;
  if (!onSettings || pageReady) thaw();
}

/** Settings is back at its old scroll position. */
export function settingsRestored() {
  pageReady = true;
  if (revealed) thaw();
}

/** Removes the picture (after the next paint, so the new page is already drawn under it). */
function thaw() {
  if (thawTimer) clearTimeout(thawTimer);
  thawTimer = null;
  const copy = frozen;
  frozen = null;
  if (!copy) return;
  requestAnimationFrame(() => requestAnimationFrame(() => copy.remove()));
}

/** Call right before an action that remounts the app. */
export const markRemount = () => {
  restoreOffset = offset;
  restoreUntil = Date.now() + 4000;
  freeze();
};

/** Where to scroll a freshly mounted Settings page: the old offset right after a remount, else the top. */
export const settingsScrollToRestore = () => (Date.now() < restoreUntil ? restoreOffset : 0);
