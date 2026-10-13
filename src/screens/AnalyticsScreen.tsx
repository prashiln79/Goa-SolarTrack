// ============================================================
// Analytics Screen — Clean & Simplified UI (PRD §13)
// Monthly analytics table + annual aggregate + Solar ROI & Payback
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
import { saveSystemProfile } from '../services/solarStorage';
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

    try {
      setIsSavingCost(true);
      const updatedProfile: SystemProfile = {
        ...profile,
        systemCostInr: parsed,
      };

      // 1. Persist directly to Firebase Firestore & AsyncStorage
      await saveSystemProfile(updatedProfile);

      // 2. Notify parent state handler if provided
      if (onProfileSave) {
        await onProfileSave(updatedProfile);
      }

      setIsSavingCost(false);
      setShowEditCost(false);
      Alert.alert('Saved', 'System investment cost updated & synced with Firebase.');
    } catch (e: any) {
      setIsSavingCost(false);
      Alert.alert('Error', e?.message || 'Failed to save system cost.');
    }
  };

  const tableRows = [...monthlyRows].reverse();

  const selfSufficiencyPct =
    annual.totalGenerationKwh > 0
      ? Math.round(
          (annual.totalDirectUseKwh /
            (annual.totalDirectUseKwh + annual.totalImportKwh)) * 100
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
        Summary across {bills.length} billing cycle{bills.length === 1 ? '' : 's'}
      </Text>

      {/* ── 1. Solar Investment & Payback Timeline ── */}
      <Card
        title="Solar Investment & Payback"
        subtitle={payback.isFullyRecovered ? 'Capital fully recovered!' : `Target break-even: ${payback.breakEvenDate}`}
        badge={
          <View style={[styles.badge, payback.isFullyRecovered ? styles.badgeSuccess : styles.badgeGold]}>
            <Text style={[styles.badgeText, payback.isFullyRecovered ? { color: COLORS.success } : { color: COLORS.gold }]}>
              {payback.isFullyRecovered ? '🎉 100% Free Power' : `${payback.recoveryPct}% Recovered`}
            </Text>
          </View>
        }
      >
        {/* Recovery Progress */}
        <View style={styles.recoveryBox}>
          <View style={styles.recoveryHeader}>
            <Text style={styles.recoveryTitle}>Capital Recovery Progress</Text>
            <Text style={[styles.recoveryPctText, payback.isFullyRecovered && { color: COLORS.success }]}>
              {payback.recoveryPct}%
            </Text>
          </View>
          <ProgressBar
            value={payback.recoveryPct}
            color={payback.isFullyRecovered ? COLORS.success : COLORS.gold}
          />
          <View style={styles.recoveryFooter}>
            <Text style={styles.footerMarker}>
              Installed {profile.installationDate ? profile.installationDate.slice(0, 7) : 'Day 1'}
            </Text>
            <Text style={styles.footerMarker}>
              {payback.remainingInr > 0 ? `₹${payback.remainingInr.toLocaleString('en-IN')} left` : 'Fully recovered'}
            </Text>
            <Text style={[styles.footerMarker, { color: payback.isFullyRecovered ? COLORS.success : COLORS.gold, fontWeight: FONT.semi }]}>
              {payback.isFullyRecovered ? 'Free Electricity' : payback.breakEvenDate}
            </Text>
          </View>
        </View>

        {/* 3 Metrics: Invested, Recovered, Savings */}
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>INVESTMENT</Text>
            <Text style={styles.metricVal}>₹{(payback.systemCostInr / 1000).toFixed(0)}k</Text>
            <TouchableOpacity
              id="btn-edit-system-cost"
              style={styles.editPill}
              onPress={() => {
                setCostInput(String(payback.systemCostInr));
                setShowEditCost(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={11} color={COLORS.gold} />
              <Text style={styles.editPillText}>Edit Cost</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statSep} />

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>RECOVERED</Text>
            <Text style={[styles.metricVal, { color: COLORS.success }]}>
              ₹{(payback.recoveredSoFarInr / 1000).toFixed(0)}k
            </Text>
            <Text style={styles.metricSub}>{payback.recoveryPct}% recovered</Text>
          </View>

          <View style={styles.statSep} />

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ANNUAL SAVINGS</Text>
            <Text style={[styles.metricVal, { color: COLORS.gold }]}>
              ₹{(payback.annualProjectedSavingsInr / 1000).toFixed(0)}k
            </Text>
            <Text style={styles.metricSub}>~₹{Math.round(payback.monthlyAverageSavingsInr).toLocaleString('en-IN')}/mo</Text>
          </View>
        </View>

        {/* Lifetime Profit Highlight */}
        <View style={styles.lifetimeBanner}>
          <Ionicons name="sparkles" size={16} color={COLORS.gold} />
          <Text style={styles.lifetimeText}>
            Est. 25-Year Net Profit:{' '}
            <Text style={styles.lifetimeVal}>
              ₹{payback.estimated25YearNetProfitInr.toLocaleString('en-IN')}
            </Text>
          </Text>
        </View>
      </Card>

      {bills.length === 0 && (
        <InfoNote text="Add your first monthly bill to see analytics." color={COLORS.info} />
      )}

      {/* ── 2. Annual Summary (Energy & Financials) ── */}
      {bills.length > 0 && (
        <Card
          title="Lifetime / Annual Summary"
          subtitle="Aggregate figures across all bills"
        >
          {/* Savings vs Bills Paid */}
          <View style={styles.impactRow}>
            <View style={styles.impactCol}>
              <Text style={styles.impactLabel}>EST. SOLAR SAVINGS</Text>
              <Text style={[styles.impactVal, { color: COLORS.success }]}>
                ₹{annual.estimatedAvoidedCostInr.toFixed(0)}
              </Text>
              <Text style={styles.impactSub}>Avoided LTDS-II cost</Text>
            </View>
            <View style={styles.impactDivider} />
            <View style={styles.impactCol}>
              <Text style={styles.impactLabel}>TOTAL BILLS PAID</Text>
              <Text style={[styles.impactVal, { color: COLORS.text }]}>
                ₹{annual.totalBillsPaid.toFixed(0)}
              </Text>
              <Text style={styles.impactSub}>Fixed charges, duties</Text>
            </View>
          </View>

          <Divider style={{ marginVertical: SPACING.sm }} />

          {/* 4 Energy Flow Cards */}
          <View style={styles.energyFlowGrid}>
            <FlowItem label="Total Generated" value={annual.totalGenerationKwh} color={COLORS.generation} icon="sunny-outline" />
            <FlowItem label="Direct Solar Use" value={annual.totalDirectUseKwh} color={COLORS.directUse} icon="flash-outline" />
            <FlowItem label="Total Exported" value={annual.totalExportKwh} color={COLORS.export} icon="arrow-up-outline" />
            <FlowItem label="Total Imported" value={annual.totalImportKwh} color={COLORS.import} icon="arrow-down-outline" />
          </View>

          {/* Self-Sufficiency */}
          <View style={styles.selfSuffBox}>
            <View style={styles.selfSuffHeader}>
              <Text style={styles.selfSuffLabel}>Direct Solar Self-Sufficiency</Text>
              <Text style={[styles.selfSuffPct, { color: COLORS.directUse }]}>{selfSufficiencyPct}%</Text>
            </View>
            <ProgressBar value={selfSufficiencyPct} color={COLORS.directUse} />
            <Text style={styles.selfSuffNote}>
              Percentage of total electricity needs met directly by daytime solar.
            </Text>
          </View>
        </Card>
      )}

      {/* ── 3. Monthly Performance Table ── */}
      {tableRows.length > 0 && (
        <Card
          title="Monthly Performance Table"
          subtitle="Cycle-by-cycle generation, credits and bills"
        >
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
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.generation, fontWeight: FONT.semi }]}>
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
                  {isSavingCost ? 'Saving to Firebase…' : 'Save Investment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
};

const FlowItem: React.FC<{ label: string; value: number; color: string; icon: string }> = ({
  label, value, color, icon,
}) => (
  <View style={styles.flowItem}>
    <Ionicons name={icon as any} size={15} color={color} />
    <Text style={styles.flowLabel}>{label}</Text>
    <Text style={[styles.flowValue, { color }]}>{value} <Text style={styles.flowUnit}>kWh</Text></Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20, gap: SPACING.md },
  pageTitle: { fontSize: 22, fontWeight: FONT.heavy, color: COLORS.text, marginBottom: 2 },
  pageSub: { fontSize: 13, color: COLORS.textSub },

  badge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full,
  },
  badgeSuccess: { backgroundColor: `${COLORS.success}20`, borderWidth: 1, borderColor: `${COLORS.success}44` },
  badgeGold: { backgroundColor: `${COLORS.gold}20`, borderWidth: 1, borderColor: `${COLORS.gold}44` },
  badgeText: { fontSize: 11, fontWeight: FONT.bold },

  // Recovery Section
  recoveryBox: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  recoveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recoveryTitle: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  recoveryPctText: { fontSize: 14, fontWeight: FONT.heavy, color: COLORS.gold },
  recoveryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerMarker: { fontSize: 10, color: COLORS.textMuted },

  // 3-Metric Row
  metricRow: {
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
  metricCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricVal: {
    fontSize: 15,
    fontWeight: FONT.heavy,
    color: COLORS.text,
    marginVertical: 3,
  },
  metricSub: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  statSep: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${COLORS.gold}18`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  editPillText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.gold,
  },

  // Lifetime Banner
  lifetimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: `${COLORS.gold}10`,
    borderWidth: 1,
    borderColor: `${COLORS.gold}25`,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  lifetimeText: { fontSize: 12, color: COLORS.textSub },
  lifetimeVal: { fontWeight: FONT.heavy, color: COLORS.success },

  // Financial Impact (Savings vs Paid)
  impactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs },
  impactCol: { flex: 1, alignItems: 'center' },
  impactDivider: { width: 1, height: 44, backgroundColor: COLORS.border },
  impactLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  impactVal: { fontSize: 20, fontWeight: FONT.heavy, marginTop: 2 },
  impactSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },

  // Energy Flow Grid
  energyFlowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginVertical: SPACING.xs },
  flowItem: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: 2,
  },
  flowLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  flowValue: { fontSize: 14, fontWeight: FONT.heavy },
  flowUnit: { fontSize: 10, fontWeight: FONT.regular, color: COLORS.textMuted },

  // Self-Sufficiency
  selfSuffBox: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    padding: SPACING.md,
    marginTop: SPACING.xs,
    gap: 6,
  },
  selfSuffHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selfSuffLabel: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  selfSuffPct: { fontSize: 15, fontWeight: FONT.heavy },
  selfSuffNote: { fontSize: 10, color: COLORS.textMuted, lineHeight: 14 },

  // Table
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 10, fontWeight: FONT.heavy, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  tdPeriod: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  trendBadge: { fontSize: 9, fontWeight: FONT.bold, marginTop: 1 },
  td: { fontSize: 12, color: COLORS.text },
  avgDay: { fontSize: 10, color: COLORS.textMuted, paddingHorizontal: 4, paddingBottom: 4 },

  // Edit Modal
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
