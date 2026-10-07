// ============================================================
// Home Screen — PRD §4.1 Home information hierarchy
// 1. Current Billing Period
// 2. Energy Bank
// 3. Solar Performance
// 4. Current Bill
// 5. Panel Care
// 6. Annual Settlement
// ============================================================
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill, SystemProfile, CareAssessment } from '../types/solar';
import {
  Card, Badge, StatItem, Divider, InfoNote, ProgressBar, LedgerRow,
} from '../components/ui/UIKit';
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
  onSeedCanonical: () => void;
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
    return <EmptyState onAddBill={onAddBill} onSeedCanonical={onSeedCanonical} />;
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

  const careIsGood = careAssessment.state === 'Good';
  const careColor = careIsGood ? COLORS.success
    : careAssessment.state === 'Watch' ? COLORS.warning
    : COLORS.danger;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
          tintColor={COLORS.gold} colors={[COLORS.gold]} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Summary Pill Row ── */}
      <View style={styles.summaryRow}>
        <SummaryPill label="This Billing Period" value={bill.period} />
        <SummaryPill label="Energy Bank" value={`${bill.closingCreditKwh} kWh`} color={COLORS.bank} />
        <SummaryPill label="Net Payable" value={`₹${bill.billAmount.toFixed(0)}`} color={COLORS.gold} />
      </View>

      {/* ─── 1. CURRENT BILLING PERIOD (PRD §4.1 item 1) ─── */}
      <Card
        title="This Billing Period"
        subtitle={`${bill.period} • ${days} days`}
        badge={<Badge label="Active Cycle" color={COLORS.gold} />}
      >
        {/* 4-stat energy flow grid */}
        <View style={styles.statGrid}>
          <EnergyStatBox
            icon="sunny"
            label="Generated"
            value={bill.generationKwh}
            color={COLORS.generation}
            sub={avgPerDay ? `${avgPerDay} kWh/day avg` : undefined}
            sourceLabel="From meter KWH_G"
          />
          <EnergyStatBox
            icon="arrow-down"
            label="Imported"
            value={bill.importKwh}
            color={COLORS.import}
            sub="From grid KWH_I"
            sourceLabel="Measured"
          />
          <EnergyStatBox
            icon="arrow-up"
            label="Exported"
            value={bill.exportKwh}
            color={COLORS.export}
            sub="Sent to grid KWH_E"
            sourceLabel="Measured"
          />
          <EnergyStatBox
            icon="flash"
            label="Direct Use"
            value={bill.directSolarUseKwh}
            color={COLORS.directUse}
            sub="Gen − Export"
            sourceLabel="Calculated estimate"
          />
        </View>

        {/* Estimated total consumption */}
        {bill.estimatedTotalConsumptionKwh !== null && (
          <View style={styles.totalRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.totalLabel}>Estimated total household consumption</Text>
              <Text style={styles.totalDetail}>
                {bill.directSolarUseKwh} kWh direct solar + {bill.importKwh} kWh grid import
              </Text>
              <Text style={styles.estimateTag}>† Calculated estimate from bill values</Text>
            </View>
            <Text style={styles.totalValue}>{bill.estimatedTotalConsumptionKwh} kWh</Text>
          </View>
        )}

        {/* PRD UX rule: never say "Solar Today" */}
        <InfoNote
          text='ℹ️ Figures above are for the full billing cycle, not a single day. "Average generation/day" is shown where available.'
          color={COLORS.info}
          style={{ marginTop: SPACING.xs }}
        />
      </Card>

      {/* ─── 2. ENERGY BANK (PRD §4.1 item 2) ─── */}
      <Card
        title="Energy Bank"
        subtitle="JERC 2019 net-metering cumulative credit ledger"
        badge={<Badge label="Active Ledger" color={COLORS.bank} />}
      >
        {/* Hero closing credit */}
        <View style={styles.bankHero}>
          <Text style={styles.bankHeroLabel}>Available Carried-Forward Credit</Text>
          <View style={styles.bankHeroValueRow}>
            <Text style={styles.bankHeroValue}>{bill.closingCreditKwh}</Text>
            <Text style={styles.bankHeroUnit}> kWh</Text>
          </View>
          <Text style={styles.bankHeroSub}>Surplus banked for future billing periods</Text>
        </View>

        {/* Arithmetic formula display */}
        <View style={styles.formulaRow}>
          <FormulaStep value={bill.openingCreditKwh} label="Opening" />
          <Text style={styles.formulaOp}>+</Text>
          <FormulaStep value={bill.exportKwh} label="Export" color={COLORS.export} />
          <Text style={styles.formulaOp}>−</Text>
          <FormulaStep value={bill.adjustedCreditKwh} label="Adjusted" color={COLORS.import} />
          <Text style={styles.formulaOp}>=</Text>
          <FormulaStep value={bill.closingCreditKwh} label="Carried →" color={COLORS.gold} highlight />
        </View>

        {/* Mismatch warning (PRD §6.1 Bill-first rule) */}
        {bill.needsReview && (
          <InfoNote
            text="⚠️ OCR/bill value differs from calculated value. Please review — bill-stated values are preserved."
            color={COLORS.danger}
          />
        )}
      </Card>

      {/* ─── 3. SOLAR PERFORMANCE (PRD §4.1 item 3) ─── */}
      <Card
        title="Solar Performance"
        subtitle={`${profile.capacityKw} kW system • ${days}-day billing cycle`}
        badge={<Badge label="This Billing Period" color={COLORS.generation} />}
      >
        <View style={styles.perfRow}>
          <View style={styles.perfCol}>
            <Text style={styles.perfLabel}>Generation</Text>
            <Text style={styles.perfValue}>
              {bill.generationKwh !== null ? `${bill.generationKwh} kWh` : 'N/A'}
            </Text>
            <Text style={styles.perfSub}>
              {avgPerDay ? `${avgPerDay} kWh/day average` : 'Not available on bill'}
            </Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfCol}>
            <Text style={styles.perfLabel}>Avoided Cost (est.)</Text>
            <Text style={[styles.perfValue, { color: COLORS.success }]}>
              {retailEstimate ? `₹${retailEstimate.estimatedSavingsInr}` : '—'}
            </Text>
            <Text style={styles.perfSub}>vs. full retail tariff</Text>
          </View>
        </View>
        {retailEstimate && (
          <Text style={styles.estimateTag}>
            † Estimated retail equivalent (LTDS-II slabs + fixed charge, excl. FPPCA/duties). Labelled as estimate per PRD §7.2.
          </Text>
        )}
        {bills.length < 3 && (
          <InfoNote
            text="Month-over-month trend will appear after 3+ billing cycles. PRD §8.1."
            color={COLORS.info}
            style={{ marginTop: SPACING.xs }}
          />
        )}
      </Card>

      {/* ─── 4. CURRENT BILL (PRD §4.1 item 4) ─── */}
      <Card
        title="Current Bill"
        subtitle={`Bill #${bill.billNumber ?? 'N/A'} · Due: ${bill.dueDate ?? 'N/A'}`}
        badge={<Badge label={`₹${bill.billAmount.toFixed(2)}`} color={COLORS.gold} />}
      >
        <View style={styles.billBreakdown}>
          {bill.demandCharges !== undefined && (
            <LedgerRow label="Demand / Fixed Charges" value={`₹${bill.demandCharges.toFixed(2)}`} />
          )}
          {bill.fppca !== undefined && (
            <LedgerRow label="Fuel & Power Purchase Adjustment (FPPCA)" value={`₹${bill.fppca.toFixed(2)}`} />
          )}
          {bill.rebate !== undefined && bill.rebate !== 0 && (
            <LedgerRow
              label="Prompt Payment Rebate"
              value={`₹${bill.rebate.toFixed(2)}`}
              valueColor={COLORS.success}
            />
          )}
          {bill.otherCharges !== undefined && bill.otherCharges !== 0 && (
            <LedgerRow label="Other Charges" value={`₹${bill.otherCharges.toFixed(2)}`} />
          )}
          <Divider />
          <LedgerRow
            label="Energy credit used this period"
            value={`${bill.adjustedCreditKwh} kWh`}
            valueColor={COLORS.export}
          />
          <LedgerRow
            label="Energy credit carried forward"
            value={`${bill.closingCreditKwh} kWh`}
            valueColor={COLORS.gold}
          />
        </View>

        {/* PRD §7.3 mandatory disclaimer */}
        <InfoNote
          text="Note: Energy credits offset eligible energy consumption; they are not a promise of a zero-rupee bill. Fixed charges, FPPCA and duties remain payable."
          color={COLORS.warning}
          style={{ marginTop: SPACING.sm }}
        />
      </Card>

      {/* ─── 5. PANEL CARE (PRD §4.1 item 5) ─── */}
      <Card
        title="Panel Care"
        subtitle={`Last cleaned: ${profile.lastCleanedDate ?? 'Not recorded'} (${careAssessment.daysSinceLastClean}d ago)`}
        badge={
          <Badge
            label={careAssessment.state}
            color={careColor}
          />
        }
      >
        <View style={styles.careBody}>
          <View style={styles.careTextCol}>
            <Text style={[styles.careStatus, { color: careColor }]}>{careAssessment.state}</Text>
            <Text style={styles.careRationale}>{careAssessment.rationale}</Text>
            <Text style={styles.careRecommendation}>{careAssessment.recommendation}</Text>
          </View>
        </View>

        <ProgressBar
          value={100 - careAssessment.score}
          color={careColor}
          height={7}
          style={{ marginTop: SPACING.sm }}
        />
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabelLeft}>Clean & Optimal</Text>
          <Text style={[styles.progressLabelRight, { color: careColor }]}>
            Health: {100 - careAssessment.score}%
          </Text>
          <Text style={styles.progressLabelEnd}>Needs Wash</Text>
        </View>

        <View style={styles.careActions}>
          <TouchableOpacity
            id="btn-log-clean-home"
            style={styles.logCleanBtn}
            onPress={onLogClean}
            activeOpacity={0.8}
          >
            <Ionicons name="water-outline" size={15} color={COLORS.textInverse} />
            <Text style={styles.logCleanText}>Log Panel Wash</Text>
          </TouchableOpacity>
          <TouchableOpacity
            id="btn-view-care"
            style={styles.viewCareBtn}
            onPress={onNavigateCare}
          >
            <Text style={styles.viewCareText}>Full Care Report →</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* ─── 6. ANNUAL SETTLEMENT (PRD §4.1 item 6) ─── */}
      <Card
        title="Annual Settlement Outlook"
        subtitle="Financial Year 1 Apr – 31 Mar · JERC 2019 Regulations"
        badge={<Badge label="JERC Rules" color={COLORS.gold} />}
      >
        {settlement ? (
          <>
            <View style={styles.settlementRow}>
              <View style={styles.settlementCol}>
                <Text style={styles.settlementLabel}>Banked Credit</Text>
                <Text style={styles.settlementVal}>{settlement.bankedCreditKwh} kWh</Text>
              </View>
              <Text style={styles.settlementOp}>×</Text>
              <View style={styles.settlementCol}>
                <Text style={styles.settlementLabel}>APPC Rate</Text>
                <Text style={styles.settlementVal}>₹{settlement.ratePerKwh}/kWh</Text>
              </View>
              <Text style={styles.settlementOp}>=</Text>
              <View style={styles.settlementColHighlight}>
                <Text style={styles.settlementLabelGreen}>Projected</Text>
                <Text style={styles.settlementValGreen}>₹{settlement.projectedPayoutInr.toFixed(0)}</Text>
              </View>
            </View>
            <InfoNote
              text={`Estimate only — actual settlement computed by EDG by 30 Apr, payable by 31 May. ${settlement.note}`}
              color={COLORS.warning}
              style={{ marginTop: SPACING.sm }}
            />
          </>
        ) : (
          <InfoNote
            text="Configure the APPC settlement rate in Settings to see a projected annual settlement value. Rate must be confirmed from current JERC announcement."
            color={COLORS.info}
          />
        )}
      </Card>
    </ScrollView>
  );
};

