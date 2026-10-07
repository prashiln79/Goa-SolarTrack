// ============================================================
// Analytics Screen — PRD §13
// Monthly analytics table + annual aggregate
// PRD §8.1 trend guard: only show % change when >= 3 months
// ============================================================
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill, SystemProfile } from '../types/solar';
import { Card, Divider, InfoNote, ProgressBar } from '../components/ui/UIKit';
import { buildMonthlyAnalytics, buildAnnualAnalytics } from '../domain/analytics';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface AnalyticsScreenProps {
  bills: SolarBill[];
  profile: SystemProfile;
  cleaningEventCount: number;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  bills, profile, cleaningEventCount,
}) => {
  const monthlyRows = useMemo(
    () => buildMonthlyAnalytics(bills, profile.capacityKw),
    [bills, profile.capacityKw]
  );
  const annual = useMemo(
    () => buildAnnualAnalytics(bills, profile.capacityKw, cleaningEventCount),
    [bills, profile.capacityKw, cleaningEventCount]
  );

  // Ordered newest-first for table
  const tableRows = [...monthlyRows].reverse();

  const selfSufficiencyPct =
    annual.totalGenerationKwh > 0
      ? Math.round(
          (annual.totalDirectUseKwh /
            (annual.totalDirectUseKwh + annual.totalImportKwh)) *
            100
        )
      : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>Solar Analytics</Text>
      <Text style={styles.pageSub}>
        Aggregated across {bills.length} billing cycle{bills.length === 1 ? '' : 's'}
      </Text>

      {bills.length === 0 && (
        <InfoNote text="Add your first monthly bill to see analytics." color={COLORS.info} />
      )}

      {/* ── Annual Aggregate ── */}
      {bills.length > 0 && (
        <Card
          title="Lifetime / Annual Summary"
          subtitle="Aggregate across all recorded billing cycles"
          badge={
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Est. Savings</Text>
            </View>
          }
        >
          <View style={styles.impactRow}>
            <ImpactCol
              label="Estimated Solar Savings"
              value={`₹${annual.estimatedAvoidedCostInr.toFixed(0)}`}
              sub="Avoided LTDS-II retail cost†"
              color={COLORS.success}
            />
            <View style={styles.impactDivider} />
            <ImpactCol
              label="Total Bills Paid"
              value={`₹${annual.totalBillsPaid.toFixed(0)}`}
              sub="Fixed charges, FPPCA, duties"
              color={COLORS.text}
            />
          </View>

          <Divider style={{ marginVertical: SPACING.sm }} />

          {/* Energy flow totals */}
          <View style={styles.energyFlowGrid}>
            <FlowItem label="Total Generated" value={annual.totalGenerationKwh} color={COLORS.generation} icon="sunny-outline" />
            <FlowItem label="Direct Solar Use" value={annual.totalDirectUseKwh} color={COLORS.directUse} icon="flash-outline" />
            <FlowItem label="Total Exported" value={annual.totalExportKwh} color={COLORS.export} icon="arrow-up-outline" />
            <FlowItem label="Total Imported" value={annual.totalImportKwh} color={COLORS.import} icon="arrow-down-outline" />
          </View>

          {/* Self-sufficiency */}
          <View style={styles.selfSuffBox}>
            <View style={styles.selfSuffHeader}>
              <Text style={styles.selfSuffLabel}>Direct Solar Self-Sufficiency</Text>
              <Text style={[styles.selfSuffPct, { color: COLORS.directUse }]}>{selfSufficiencyPct}%</Text>
            </View>
            <ProgressBar value={selfSufficiencyPct} color={COLORS.directUse} />
            <Text style={styles.selfSuffNote}>
              Percentage of total electricity needs met directly by daytime solar (not counting banked credits).
            </Text>
          </View>

          <Text style={styles.estimateTag}>
            † Estimated using LTDS-II telescopic energy slabs + ₹25/kW fixed charge. Excludes FPPCA, duties. Labelled as estimate per PRD §7.2.
          </Text>
        </Card>
      )}

      {/* ── Monthly Performance Table ── */}
      {tableRows.length > 0 && (
        <Card
          title="Monthly Performance Table"
          subtitle="PRD §13.1 — generation, import/export, credit and bill per cycle"
        >
          {/* Header row */}
          <View style={styles.tableRow}>
            <Text style={[styles.th, { flex: 1.6 }]}>Period</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Gen</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Export</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Closing</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Bill</Text>
          </View>
          <Divider />

          {tableRows.map((row, idx) => (
            <View key={row.period}>
              <View style={styles.tableRow}>
                <View style={{ flex: 1.6 }}>
                  <Text style={styles.tdPeriod} numberOfLines={1}>{row.period}</Text>
                  {row.monthOverMonthChangePct !== null && (
                    <Text style={[
                      styles.trendBadge,
                      { color: row.monthOverMonthChangePct >= 0 ? COLORS.success : COLORS.danger }
                    ]}>
                      {row.monthOverMonthChangePct >= 0 ? '▲' : '▼'} {Math.abs(row.monthOverMonthChangePct)}%
                    </Text>
                  )}
                </View>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.generation }]}>
                  {row.generationKwh !== null ? row.generationKwh : '—'}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.export }]}>
                  {row.exportKwh}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.gold }]}>
                  {row.closingCreditKwh}
                </Text>
                <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: FONT.bold }]}>
                  ₹{row.billAmount.toFixed(0)}
                </Text>
              </View>
              {/* avg per day sub-row */}
              {row.avgGenerationPerDay !== null && (
                <Text style={styles.avgDay}>  {row.avgGenerationPerDay} kWh/day avg • {row.billingDays} days</Text>
              )}
              {idx < tableRows.length - 1 && <Divider style={{ marginVertical: 2 }} />}
            </View>
          ))}

          {bills.length < 3 && (
            <InfoNote
              text="Month-over-month trend (▲▼%) will appear after 3+ completed billing cycles. PRD §8.1."
              color={COLORS.info}
              style={{ marginTop: SPACING.sm }}
            />
          )}
        </Card>
      )}
    </ScrollView>
  );
};

