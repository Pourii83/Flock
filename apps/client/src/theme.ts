// Design tokens from the Stitch "Synchronous Flight" design system.
export const colors = {
  canvas: '#0B0E14', // L0 deep space
  rail: '#121721', // L2 navigation / floating
  surface: '#161D2A', // L1 containers
  surfaceHigh: '#1A2130', // hover / inset borders
  surfaceHighest: '#232B3B',
  border: 'rgba(26, 33, 48, 0.9)',
  hairline: 'rgba(248, 250, 252, 0.08)',

  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textDim: '#64748B',

  amber: '#FFB84D',
  amberSoft: '#FFDCB0',
  amberGlow: 'rgba(255, 184, 77, 0.25)',
  amberTint: 'rgba(255, 184, 77, 0.12)',
  onAmber: '#3D2600',

  online: '#10B981',
  accept: '#22C55E',
  teal: '#4EDEA3',
  tealTint: 'rgba(78, 222, 163, 0.12)',
  danger: '#EF4444',
  dangerDeep: '#93000A',
  dangerTint: 'rgba(239, 68, 68, 0.14)',
} as const;

export const radius = { sm: 4, md: 8, lg: 16, xl: 24, pill: 9999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

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
