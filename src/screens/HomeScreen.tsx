// ============================================================
// Home Screen — Simplified light-theme layout
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill, SystemProfile, CareAssessment } from '../types/solar';
import { Card, Badge, Divider, InfoNote, ProgressBar, LedgerRow } from '../components/ui/UIKit';
import { estimateRetailBill, projectSettlement } from '../domain/tariffEngine';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';

interface HomeScreenProps {
  bills: SolarBill[];
  profile: SystemProfile;
  careAssessment: CareAssessment;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onAddBill: () => void;
  onLogClean: () => void;
  onSeedCanonical?: () => void;
  onNavigateCare: () => void;
  onNavigateAnalytics: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  bills, profile, careAssessment, isRefreshing, onRefresh,
  onAddBill, onLogClean, onSeedCanonical,
  onNavigateCare, onNavigateAnalytics,
}) => {
  const bill = bills.length > 0 ? bills[0] : null;

  if (!bill) {
    return <EmptyState onAddBill={onAddBill} />;
  }

  const days = bill.billingDays || 31;
  const avgPerDay = bill.generationKwh !== null
    ? (bill.generationKwh / days).toFixed(1)
    : null;

  const retailEstimate =
    bill.estimatedTotalConsumptionKwh !== null
      ? estimateRetailBill(bill.estimatedTotalConsumptionKwh, bill.billAmount, profile.capacityKw)
      : null;

  const settlement =
    profile.settlementRateInr
      ? projectSettlement(
          bill.closingCreditKwh,
          profile.settlementRateInr,
          'FY 2026-27 (1 Apr – 31 Mar)',
          '31 May 2027'
        )
      : null;

  // ── Scope toggle for Energy Flow (Latest Month vs All Bills) ──
  const [flowScope, setFlowScope] = useState<'month' | 'all'>('month');

  // ── All-time aggregates for the summary strip & all-time flow ──
  const allTimeGeneration = bills.reduce((sum, b) => sum + (b.generationKwh ?? 0), 0);
  const allTimeImport = bills.reduce((sum, b) => sum + b.importKwh, 0);
  const allTimeExport = bills.reduce((sum, b) => sum + b.exportKwh, 0);
  const allTimeDirectUse = bills.reduce((sum, b) => sum + (b.directSolarUseKwh ?? 0), 0);

  const displayGen = flowScope === 'month' ? bill.generationKwh : allTimeGeneration;
  const displayImp = flowScope === 'month' ? bill.importKwh : allTimeImport;
  const displayExp = flowScope === 'month' ? bill.exportKwh : allTimeExport;
  const displayDirect = flowScope === 'month' ? bill.directSolarUseKwh : allTimeDirectUse;

  const allTimeTotalBill = bills.reduce((sum, b) => sum + b.billAmount, 0);
  const allTimeTotalSavings = bills.reduce((sum, b) => {
    if (b.estimatedTotalConsumptionKwh === null) return sum;
    const est = estimateRetailBill(b.estimatedTotalConsumptionKwh, b.billAmount, profile.capacityKw);
    return sum + est.estimatedSavingsInr;
  }, 0);
  const hasSavingsData = bills.some((b) => b.estimatedTotalConsumptionKwh !== null);
  // Period label: oldest → newest
  const sortedBills = [...bills].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );
  const firstPeriod = sortedBills[0]?.period ?? bill.period;
  const lastPeriod = sortedBills[sortedBills.length - 1]?.period ?? bill.period;
  const allTimePeriodLabel = bills.length === 1 ? bill.period : `${firstPeriod} – ${lastPeriod}`;

  const careColor = careAssessment.state === 'Good' ? COLORS.success
    : careAssessment.state === 'Watch' ? COLORS.warning
    : COLORS.danger;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[COLORS.gold]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top summary strip — All-time totals ── */}
      <View style={styles.summaryStrip}>
        <SummaryChip
          label="Total Savings"
          value={hasSavingsData ? `₹${Math.round(allTimeTotalSavings).toLocaleString()}` : '—'}
          valueColor={hasSavingsData ? COLORS.success : COLORS.textMuted}
        />
        <View style={styles.stripDivider} />
        <SummaryChip
          label="Total Paid"
          value={`₹${Math.round(allTimeTotalBill).toLocaleString()}`}
          valueColor={COLORS.gold}
        />
      </View>

      {/* ─── 1. Energy Flow ─── */}
      <Card
        title="Energy Flow"
        subtitle={
          flowScope === 'month'
            ? `${bill.period} (Latest Bill)`
            : `All Bills Total (${bills.length} bills · ${allTimePeriodLabel})`
        }
        badge={
          bills.length > 1 ? (
            <View style={styles.scopeToggle}>
              <TouchableOpacity
                id="btn-flow-scope-month"
                style={[styles.scopeBtn, flowScope === 'month' && styles.scopeBtnActive]}
                onPress={() => setFlowScope('month')}
              >
                <Text style={[styles.scopeBtnText, flowScope === 'month' && styles.scopeBtnTextActive]}>
                  Month
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-flow-scope-all"
                style={[styles.scopeBtn, flowScope === 'all' && styles.scopeBtnActive]}
                onPress={() => setFlowScope('all')}
              >
                <Text style={[styles.scopeBtnText, flowScope === 'all' && styles.scopeBtnTextActive]}>
                  All ({bills.length})
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Badge label={bill.period} color={COLORS.gold} />
          )
        }
      >
        <View style={styles.flowGrid}>
          <FlowTile
            icon="sunny"
            label={flowScope === 'month' ? 'Generated' : 'Total Gen'}
            value={displayGen}
            unit="kWh"
            color={COLORS.generation}
            note={flowScope === 'month' && avgPerDay ? `${avgPerDay}/day avg` : undefined}
          />
          <FlowTile
            icon="arrow-down"
            label={flowScope === 'month' ? 'Imported' : 'Total Imp'}
            value={displayImp}
            unit="kWh"
            color={COLORS.import}
          />
          <FlowTile
            icon="arrow-up"
            label={flowScope === 'month' ? 'Exported' : 'Total Exp'}
            value={displayExp}
            unit="kWh"
            color={COLORS.export}
          />
          <FlowTile
            icon="flash"
            label={flowScope === 'month' ? 'Direct Use' : 'Total Direct'}
            value={displayDirect}
            unit="kWh"
            color={COLORS.directUse}
          />
        </View>
      </Card>

      {/* ─── 2. Energy Bank ─── */}
      <Card
        title="Energy Bank"
        subtitle={`Cumulative credit balance as of ${bill.period}`}
        badge={<Badge label={bill.period} color={COLORS.gold} />}
      >
        <View style={styles.bankHero}>
          <Text style={styles.bankValue}>{bill.closingCreditKwh}</Text>
          <Text style={styles.bankUnit}>kWh carried forward</Text>
        </View>
        <View style={styles.formulaRow}>
          <FormulaStep value={bill.openingCreditKwh} label="Opening" />
          <Text style={styles.formulaOp}>＋</Text>
          <FormulaStep value={bill.exportKwh} label="Export" color={COLORS.export} />
          <Text style={styles.formulaOp}>－</Text>
          <FormulaStep value={bill.adjustedCreditKwh} label="Used" color={COLORS.import} />
          <Text style={styles.formulaOp}>＝</Text>
          <FormulaStep value={bill.closingCreditKwh} label="Balance" color={COLORS.gold} highlight />
        </View>
        {bill.needsReview && (
          <InfoNote
            text="⚠️ Bill value differs from calculated. Bill-stated values are preserved."
            color={COLORS.danger}
            style={{ marginTop: SPACING.sm }}
          />
        )}
      </Card>

      {/* ─── 3. Current Bill ─── */}
      <Card
        title="Current Bill"
        subtitle={`${bill.period} · Bill #${bill.billNumber ?? 'N/A'}  ·  Due: ${bill.dueDate ?? 'N/A'}`}
        badge={<Badge label={`₹${bill.billAmount.toFixed(0)}`} color={COLORS.gold} />}
      >
        <View style={styles.billBox}>
          {bill.demandCharges !== undefined && (
            <LedgerRow label="Demand / Fixed Charges" value={`₹${bill.demandCharges.toFixed(2)}`} />
          )}
          {bill.fppca !== undefined && (
            <LedgerRow label="FPPCA" value={`₹${bill.fppca.toFixed(2)}`} />
          )}
          {bill.rebate !== undefined && bill.rebate !== 0 && (
            <LedgerRow label="Prompt Payment Rebate" value={`−₹${Math.abs(bill.rebate).toFixed(2)}`} valueColor={COLORS.success} />
          )}
          {bill.otherCharges !== undefined && bill.otherCharges !== 0 && (
            <LedgerRow label="Other Charges" value={`₹${bill.otherCharges.toFixed(2)}`} />
          )}
          <Divider />
          <LedgerRow label="Credit used this period" value={`${bill.adjustedCreditKwh} kWh`} valueColor={COLORS.export} />
          <LedgerRow label="Credit carried forward" value={`${bill.closingCreditKwh} kWh`} valueColor={COLORS.gold} />
        </View>
        <InfoNote
          text="Fixed charges, FPPCA and duties are payable regardless of energy credits."
          color={COLORS.warning}
          style={{ marginTop: SPACING.sm }}
        />
      </Card>

      {/* ─── 4. Panel Care ─── */}
      <Card
        title="Panel Care"
        subtitle={`Last cleaned: ${profile.lastCleanedDate ?? 'Not recorded'}`}
        badge={<Badge label={careAssessment.state} color={careColor} />}
      >
        <Text style={styles.careRationale}>{careAssessment.rationale}</Text>
        {careAssessment.recommendation ? (
          <Text style={styles.careRecommendation}>{careAssessment.recommendation}</Text>
        ) : null}
        <ProgressBar
          value={100 - careAssessment.score}
          color={careColor}
          height={8}
          style={{ marginTop: SPACING.md }}
        />
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>Clean</Text>
          <Text style={[styles.progressLabel, { color: careColor, fontWeight: FONT.semi }]}>
            {100 - careAssessment.score}% health
          </Text>
          <Text style={styles.progressLabel}>Needs Wash</Text>
        </View>
        <View style={styles.careActions}>
          <TouchableOpacity
            id="btn-log-clean-home"
            style={styles.logCleanBtn}
            onPress={onLogClean}
            activeOpacity={0.8}
          >
            <Ionicons name="water-outline" size={16} color={COLORS.textInverse} />
            <Text style={styles.logCleanText}>Log Panel Wash</Text>
          </TouchableOpacity>
          <TouchableOpacity
            id="btn-view-care"
            style={styles.viewCareBtn}
            onPress={onNavigateCare}
          >
            <Text style={styles.viewCareText}>Full Report →</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* ─── 5. Annual Settlement ─── */}
      {settlement ? (
        <Card title="Annual Settlement Outlook" subtitle="FY 1 Apr – 31 Mar · JERC 2019">
          <View style={styles.settlementRow}>
            <View style={styles.settlementCol}>
              <Text style={styles.settlementLabel}>Banked</Text>
              <Text style={styles.settlementVal}>{settlement.bankedCreditKwh} kWh</Text>
            </View>
            <Text style={styles.formulaOp}>×</Text>
            <View style={styles.settlementCol}>
              <Text style={styles.settlementLabel}>APPC Rate</Text>
              <Text style={styles.settlementVal}>₹{settlement.ratePerKwh}/kWh</Text>
            </View>
            <Text style={styles.formulaOp}>＝</Text>
            <View style={[styles.settlementCol, styles.settlementHighlight]}>
              <Text style={[styles.settlementLabel, { color: COLORS.success }]}>Projected</Text>
              <Text style={[styles.settlementVal, { color: COLORS.success, fontSize: 20 }]}>
                ₹{settlement.projectedPayoutInr.toFixed(0)}
              </Text>
            </View>
          </View>
          <InfoNote
            text="Estimate only — actual settlement computed by EDG by 30 Apr."
            color={COLORS.warning}
            style={{ marginTop: SPACING.sm }}
          />
        </Card>
      ) : (
        <InfoNote
          text="Set the APPC settlement rate in Settings to see your annual payout estimate."
          color={COLORS.info}
        />
      )}
    </ScrollView>
  );
};