const ImpactCol: React.FC<{ label: string; value: string; sub: string; color: string }> = ({
  label, value, sub, color,
}) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={styles.impactLabel}>{label}</Text>
    <Text style={[styles.impactValue, { color }]}>{value}</Text>
    <Text style={styles.impactSub}>{sub}</Text>
  </View>
);

const FlowItem: React.FC<{ label: string; value: number; color: string; icon: string }> = ({
  label, value, color, icon,
}) => (
  <View style={styles.flowItem}>
    <Ionicons name={icon as any} size={16} color={color} />
    <Text style={styles.flowLabel}>{label}</Text>
    <Text style={[styles.flowValue, { color }]}>{value} <Text style={styles.flowUnit}>kWh</Text></Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },
  pageTitle: { fontSize: 20, fontWeight: FONT.heavy, color: COLORS.text, marginBottom: 4 },
  pageSub: { fontSize: 12, color: COLORS.textSub, marginBottom: SPACING.md },
  badge: {
    backgroundColor: COLORS.glowGreen, borderWidth: 1, borderColor: `${COLORS.success}44`,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full,
  },
  badgeText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.success },
  impactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm },
  impactDivider: { width: 1, height: 48, backgroundColor: COLORS.border },
  impactLabel: { fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  impactValue: { fontSize: 22, fontWeight: FONT.heavy, color: COLORS.text, marginTop: 4 },
  impactSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },
  energyFlowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  flowItem: {
    flex: 1, minWidth: '46%', backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderSubtle, padding: SPACING.sm, alignItems: 'center', gap: 4,
  },
  flowLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  flowValue: { fontSize: 15, fontWeight: FONT.heavy },
  flowUnit: { fontSize: 11, fontWeight: FONT.regular, color: COLORS.textMuted },
  selfSuffBox: {
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: COLORS.borderSubtle, padding: SPACING.md, marginTop: SPACING.sm, gap: 6,
  },
  selfSuffHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selfSuffLabel: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  selfSuffPct: { fontSize: 16, fontWeight: FONT.heavy },
  selfSuffNote: { fontSize: 10, color: COLORS.textMuted, lineHeight: 14 },
  estimateTag: { fontSize: 9, color: COLORS.textMuted, fontStyle: 'italic', marginTop: SPACING.sm, lineHeight: 13 },

  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 10, fontWeight: FONT.heavy, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  tdPeriod: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  trendBadge: { fontSize: 9, fontWeight: FONT.bold, marginTop: 1 },
  td: { fontSize: 12, color: COLORS.text },
  avgDay: { fontSize: 10, color: COLORS.textMuted, paddingHorizontal: 4, paddingBottom: 4 },
});
