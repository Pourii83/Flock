import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { getItem, setItem } from './lib/storage';

// Design tokens from the Stitch "Synchronous Flight" design system: the original dark palette and
// a light counterpart with the same roles. `colors` is swapped in place when the theme changes and
// the app root remounts (see ThemedApp in app/_layout.tsx), so components just read `colors.x`.
const dark = {
  canvas: '#0B0E14', // L0 deep space
  rail: '#121721', // L2 navigation / floating
  surface: '#161D2A', // L1 containers
  surfaceHigh: '#1A2130', // hover / inset borders
  surfaceHighest: '#232B3B',
  border: 'rgba(26, 33, 48, 0.9)',
  hairline: 'rgba(248, 250, 252, 0.08)',
  hover: 'rgba(22, 29, 42, 0.6)',
  /** Translucent bars over content: mobile headers, composer, tab bar. */
  bar: 'rgba(18, 23, 33, 0.92)',
  barDeep: 'rgba(11, 14, 20, 0.96)',
  /** Floating glass chips and panels (call screen). */
  glass: 'rgba(18, 23, 33, 0.75)',
  panel: 'rgba(18, 23, 33, 0.97)',
  scrim: 'rgba(0, 0, 0, 0.55)',
  bubble: '#202838',

  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textDim: '#64748B',

  amber: '#FFB84D',
  amberSoft: '#FFDCB0',
  amberGlow: 'rgba(255, 184, 77, 0.25)',
  amberTint: 'rgba(255, 184, 77, 0.12)',
  /** Accent used as text or icon color on a plain surface. */
  amberText: '#FFB84D',
  /** Soft accent used for secondary text. */
  amberSoftText: '#FFDCB0',
  onAmber: '#3D2600',
  onAmberMuted: '#72521B',

  online: '#10B981',
  accept: '#22C55E',
  teal: '#4EDEA3',
  tealTint: 'rgba(78, 222, 163, 0.12)',
  danger: '#EF4444',
  dangerDeep: '#93000A',
  dangerTint: 'rgba(239, 68, 68, 0.14)',
  dangerText: '#FF8A80',
};

export type Palette = typeof dark;
export type ThemeMode = 'dark' | 'light';

const light: Palette = {
  canvas: '#F5F6FA',
  rail: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceHigh: '#EDF0F5',
  surfaceHighest: '#E1E6EE',
  border: 'rgba(15, 23, 42, 0.08)',
  hairline: 'rgba(15, 23, 42, 0.10)',
  hover: 'rgba(15, 23, 42, 0.04)',
  bar: 'rgba(255, 255, 255, 0.94)',
  barDeep: 'rgba(245, 246, 250, 0.96)',
  glass: 'rgba(255, 255, 255, 0.82)',
  panel: 'rgba(255, 255, 255, 0.98)',
  scrim: 'rgba(15, 23, 42, 0.35)',
  bubble: '#FFFFFF',

  text: '#0F172A',
  textMuted: '#556173',
  textDim: '#8390A3',

  amber: '#FFB84D',
  amberSoft: '#FFE3BC',
  amberGlow: 'rgba(245, 158, 11, 0.22)',
  amberTint: 'rgba(245, 158, 11, 0.14)',
  amberText: '#B26A00',
  amberSoftText: '#7A5418',
  onAmber: '#3D2600',
  onAmberMuted: '#7A5418',

  online: '#059669',
  accept: '#16A34A',
  teal: '#0F9F76',
  tealTint: 'rgba(15, 159, 118, 0.12)',
  danger: '#DC2626',
  dangerDeep: '#B91C1C',
  dangerTint: 'rgba(220, 38, 38, 0.10)',
  dangerText: '#FFFFFF',
};

const PALETTES: Record<ThemeMode, Palette> = { dark, light };
export const colors: Palette = { ...dark };

let mode: ThemeMode = 'dark';
const listeners = new Set<() => void>();
export const getThemeMode = () => mode;
export const onThemeChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Swaps every color token; the app root is keyed by the mode so everything re-renders. */
export function applyTheme(next: ThemeMode) {
  if (next === mode) return;
  mode = next;
  Object.assign(colors, PALETTES[next]);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.style.colorScheme = next;
    document.body.style.backgroundColor = colors.canvas;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.canvas);
    // Scrollbars are styled in public/index.html for the dark theme.
    let sheet = document.getElementById('flock-theme') as HTMLStyleElement | null;
    if (!sheet) {
      sheet = document.createElement('style');
      sheet.id = 'flock-theme';
      document.head.appendChild(sheet);
    }
    sheet.textContent = `html, body { background-color: ${colors.canvas}; }
      ::-webkit-scrollbar-thumb { background: ${colors.surfaceHighest}; border-color: ${colors.canvas}; }`;
  }
  listeners.forEach((fn) => fn());
}

/** What the user picked in Settings; 'system' follows the device. */
export type ThemePreference = ThemeMode | 'system';
const THEME_KEY = 'flock.theme';
let preference: ThemePreference = 'dark';
const resolve = (p: ThemePreference): ThemeMode => (p === 'system' ? (Appearance.getColorScheme() === 'light' ? 'light' : 'dark') : p);
export const getThemePreference = () => preference;

export async function loadTheme() {
  const saved = (await getItem(THEME_KEY)) as ThemePreference | null;
  if (saved === 'dark' || saved === 'light' || saved === 'system') preference = saved;
  applyTheme(resolve(preference));
  Appearance.addChangeListener(() => {
    if (preference === 'system') applyTheme(resolve('system'));
  });
}

export async function setThemePreference(next: ThemePreference) {
  preference = next;
  applyTheme(resolve(next));
  listeners.forEach((fn) => fn());
  await setItem(THEME_KEY, next);
}

/** Re-renders on theme changes; the app root is keyed by the mode. */
export function useThemeMode() {
  return useSyncExternalStore(onThemeChange, getThemeMode, getThemeMode);
}

export const radius = { sm: 4, md: 8, lg: 16, xl: 24, pill: 9999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// On web the browser falls back per glyph, so Persian inside English UI (messages, names, the
// composer) is drawn in Vazirmatn instead of the system's Arabic font. The value is a CSS
// font-family list: comma-separated, family names are plain identifiers (no spaces, so no quotes
// needed), and a generic family ends it. Native takes a single family name, so it stays as is.
const withFa = (latin: string, fa: string) => (Platform.OS === 'web' ? `${latin}, ${fa}, sans-serif` : latin);

export const fonts = {
  regular: withFa('Inter_400Regular', 'Vazirmatn_400Regular'),
  medium: withFa('Inter_500Medium', 'Vazirmatn_500Medium'),
  semibold: withFa('Inter_600SemiBold', 'Vazirmatn_600SemiBold'),
  bold: withFa('Inter_700Bold', 'Vazirmatn_700Bold'),
};

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 44, lineHeight: 52, letterSpacing: -0.9 },
  headline: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  headlineSm: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  labelLg: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  labelSm: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.33 },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
} as const;

export type TypeVariant = keyof typeof type;

/** Width at which the app switches to the desktop 3-column layout. */
export const WIDE_BREAKPOINT = 900;