// ── Sub-Components ────────────────────────────────────────────

const SummaryPill: React.FC<{ label: string; value: string; color?: string }> = ({
  label, value, color = COLORS.text,
}) => (
  <View style={styles.summaryPill}>
    <Text style={styles.summaryPillLabel}>{label}</Text>
    <Text style={[styles.summaryPillValue, { color }]}>{value}</Text>
  </View>
);

const EnergyStatBox: React.FC<{
  icon: string; label: string; value: number | null;
  color: string; sub?: string; sourceLabel?: string;
}> = ({ icon, label, value, color, sub, sourceLabel }) => (
  <View style={[styles.energyBox, { borderColor: `${color}44` }]}>
    <View style={styles.energyBoxHeader}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={styles.energyBoxLabel}>{label}</Text>
    </View>
    <Text style={[styles.energyBoxValue, { color }]}>
      {value !== null ? value : 'N/A'}
    </Text>
    {value !== null && <Text style={styles.energyBoxUnit}>kWh</Text>}
    {sub && <Text style={styles.energyBoxSub}>{sub}</Text>}
    {sourceLabel && <Text style={styles.energySourceTag}>{sourceLabel}</Text>}
  </View>
);

const FormulaStep: React.FC<{
  value: number; label: string; color?: string; highlight?: boolean;
}> = ({ value, label, color = COLORS.text, highlight }) => (
  <View style={[styles.formulaStep, highlight && styles.formulaStepHighlight]}>
    <Text style={[styles.formulaValue, { color }]}>{value}</Text>
    <Text style={styles.formulaLabel}>{label}</Text>
  </View>
);

