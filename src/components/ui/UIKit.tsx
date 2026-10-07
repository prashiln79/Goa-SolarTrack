import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../../constants/theme';

// ── Card ─────────────────────────────────────────────────────
interface CardProps {
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title, subtitle, badge, footer, style, contentStyle, children,
}) => (
  <View style={[styles.card, style]}>
    {(title || badge) && (
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          {title && <Text style={styles.cardTitle}>{title}</Text>}
          {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
        </View>
        {badge && <View style={{ marginLeft: SPACING.sm }}>{badge}</View>}
      </View>
    )}
    <View style={[styles.cardContent, contentStyle]}>{children}</View>
    {footer && <View style={styles.cardFooter}>{footer}</View>}
  </View>
);

// ── Badge ─────────────────────────────────────────────────────
interface BadgeProps {
  label: string;
  color?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  label, color = COLORS.gold,
}) => (
  <View style={[styles.badge, { borderColor: `${color}44`, backgroundColor: `${color}15` }]}>
    <Text style={[styles.badgeText, { color }]}>{label}</Text>
  </View>
);

// ── Stat Item ─────────────────────────────────────────────────
interface StatItemProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  sub?: string;
  icon?: React.ReactNode;
}

export const StatItem: React.FC<StatItemProps> = ({
  label, value, unit, color = COLORS.text, sub, icon,
}) => (
  <View style={styles.statItem}>
    {icon && <View style={styles.statIcon}>{icon}</View>}
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.statValueRow}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {unit && <Text style={styles.statUnit}> {unit}</Text>}
    </View>
    {sub && <Text style={styles.statSub}>{sub}</Text>}
  </View>
);

// ── Section Divider ───────────────────────────────────────────
export const Divider: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={[styles.divider, style]} />
);

// ── Info Note ─────────────────────────────────────────────────
interface InfoNoteProps {
  text: string;
  color?: string;
  style?: ViewStyle;
}
export const InfoNote: React.FC<InfoNoteProps> = ({
  text, color = COLORS.gold, style,
}) => (
  <View style={[styles.infoNote, { borderColor: `${color}33`, backgroundColor: `${color}0C` }, style]}>
    <Text style={[styles.infoNoteText, { color: COLORS.textSub }]}>{text}</Text>
  </View>
);

// ── Progress Bar ──────────────────────────────────────────────
interface ProgressBarProps {
  value: number; // 0–100
  color?: string;
  height?: number;
  style?: ViewStyle;
}
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value, color = COLORS.gold, height = 6, style,
}) => (
  <View style={[styles.progressBg, { height }, style]}>
    <View
      style={[
        styles.progressFill,
        { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, height },
      ]}
    />
  </View>
);

// ── Ledger Row ────────────────────────────────────────────────
interface LedgerRowProps {
  label: string;
  value: string;
  valueColor?: string;
  labelStyle?: TextStyle;
  muted?: boolean;
}
export const LedgerRow: React.FC<LedgerRowProps> = ({
  label, value, valueColor, labelStyle, muted,
}) => (
  <View style={styles.ledgerRow}>
    <Text style={[styles.ledgerLabel, muted && { color: COLORS.textMuted }, labelStyle]}>
      {label}
    </Text>
    <Text style={[styles.ledgerValue, valueColor ? { color: valueColor } : {}]}>
      {value}
    </Text>
  </View>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  cardContent: {
    padding: SPACING.md,
  },
  cardFooter: {
    padding: SPACING.md,
    paddingTop: 0,
  },

  // Badge
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: FONT.semi,
    letterSpacing: 0.2,
  },

  // Stat
  statItem: {
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: FONT.medium,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statValue: {
    fontSize: 20,
    fontWeight: FONT.heavy,
    color: COLORS.text,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: FONT.medium,
    color: COLORS.textMuted,
  },
  statSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.borderSubtle,
    marginVertical: SPACING.sm,
  },

  // InfoNote
  infoNote: {
    padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  infoNoteText: {
    fontSize: 12,
    lineHeight: 17,
  },

  // Progress
  progressBg: {
    backgroundColor: COLORS.borderSubtle,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: RADIUS.full,
  },

  // LedgerRow
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  ledgerLabel: {
    fontSize: 13,
    color: COLORS.textSub,
    flex: 1,
  },
  ledgerValue: {
    fontSize: 13,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
});
