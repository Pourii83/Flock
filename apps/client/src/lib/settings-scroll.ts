// Changing the theme, accent or language remounts the whole app to repaint it. Settings remembers
// where it was scrolled so the page comes back to the same spot instead of jumping to the top.
let offset = 0;
let restoreUntil = 0;

export const rememberSettingsScroll = (y: number) => {
  offset = y;
};

/** Call right before an action that remounts the app. */
export const markRemount = () => {
  restoreUntil = Date.now() + 4000;
};

/** Where to scroll a freshly mounted Settings page: the old offset right after a remount, else the top. */
export const settingsScrollToRestore = () => (Date.now() < restoreUntil ? offset : 0);