const EmptyState: React.FC<{
  onAddBill: () => void; onSeedCanonical: () => void;
}> = ({ onAddBill, onSeedCanonical }) => (
  <View style={styles.emptyContainer}>
    <Ionicons name="sunny-outline" size={48} color={COLORS.gold} />
    <Text style={styles.emptyTitle}>Welcome to Goa SolarTrack</Text>
    <Text style={styles.emptySub}>
      Your bill-first rooftop solar accounting assistant for Goa electricity prosumers.
      {'\n\n'}Add your first monthly bill to get started, or load the canonical August 2026 test fixture.
    </Text>
    <TouchableOpacity id="btn-add-bill-empty" style={styles.emptyAddBtn} onPress={onAddBill}>
      <Ionicons name="add-circle" size={18} color={COLORS.textInverse} />
      <Text style={styles.emptyAddBtnText}>Add Monthly Bill</Text>
    </TouchableOpacity>
    <TouchableOpacity id="btn-seed-canonical" style={styles.emptySeedBtn} onPress={onSeedCanonical}>
      <Ionicons name="sparkles-outline" size={16} color={COLORS.gold} />
      <Text style={styles.emptySeedBtnText}>Load Canonical August 2026 Test Bill</Text>
    </TouchableOpacity>
  </View>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },

  summaryRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  summaryPill: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm, alignItems: 'center',
  },
  summaryPillLabel: { fontSize: 9, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryPillValue: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text, marginTop: 2 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  energyBox: {
    flex: 1, minWidth: '46%', backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.sm + 2,
  },
  energyBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  energyBoxLabel: { fontSize: 10, fontWeight: FONT.semi, color: COLORS.textMuted, textTransform: 'uppercase' },
  energyBoxValue: { fontSize: 22, fontWeight: FONT.heavy },
  energyBoxUnit: { fontSize: 11, color: COLORS.textMuted, marginTop: -2 },
  energyBoxSub: { fontSize: 10, color: COLORS.textSub, marginTop: 2 },
  energySourceTag: { fontSize: 9, color: COLORS.textMuted, marginTop: 2, fontStyle: 'italic' },

  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderSubtle, marginTop: SPACING.xs,
  },
  totalLabel: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  totalDetail: { fontSize: 10, color: COLORS.textSub, marginTop: 2 },
  estimateTag: { fontSize: 9, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },
  totalValue: { fontSize: 16, fontWeight: FONT.heavy, color: COLORS.text },

  bankHero: {
    backgroundColor: COLORS.glowGreen, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: `${COLORS.bank}44`, padding: SPACING.md, alignItems: 'center',
  },
  bankHeroLabel: { fontSize: 11, fontWeight: FONT.semi, color: COLORS.textSub, textTransform: 'uppercase' },
  bankHeroValueRow: { flexDirection: 'row', alignItems: 'baseline', marginVertical: 4 },
  bankHeroValue: { fontSize: 36, fontWeight: FONT.heavy, color: COLORS.text },
  bankHeroUnit: { fontSize: 16, fontWeight: FONT.semi, color: COLORS.bank },
  bankHeroSub: { fontSize: 11, color: COLORS.textSub },

  formulaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.sm,
  },
  formulaStep: { alignItems: 'center', flex: 1 },
  formulaStepHighlight: {
    backgroundColor: COLORS.glowGold, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: `${COLORS.gold}44`, padding: 4,
  },
  formulaValue: { fontSize: 16, fontWeight: FONT.heavy, color: COLORS.text },
  formulaLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  formulaOp: { fontSize: 14, color: COLORS.textMuted, fontWeight: FONT.bold, paddingHorizontal: 2 },

  perfRow: {
    flexDirection: 'row', backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderSubtle, padding: SPACING.md,
  },
  perfCol: { flex: 1, alignItems: 'center' },
  perfDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.sm },
  perfLabel: { fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  perfValue: { fontSize: 20, fontWeight: FONT.heavy, color: COLORS.text, marginVertical: 2 },
  perfSub: { fontSize: 10, color: COLORS.textSub, textAlign: 'center' },

  billBreakdown: {
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderSubtle, padding: SPACING.md,
  },

  careBody: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  careTextCol: { flex: 1 },
  careStatus: { fontSize: 14, fontWeight: FONT.bold },
  careRationale: { fontSize: 12, color: COLORS.textSub, marginTop: 4, lineHeight: 17 },
  careRecommendation: { fontSize: 11, color: COLORS.textMuted, marginTop: 4, lineHeight: 16, fontStyle: 'italic' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressLabelLeft: { fontSize: 9, color: COLORS.textMuted },
  progressLabelRight: { fontSize: 9, fontWeight: FONT.bold },
  progressLabelEnd: { fontSize: 9, color: COLORS.textMuted },
  careActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  logCleanBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.info, padding: 10, borderRadius: RADIUS.md,
  },
  logCleanText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.textInverse },
  viewCareBtn: {
    paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  viewCareText: { fontSize: 12, color: COLORS.textSub, fontWeight: FONT.semi },

  settlementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  settlementCol: { alignItems: 'center', flex: 1 },
  settlementColHighlight: {
    alignItems: 'center', flex: 1.2, backgroundColor: COLORS.glowGreen,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: `${COLORS.success}44`, paddingVertical: 6,
  },
  settlementLabel: { fontSize: 10, color: COLORS.textMuted },
  settlementLabelGreen: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.success },
  settlementVal: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.text },
  settlementValGreen: { fontSize: 18, fontWeight: FONT.heavy, color: COLORS.success },
  settlementOp: { fontSize: 14, color: COLORS.textMuted, fontWeight: FONT.bold },

  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.md,
  },
  emptyTitle: { fontSize: 20, fontWeight: FONT.heavy, color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: COLORS.textSub, textAlign: 'center', lineHeight: 19 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.lg, paddingVertical: 13, borderRadius: RADIUS.full,
    ...SHADOW.glow,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
  emptySeedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.glowGold, borderWidth: 1, borderColor: `${COLORS.gold}44`,
    paddingHorizontal: SPACING.lg, paddingVertical: 11, borderRadius: RADIUS.full,
  },
  emptySeedBtnText: { fontSize: 13, fontWeight: FONT.semi, color: COLORS.gold },
});
