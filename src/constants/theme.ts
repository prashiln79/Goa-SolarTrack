// Design tokens — single source of truth for all visual constants
export const COLORS = {
  // ── App chrome ──
  background:   '#0A0F1C',  // deep navy
  surface:      '#111827',
  surfaceRaised:'#1A2540',
  card:         '#131E32',
  border:       '#1E2E4A',
  borderSubtle: '#172239',

  // ── Solar palette ──
  gold:         '#F59E0B', // solar yellow
  goldDim:      '#D97706',
  amber:        '#FBBF24',

  // ── Energy flow (PRD §4.1) ──
  generation:  '#F59E0B', // solar gen — amber
  directUse:   '#A78BFA', // direct self-consumption — violet
  import:      '#38BDF8', // grid import — sky
  export:      '#34D399', // grid export — emerald
  bank:        '#10B981', // energy bank — green

  // ── Semantic ──
  success:     '#10B981',
  warning:     '#F59E0B',
  info:        '#38BDF8',
  danger:      '#EF4444',
  muted:       '#94A3B8',

  // ── Text ──
  text:        '#F1F5F9',
  textSub:     '#94A3B8',
  textMuted:   '#64748B',
  textInverse: '#0A0F1C',

  // ── Glow accents ──
  glowGold:    'rgba(245, 158, 11, 0.12)',
  glowGreen:   'rgba(16, 185, 129, 0.12)',
  glowBlue:    'rgba(56, 189, 248, 0.10)',
};

export const SPACING = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  14,
  lg:  20,
  xl:  28,
  xxl: 40,
};

export const RADIUS = {
  sm:   8,
  md:   14,
  lg:   20,
  xl:   28,
  full: 9999,
};

export const FONT = {
  // Weights
  regular: '400' as const,
  medium:  '500' as const,
  semi:    '600' as const,
  bold:    '700' as const,
  heavy:   '800' as const,
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  glow: {
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
};
