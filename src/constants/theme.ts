// Design tokens — single source of truth for all visual constants
// Light theme — Android only

export const COLORS = {
  // ── App chrome ──
  background:    '#F5F7FA',   // light grey page bg
  surface:       '#FFFFFF',   // white surface
  surfaceRaised: '#F0F4F8',   // slightly off-white raised
  card:          '#FFFFFF',   // card white
  border:        '#E2E8F0',   // soft grey border
  borderSubtle:  '#EEF2F6',   // very subtle border

  // ── Solar palette ──
  gold:    '#F59E0B',   // solar amber – primary accent
  goldDim: '#D97706',
  amber:   '#FBBF24',

  // ── Energy flow ──
  generation: '#F59E0B',   // amber – generated
  directUse:  '#8B5CF6',   // violet – direct use
  import:     '#0EA5E9',   // sky blue – grid import
  export:     '#10B981',   // emerald – grid export
  bank:       '#059669',   // green – energy bank

  // ── Semantic ──
  success: '#059669',
  warning: '#F59E0B',
  info:    '#0EA5E9',
  danger:  '#EF4444',
  muted:   '#94A3B8',

  // ── Text ──
  text:        '#111827',   // near-black
  textSub:     '#4B5563',   // dark grey
  textMuted:   '#9CA3AF',   // light grey
  textInverse: '#FFFFFF',   // white on coloured buttons

  // ── Subtle tinted backgrounds ──
  glowGold:  'rgba(245, 158, 11, 0.08)',
  glowGreen: 'rgba(5, 150, 105, 0.08)',
  glowBlue:  'rgba(14, 165, 233, 0.08)',
};

export const SPACING = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 9999,
};

export const FONT = {
  regular: '400' as const,
  medium:  '500' as const,
  semi:    '600' as const,
  bold:    '700' as const,
  heavy:   '800' as const,
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  glow: {
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
};