// ── Sub-Components ────────────────────────────────────────────

const SummaryChip: React.FC<{ label: string; value: string; valueColor?: string }> = ({
  label, value, valueColor = COLORS.text,
}) => (
  <View style={styles.chip}>
    <Text style={styles.chipLabel}>{label}</Text>
    <Text style={[styles.chipValue, { color: valueColor }]}>{value}</Text>
  </View>
);

const FlowTile: React.FC<{
  icon: string; label: string; value: number | null;
  unit: string; color: string; note?: string;
}> = ({ icon, label, value, unit, color, note }) => (
  <View style={[styles.flowTile, { borderTopColor: color, borderTopWidth: 3 }]}>
    <View style={styles.flowTileHeader}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[styles.flowTileLabel, { color }]}>{label}</Text>
    </View>
    <Text style={styles.flowTileValue}>
      {value !== null ? value : '—'}
    </Text>
    <Text style={styles.flowTileUnit}>{value !== null ? unit : ''}</Text>
    {note && <Text style={styles.flowTileNote}>{note}</Text>}
  </View>
);

const FormulaStep: React.FC<{
  value: number; label: string; color?: string; highlight?: boolean;
}> = ({ value, label, color = COLORS.textSub, highlight }) => (
  <View style={[styles.formulaStep, highlight && styles.formulaStepHighlight]}>
    <Text style={[styles.formulaValue, { color }]}>{value}</Text>
    <Text style={styles.formulaLabel}>{label}</Text>
  </View>
);

