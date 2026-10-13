// ============================================================
// Analytics Screen — PRD §13
// Monthly analytics table + annual aggregate + Solar ROI & Payback
// PRD §8.1 trend guard: only show % change when >= 3 months
// ============================================================
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill, SystemProfile } from '../types/solar';
import { Card, Divider, InfoNote, ProgressBar } from '../components/ui/UIKit';
import {
  buildMonthlyAnalytics,
  buildAnnualAnalytics,
  calculatePaybackAnalysis,
} from '../domain/analytics';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface AnalyticsScreenProps {
  bills: SolarBill[];
  profile: SystemProfile;
  cleaningEventCount: number;
  onProfileSave?: (updated: SystemProfile) => Promise<void>;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  bills, profile, cleaningEventCount, onProfileSave,
}) => {
  const monthlyRows = useMemo(
    () => buildMonthlyAnalytics(bills, profile.capacityKw),
    [bills, profile.capacityKw]
  );
  const annual = useMemo(
    () => buildAnnualAnalytics(bills, profile.capacityKw, cleaningEventCount),
    [bills, profile.capacityKw, cleaningEventCount]
  );

  const payback = useMemo(
    () => calculatePaybackAnalysis(bills, profile, annual),
    [bills, profile, annual]
  );

  const [showEditCost, setShowEditCost] = useState(false);
  const [costInput, setCostInput] = useState(String(payback.systemCostInr));
  const [isSavingCost, setIsSavingCost] = useState(false);

  const handleSaveCost = async () => {
    const parsed = parseFloat(costInput.replace(/,/g, ''));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert('Invalid Cost', 'Please enter a valid investment cost.');
      return;
    }
    if (onProfileSave) {
      try {
        setIsSavingCost(true);
        await onProfileSave({
          ...profile,
          systemCostInr: parsed,
        });
        setIsSavingCost(false);
        setShowEditCost(false);
      } catch (e: any) {
        setIsSavingCost(false);
        Alert.alert('Error', e?.message || 'Failed to save system cost.');
      }
    }
  };

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

      {/* ── Solar Investment & Payback Timeline ── */}
      <Card
        title="Solar Investment & Payback"
        subtitle="Capital recovery timeline & 100% free electricity milestone"
        badge={
          <View style={[
            styles.badge,
            payback.isFullyRecovered ? styles.badgeSuccess : styles.badgeGold,
          ]}>
            <Text style={[
              styles.badgeText,
              payback.isFullyRecovered ? { color: COLORS.success } : { color: COLORS.gold },
            ]}>
              {payback.isFullyRecovered ? '🎉 100% Free Electricity' : `${payback.recoveryPct}% Recovered`}
            </Text>
          </View>
        }
      >
        {/* Hero Target / Break-Even Box */}
        <View style={styles.breakEvenHero}>
          <View style={styles.breakEvenTop}>
            <View style={[
              styles.breakEvenIconWrap,
              payback.isFullyRecovered && { backgroundColor: `${COLORS.success}20` },
            ]}>
              <Ionicons
                name={payback.isFullyRecovered ? 'checkmark-circle' : 'calendar-outline'}
                size={22}
                color={payback.isFullyRecovered ? COLORS.success : COLORS.gold}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.breakEvenLabel}>
                {payback.isFullyRecovered ? 'FREE OF CHARGE MILESTONE' : 'FULL INVESTMENT RECOVERY BY'}
              </Text>
              <Text style={[
                styles.breakEvenDateVal,
                payback.isFullyRecovered && { color: COLORS.success },
              ]}>
                {payback.breakEvenDate}
              </Text>
            </View>
          </View>
          <Text style={styles.breakEvenSubText}>
            {payback.isFullyRecovered
              ? 'Your solar system has fully recovered its initial capital cost and now runs 100% free of charge!'
              : `Est. ${payback.yearsRemainingFormatted} remaining to recover full capital and enjoy 100% free electricity.`}
          </Text>
        </View>

        {/* 3-Col Key Metrics */}
        <View style={styles.paybackStatsGrid}>
          <View style={styles.paybackStatCol}>
            <Text style={styles.paybackStatLabel}>TOTAL PAYBACK</Text>
            <Text style={[styles.paybackStatVal, { color: COLORS.text }]}>
              {payback.paybackYearsTotal > 0 ? `${payback.paybackYearsTotal} Yrs` : '—'}
            </Text>
            <Text style={styles.paybackStatSub}>From installation</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.paybackStatCol}>
            <Text style={styles.paybackStatLabel}>RECOVERED SO FAR</Text>
            <Text style={[styles.paybackStatVal, { color: COLORS.success }]}>
              ₹{payback.recoveredSoFarInr.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.paybackStatSub}>{payback.recoveryPct}% of investment</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.paybackStatCol}>
            <Text style={styles.paybackStatLabel}>ANNUAL SAVINGS</Text>
            <Text style={[styles.paybackStatVal, { color: COLORS.gold }]}>
              ₹{payback.annualProjectedSavingsInr.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.paybackStatSub}>~₹{Math.round(payback.monthlyAverageSavingsInr).toLocaleString('en-IN')}/mo</Text>
          </View>
        </View>

        {/* Recovery Progress Bar */}
        <View style={styles.recoveryBarSection}>
          <View style={styles.recoveryBarHeader}>
            <Text style={styles.recoveryBarTitle}>Capital Recovery Progress</Text>
            <Text style={[styles.recoveryBarPct, payback.isFullyRecovered && { color: COLORS.success }]}>
              {payback.recoveryPct}%
            </Text>
          </View>
          <ProgressBar
            value={payback.recoveryPct}
            color={payback.isFullyRecovered ? COLORS.success : COLORS.gold}
          />
          <View style={styles.recoveryBarFooter}>
            <Text style={styles.recoveryMarkerText}>
              Installed {profile.installationDate ? profile.installationDate.slice(0, 7) : 'Day 1'}
            </Text>
            <Text style={styles.recoveryMarkerText}>
              {payback.remainingInr > 0 ? `₹${payback.remainingInr.toLocaleString('en-IN')} left` : 'Fully recovered'}
            </Text>
            <Text style={[
              styles.recoveryMarkerText,
              { color: payback.isFullyRecovered ? COLORS.success : COLORS.gold, fontWeight: FONT.semi },
            ]}>
              {payback.isFullyRecovered ? 'Free Electricity' : payback.breakEvenDate}
            </Text>
          </View>
        </View>

        {/* Free of Charge / 25-Year Life Highlight Card */}
        <View style={styles.freeElectricityCard}>
          <View style={styles.freeHeaderRow}>
            <Ionicons name="sparkles" size={16} color={COLORS.gold} />
            <Text style={styles.freeHeaderTitle}>Post-Recovery: 100% Free Electricity</Text>
          </View>
          <Text style={styles.freeBodyText}>
            After full recovery in <Text style={{ fontWeight: FONT.bold, color: COLORS.text }}>{payback.breakEvenDate}</Text>,
            every unit of solar power generated is completely free of capital cost for the remainder of the panel's 25-year lifespan.
          </Text>
          <View style={styles.profitBanner}>
            <Text style={styles.profitBannerLabel}>ESTIMATED 25-YEAR NET LIFETIME SAVINGS</Text>
            <Text style={styles.profitBannerVal}>
              ₹{payback.estimated25YearNetProfitInr.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        <Divider style={{ marginVertical: SPACING.sm }} />

        {/* System Investment Cost Details & Customization */}
        <View style={styles.costFooterRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.costLabel}>System Investment Capital</Text>
            <Text style={styles.costVal}>
              ₹{payback.systemCostInr.toLocaleString('en-IN')}
              <Text style={styles.costTag}>
                {payback.isBenchmarkCost ? ' (Goa benchmark ₹55k/kW)' : ' (Customized)'}
              </Text>
            </Text>
          </View>
          {onProfileSave && (
            <TouchableOpacity
              id="btn-edit-system-cost"
              style={styles.editCostBtn}
              onPress={() => {
                setCostInput(String(payback.systemCostInr));
                setShowEditCost(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil" size={13} color={COLORS.gold} />
              <Text style={styles.editCostBtnText}>Edit Cost</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>

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

      {/* ── Edit Investment Modal ── */}
      <Modal visible={showEditCost} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Solar Investment</Text>
              <TouchableOpacity
                id="btn-close-edit-cost"
                onPress={() => setShowEditCost(false)}
              >
                <Ionicons name="close" size={22} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              <Text style={styles.fieldLabel}>Total System Investment Cost (₹)</Text>
              <TextInput
                style={styles.input}
                value={costInput}
                onChangeText={setCostInput}
                keyboardType="numeric"
                placeholder="e.g. 250000"
                placeholderTextColor={COLORS.textMuted}
              />
              <InfoNote
                text="Enter the net capital expenditure for your rooftop solar system after central PM Surya Ghar and state subsidies. Default benchmark for Goa is ₹55,000 / kW."
                color={COLORS.gold}
                style={{ marginTop: SPACING.md }}
              />
            </View>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                id="btn-cancel-cost"
                style={styles.cancelBtn}
                onPress={() => setShowEditCost(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-save-cost"
                style={[styles.saveBtn, isSavingCost && { opacity: 0.65 }]}
                onPress={handleSaveCost}
                disabled={isSavingCost}
              >
                <Text style={styles.saveBtnText}>
                  {isSavingCost ? 'Saving…' : 'Save Investment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  badgeSuccess: { backgroundColor: COLORS.glowGreen, borderColor: `${COLORS.success}44` },
  badgeGold: { backgroundColor: COLORS.glowGold, borderColor: `${COLORS.gold}44` },
  badgeText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.success },

  breakEvenHero: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: `${COLORS.gold}33`,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  breakEvenTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 6,
  },
  breakEvenIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: `${COLORS.gold}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakEvenLabel: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakEvenDateVal: {
    fontSize: 20,
    fontWeight: FONT.heavy,
    color: COLORS.text,
    marginTop: 1,
  },
  breakEvenSubText: {
    fontSize: 12,
    color: COLORS.textSub,
    lineHeight: 16,
  },

  paybackStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.md,
  },
  paybackStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  paybackStatLabel: {
    fontSize: 9,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  paybackStatVal: {
    fontSize: 14,
    fontWeight: FONT.heavy,
    marginTop: 3,
  },
  paybackStatSub: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },

  recoveryBarSection: {
    marginBottom: SPACING.md,
  },
  recoveryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recoveryBarTitle: {
    fontSize: 11,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
  recoveryBarPct: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.gold,
  },
  recoveryBarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  recoveryMarkerText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  freeElectricityCard: {
    backgroundColor: `${COLORS.gold}0D`,
    borderWidth: 1,
    borderColor: `${COLORS.gold}30`,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  freeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  freeHeaderTitle: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.gold,
  },
  freeBodyText: {
    fontSize: 11,
    color: COLORS.textSub,
    lineHeight: 16,
    marginBottom: 8,
  },
  profitBanner: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: `${COLORS.gold}22`,
    padding: 8,
    alignItems: 'center',
  },
  profitBannerLabel: {
    fontSize: 9,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
    letterSpacing: 0.4,
  },
  profitBannerVal: {
    fontSize: 16,
    fontWeight: FONT.heavy,
    color: COLORS.success,
    marginTop: 2,
  },

  costFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  costLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  costVal: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
    marginTop: 2,
  },
  costTag: {
    fontSize: 10,
    fontWeight: FONT.regular,
    color: COLORS.textMuted,
  },
  editCostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.glowGold,
    borderWidth: 1,
    borderColor: `${COLORS.gold}44`,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  editCostBtnText: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.gold,
  },

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

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: FONT.bold, color: COLORS.text },
  sheetBody: { padding: SPACING.lg },
  fieldLabel: { fontSize: 11, fontWeight: FONT.semi, color: COLORS.textSub, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.lg,
  },
  cancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: 14, fontWeight: FONT.semi, color: COLORS.textSub },
  saveBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, padding: 12, borderRadius: RADIUS.md },
  saveBtnText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
});
