// ============================================================
// Analytics Screen — Clean, Minimal, and Spacious Layout
// Monthly analytics table + annual aggregate + Solar ROI & Payback
// ============================================================
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
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
  bills,
  profile,
  cleaningEventCount,
  onProfileSave,
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

  const parseSystemCostInput = (input: string): number => {
    const clean = input.trim().toLowerCase().replace(/,/g, '');
    if (!clean) return 0;

    const lakhMatch = clean.match(/^([\d.]+)\s*(?:lakh|lakhs|lac|lacs|l)$/);
    if (lakhMatch) {
      const val = parseFloat(lakhMatch[1]);
      return isNaN(val) ? 0 : Math.round(val * 100000);
    }

    const kMatch = clean.match(/^([\d.]+)\s*k$/);
    if (kMatch) {
      const val = parseFloat(kMatch[1]);
      return isNaN(val) ? 0 : Math.round(val * 1000);
    }

    const num = parseFloat(clean);
    if (isNaN(num) || num <= 0) return 0;
    if (num <= 100) {
      return Math.round(num * 100000);
    }
    return Math.round(num);
  };

  const handleSaveCost = async () => {
    const parsed = parseSystemCostInput(costInput);
    if (parsed <= 0) {
      Alert.alert('Invalid Cost', 'Please enter a valid investment cost (e.g. 300000 or 3 Lac).');
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

  const totalConsumptionKwh = annual.totalDirectUseKwh + annual.totalImportKwh;
  const selfSufficiencyPct =
    totalConsumptionKwh > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((annual.totalDirectUseKwh / totalConsumptionKwh) * 100)
          )
        )
      : 0;

  const formatInrCompact = (val: number): string => {
    if (val >= 100000) {
      const inLakhs = val / 100000;
      return `₹${inLakhs.toFixed(inLakhs % 1 === 0 ? 0 : 1)}L`;
    }
    if (val >= 10000) {
      return `₹${(val / 1000).toFixed(1)}k`;
    }
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Page Header ── */}
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Solar Analytics</Text>
        <Text style={styles.pageSub}>
          Summary across {bills.length} billing cycle{bills.length === 1 ? '' : 's'}
        </Text>
      </View>

      {/* ── 1. Solar Investment & Payback Timeline ── */}
      <Card
        title="Investment & Payback"
        subtitle={
          payback.isFullyRecovered
            ? 'Capital fully recovered!'
            : payback.remainingMonths > 0
            ? `Target break-even: ${payback.breakEvenDate} (${payback.yearsRemainingFormatted})`
            : `Target break-even: ${payback.breakEvenDate}`
        }
        style={styles.cardSpacing}
        badge={
          <View style={[styles.badge, payback.isFullyRecovered ? styles.badgeSuccess : styles.badgeGold]}>
            <Text style={[styles.badgeText, payback.isFullyRecovered ? { color: COLORS.success } : { color: '#D97706' }]}>
              {payback.isFullyRecovered ? '🎉 100% Free Power' : `${payback.recoveryPct}% Recovered`}
            </Text>
          </View>
        }
      >
        {/* Recovery Progress Bar */}
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
            height={7}
          />
          <View style={styles.recoveryFooter}>
            <Text style={styles.footerMarker}>
              Installed {profile.installationDate ? profile.installationDate.slice(0, 7) : 'Day 1'}
            </Text>
            <Text style={styles.footerMarker}>
              {payback.remainingInr > 0 ? `₹${payback.remainingInr.toLocaleString('en-IN')} left` : 'Fully recovered'}
            </Text>
            <Text
              style={[
                styles.footerMarker,
                { color: payback.isFullyRecovered ? COLORS.success : '#D97706', fontWeight: FONT.semi },
              ]}
            >
              {payback.isFullyRecovered ? 'Free Electricity' : payback.breakEvenDate}
            </Text>
          </View>
        </View>

        {/* 3 Metric Tiles: Invested, Recovered, Savings */}
        <View style={styles.metricGrid}>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>INVESTMENT</Text>
            <Text style={styles.metricVal}>{formatInrCompact(payback.systemCostInr)}</Text>
            <TouchableOpacity
              id="btn-edit-system-cost"
              style={styles.editPill}
              onPress={() => {
                setCostInput(String(payback.systemCostInr));
                setShowEditCost(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={10} color="#D97706" />
              <Text style={styles.editPillText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>RECOVERED</Text>
            <Text style={[styles.metricVal, { color: COLORS.success }]}>
              {formatInrCompact(payback.recoveredSoFarInr)}
            </Text>
            <Text style={styles.metricSub}>{payback.recoveryPct}% recovered</Text>
          </View>

          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>ANNUAL SAVINGS</Text>
            <Text style={[styles.metricVal, { color: '#D97706' }]}>
              {formatInrCompact(payback.annualProjectedSavingsInr)}
            </Text>
            <Text style={styles.metricSub}>~₹{Math.round(payback.monthlyAverageSavingsInr).toLocaleString('en-IN')}/mo</Text>
          </View>
        </View>

        {/* Lifetime Profit Highlight Banner */}
        <View style={styles.lifetimeBanner}>
          <Ionicons name="sparkles" size={15} color="#D97706" />
          <Text style={styles.lifetimeText}>
            Est. 25-Year Net Profit:{' '}
            <Text style={styles.lifetimeVal}>
              ₹{payback.estimated25YearNetProfitInr.toLocaleString('en-IN')}
            </Text>
          </Text>
        </View>
      </Card>

      {bills.length === 0 && (
        <InfoNote text="Add your first monthly bill to see analytics." color={COLORS.info} style={styles.cardSpacing} />
      )}

      {/* ── 2. Lifetime / Annual Summary ── */}
      {bills.length > 0 && (
        <Card
          title="Lifetime Summary"
          subtitle="Aggregate figures across all bills"
          style={styles.cardSpacing}
        >
          {/* Savings vs Bills Paid */}
          <View style={styles.impactRow}>
            <View style={styles.impactCol}>
              <Text style={styles.impactLabel}>EST. SOLAR SAVINGS</Text>
              <Text style={[styles.impactVal, { color: COLORS.success }]}>
                ₹{Math.round(annual.estimatedAvoidedCostInr).toLocaleString('en-IN')}
              </Text>
              <Text style={styles.impactSub}>Avoided LTDS-II cost</Text>
            </View>
            <View style={styles.impactDivider} />
            <View style={styles.impactCol}>
              <Text style={styles.impactLabel}>TOTAL BILLS PAID</Text>
              <Text style={[styles.impactVal, { color: COLORS.text }]}>
                ₹{Math.round(annual.totalBillsPaid).toLocaleString('en-IN')}
              </Text>
              <Text style={styles.impactSub}>Fixed charges & duties</Text>
            </View>
          </View>

          <Divider style={{ marginVertical: SPACING.md }} />

          {/* 4 Energy Flow Cards (2x2 Grid) */}
          <View style={styles.energyFlowGrid}>
            <View style={styles.flowTile}>
              <View style={styles.flowTileHeader}>
                <View style={[styles.flowIconBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="sunny" size={14} color="#D97706" />
                </View>
                <Text style={styles.flowTileLabel}>Total Generated</Text>
              </View>
              <Text style={[styles.flowTileVal, { color: '#D97706' }]}>
                {annual.totalGenerationKwh} <Text style={styles.flowTileUnit}>kWh</Text>
              </Text>
            </View>

            <View style={styles.flowTile}>
              <View style={styles.flowTileHeader}>
                <View style={[styles.flowIconBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="flash" size={14} color="#059669" />
                </View>
                <Text style={styles.flowTileLabel}>Direct Solar Use</Text>
              </View>
              <Text style={[styles.flowTileVal, { color: '#059669' }]}>
                {annual.totalDirectUseKwh} <Text style={styles.flowTileUnit}>kWh</Text>
              </Text>
            </View>

            <View style={styles.flowTile}>
              <View style={styles.flowTileHeader}>
                <View style={[styles.flowIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="arrow-up" size={14} color="#059669" />
                </View>
                <Text style={styles.flowTileLabel}>Total Exported</Text>
              </View>
              <Text style={[styles.flowTileVal, { color: COLORS.text }]}>
                {annual.totalExportKwh} <Text style={styles.flowTileUnit}>kWh</Text>
              </Text>
            </View>

            <View style={styles.flowTile}>
              <View style={styles.flowTileHeader}>
                <View style={[styles.flowIconBadge, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="arrow-down" size={14} color="#0284C7" />
                </View>
                <Text style={styles.flowTileLabel}>Total Imported</Text>
              </View>
              <Text style={[styles.flowTileVal, { color: COLORS.text }]}>
                {annual.totalImportKwh} <Text style={styles.flowTileUnit}>kWh</Text>
              </Text>
            </View>
          </View>

          {/* Direct Solar Self-Sufficiency */}
          <View style={styles.selfSuffBox}>
            <View style={styles.selfSuffHeader}>
              <Text style={styles.selfSuffLabel}>Direct Solar Self-Sufficiency</Text>
              <Text style={[styles.selfSuffPct, { color: '#059669' }]}>{selfSufficiencyPct}%</Text>
            </View>
            <ProgressBar value={selfSufficiencyPct} color="#059669" height={7} />
            <Text style={styles.selfSuffNote}>
              Percentage of total electricity needs met directly by daytime solar.
            </Text>
          </View>
        </Card>
      )}

      {/* ── 3. Monthly Performance Table ── */}
      {tableRows.length > 0 && (
        <Card
          title="Monthly Performance"
          subtitle="Cycle-by-cycle generation, credits, and bills"
          style={styles.cardSpacing}
        >
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { flex: 1.6 }]}>Period</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Gen</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Export</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Credit</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Bill</Text>
          </View>

          {tableRows.map((row, idx) => (
            <View key={row.period} style={styles.tableRowContainer}>
              <View style={styles.tableRow}>
                <View style={{ flex: 1.6 }}>
                  <Text style={styles.tdPeriod} numberOfLines={1}>{row.period}</Text>
                  {row.monthOverMonthChangePct !== null && (
                    <Text
                      style={[
                        styles.trendBadge,
                        { color: row.monthOverMonthChangePct >= 0 ? COLORS.success : COLORS.danger },
                      ]}
                    >
                      {row.monthOverMonthChangePct >= 0 ? '▲' : '▼'} {Math.abs(row.monthOverMonthChangePct)}%
                    </Text>
                  )}
                </View>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#D97706', fontWeight: FONT.semi }]}>
                  {row.generationKwh !== null ? row.generationKwh : '—'}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.text }]}>
                  {row.exportKwh}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#059669', fontWeight: FONT.medium }]}>
                  {row.closingCreditKwh}
                </Text>
                <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: FONT.bold }]}>
                  ₹{Math.round(row.billAmount).toLocaleString('en-IN')}
                </Text>
              </View>
              {row.avgGenerationPerDay !== null && (
                <Text style={styles.avgDay}>
                  {row.avgGenerationPerDay} kWh/day avg · {row.billingDays} days
                </Text>
              )}
              {idx < tableRows.length - 1 && <View style={styles.tableDivider} />}
            </View>
          ))}

          {bills.length < 3 && (
            <InfoNote
              text="Month-over-month trend (▲▼%) will appear after 3+ completed billing cycles. PRD §8.1."
              color={COLORS.info}
              style={{ marginTop: SPACING.md }}
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
                text="Enter net capital expenditure for your rooftop solar system after central PM Surya Ghar and state subsidies. Default benchmark for Goa is ₹55,000 / kW."
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl + 24,
  },
  topBar: {
    marginBottom: SPACING.md,
    paddingHorizontal: 2,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: FONT.heavy,
    color: COLORS.text,
  },
  pageSub: {
    fontSize: 12,
    color: COLORS.textSub,
    marginTop: 2,
  },
  cardSpacing: {
    marginBottom: SPACING.lg,
  },

  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  badgeSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeGold: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: FONT.bold,
  },

  // Recovery Section
  recoveryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  recoveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recoveryTitle: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
  recoveryPctText: {
    fontSize: 14,
    fontWeight: FONT.heavy,
    color: '#D97706',
  },
  recoveryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerMarker: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // 3-Metric Grid
  metricGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  metricTile: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: FONT.heavy,
    color: COLORS.text,
    marginVertical: 3,
  },
  metricSub: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginTop: 2,
  },
  editPillText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: '#D97706',
  },

  // Lifetime Banner
  lifetimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  lifetimeText: {
    fontSize: 12,
    color: COLORS.textSub,
  },
  lifetimeVal: {
    fontWeight: FONT.heavy,
    color: '#059669',
  },

  // Financial Impact (Savings vs Paid)
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  impactCol: {
    flex: 1,
    alignItems: 'center',
  },
  impactDivider: {
    width: 1,
    height: 42,
    backgroundColor: '#E2E8F0',
  },
  impactLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: FONT.semi,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  impactVal: {
    fontSize: 20,
    fontWeight: FONT.heavy,
    marginTop: 3,
  },
  impactSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Energy Flow Grid (2x2)
  energyFlowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  flowTile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  flowTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  flowIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowTileLabel: {
    fontSize: 11,
    color: COLORS.textSub,
    fontWeight: FONT.medium,
  },
  flowTileVal: {
    fontSize: 16,
    fontWeight: FONT.heavy,
    marginTop: 2,
  },
  flowTileUnit: {
    fontSize: 11,
    fontWeight: FONT.regular,
    color: COLORS.textMuted,
  },

  // Self-Sufficiency
  selfSuffBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    padding: SPACING.md,
    gap: 6,
  },
  selfSuffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selfSuffLabel: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
  selfSuffPct: {
    fontSize: 14,
    fontWeight: FONT.heavy,
  },
  selfSuffNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
  },

  // Table
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: {
    fontSize: 10,
    fontWeight: FONT.heavy,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRowContainer: {
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tdPeriod: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
  trendBadge: {
    fontSize: 9,
    fontWeight: FONT.bold,
    marginTop: 1,
  },
  td: {
    fontSize: 12,
    color: COLORS.text,
  },
  avgDay: {
    fontSize: 10,
    color: COLORS.textMuted,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  tableDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginTop: 6,
  },

  // Edit Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
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
  sheetTitle: {
    fontSize: 18,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  sheetBody: {
    padding: SPACING.lg,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.lg,
  },
  cancelBtn: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  saveBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    padding: 12,
    borderRadius: RADIUS.md,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },
});