const EmptyState: React.FC<{
  onAddBill: () => void;
}> = ({ onAddBill }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name="sunny-outline" size={44} color={COLORS.gold} />
    </View>
    <Text style={styles.emptyTitle}>Welcome to Goa SolarTrack</Text>
    <Text style={styles.emptySub}>
      Add your first monthly electricity bill to begin tracking your rooftop solar production, savings, and energy credits in Goa.
    </Text>
    <TouchableOpacity id="btn-add-bill-empty" style={styles.emptyAddBtn} onPress={onAddBill}>
      <Ionicons name="add-circle" size={18} color={COLORS.textInverse} />
      <Text style={styles.emptyAddBtnText}>Add Monthly Bill</Text>
    </TouchableOpacity>
  </View>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  chipLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  chipValue: { fontSize: 15, fontWeight: FONT.bold },
  stripDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

  // Scope toggle
  scopeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.full,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scopeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  scopeBtnActive: {
    backgroundColor: COLORS.gold,
  },
  scopeBtnText: {
    fontSize: 10,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
  },
  scopeBtnTextActive: {
    color: COLORS.textInverse,
    fontWeight: FONT.bold,
  },

  // Flow grid
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  flowTile: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  flowTileHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.xs },
  flowTileLabel: { fontSize: 11, fontWeight: FONT.semi },
  flowTileValue: { fontSize: 26, fontWeight: FONT.heavy, color: COLORS.text, marginTop: 2 },
  flowTileUnit: { fontSize: 12, color: COLORS.textMuted },
  flowTileNote: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  savingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.glowGreen,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1, borderColor: `${COLORS.success}22`,
  },
  savingsText: { fontSize: 13, color: COLORS.textSub, flex: 1 },

  // Energy bank
  bankHero: { alignItems: 'center', paddingVertical: SPACING.md },
  bankValue: { fontSize: 48, fontWeight: FONT.heavy, color: COLORS.bank },
  bankUnit: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formulaStep: { alignItems: 'center', flex: 1 },
  formulaStepHighlight: {
    backgroundColor: COLORS.glowGold,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: `${COLORS.gold}33`,
    paddingVertical: 4,
  },
  formulaValue: { fontSize: 15, fontWeight: FONT.heavy, color: COLORS.text },
  formulaLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  formulaOp: { fontSize: 13, color: COLORS.textMuted, fontWeight: FONT.bold, paddingHorizontal: 2 },

  // Bill breakdown
  billBox: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },

  // Care
  careRationale: { fontSize: 14, color: COLORS.textSub, lineHeight: 21, marginBottom: 4 },
  careRecommendation: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, fontStyle: 'italic' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { fontSize: 11, color: COLORS.textMuted },
  careActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  logCleanBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.gold, padding: 12, borderRadius: RADIUS.md,
    elevation: 1,
  },
  logCleanText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
  viewCareBtn: {
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  viewCareText: { fontSize: 13, color: COLORS.textSub, fontWeight: FONT.semi },

  // Settlement
  settlementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  settlementCol: { alignItems: 'center', flex: 1 },
  settlementHighlight: {
    backgroundColor: COLORS.glowGreen,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: `${COLORS.success}33`,
    paddingVertical: 6,
  },
  settlementLabel: { fontSize: 11, color: COLORS.textMuted },
  settlementVal: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.text, marginTop: 2 },

  // Empty state
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.md,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.glowGold,
    borderWidth: 1, borderColor: `${COLORS.gold}33`,
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 22, fontWeight: FONT.heavy, color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.xl, paddingVertical: 14,
    borderRadius: RADIUS.full,
    ...SHADOW.glow,
  },
  emptyAddBtnText: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.textInverse },
  emptySeedBtn: {
    paddingVertical: 10,
  },
  emptySeedText: { fontSize: 13, color: COLORS.textMuted, textDecorationLine: 'underline' },
});
