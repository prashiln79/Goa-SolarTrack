// ============================================================
// Analytics Screen — Clean, Modern & Human-Friendly Solar Analytics
// Matches the visual reference: Investment recovery + System health child cards
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
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill, SystemProfile, CareAssessment } from '../types/solar';
import {
  buildMonthlyAnalytics,
  buildAnnualAnalytics,
  calculatePaybackAnalysis,
} from '../domain/analytics';
import { analyzeIntelligentPerformance } from '../domain/intelligentAnalysis';
import { saveSystemProfile } from '../services/solarStorage';
import { SHADOW } from '../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AnalyticsScreenProps {
  bills: SolarBill[];
  profile: SystemProfile;
  cleaningEventCount: number;
  careAssessment?: CareAssessment;
  onProfileSave?: (updated: SystemProfile) => Promise<void>;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  bills,
  profile,
  cleaningEventCount,
  careAssessment,
  onProfileSave,
}) => {
  const insets = useSafeAreaInsets();

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
  const smartAnalysis = useMemo(
    () => analyzeIntelligentPerformance(bills, profile, careAssessment),
    [bills, profile, careAssessment]
  );

  const latestBill = bills.length > 0 ? bills[0] : null;

  // Expansion states for details
  const [isBillDetailExpanded, setIsBillDetailExpanded] = useState(false);
  const [isSolarDetailExpanded, setIsSolarDetailExpanded] = useState(false);
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  // Edit investment cost modal state
  const [showEditCost, setShowEditCost] = useState(false);
  const [costInput, setCostInput] = useState(String(payback.systemCostInr));
  const [isSavingCost, setIsSavingCost] = useState(false);

  // Installed date formatting e.g. "Oct 2026"
  const installedMonthYear = useMemo(() => {
    if (!profile.installationDate) return 'Oct 2026';
    try {
      const parts = profile.installationDate.split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1] || 1);
      const d = new Date(y, m - 1, 1);
      return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    } catch {
      return profile.installationDate;
    }
  }, [profile.installationDate]);

  // Average daily solar gen calculation
  const dailyGenKwh = useMemo(() => {
    if (smartAnalysis.solarAnalysis.currentDailyGenKwh !== null) {
      return smartAnalysis.solarAnalysis.currentDailyGenKwh.toFixed(1);
    }
    const billCount = Math.max(1, bills.length);
    if (annual.totalGenerationKwh > 0) {
      return (annual.totalGenerationKwh / (billCount * 30)).toFixed(1);
    }
    return ((profile.capacityKw || 5) * 2.78).toFixed(1);
  }, [smartAnalysis.solarAnalysis.currentDailyGenKwh, annual.totalGenerationKwh, bills.length, profile.capacityKw]);

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
        updatedAt: Date.now(),
      };

      await saveSystemProfile(updatedProfile);

      if (onProfileSave) {
        await onProfileSave(updatedProfile);
      }

      setIsSavingCost(false);
      setShowEditCost(false);
      Alert.alert('Saved', 'System investment cost updated successfully.');
    } catch (e: any) {
      setIsSavingCost(false);
      Alert.alert('Error', e?.message || 'Failed to save system cost.');
    }
  };

  const tableRows = [...monthlyRows].reverse();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Screen Header ── */}
      {/* <View style={styles.headerRow}>
        <View style={styles.headerIconBox}>
          <Ionicons name="sunny" size={24} color="#EA580C" />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.screenTitle}>Solar Analytics</Text>
          <Text style={styles.screenSub}>Your solar savings at a glance</Text>
        </View>
      </View> */}

      {/* ── Card 1: Your investment ── */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTitleCol}>
            <Text style={styles.cardTitle}>Your investment</Text>
            <Text style={styles.cardSub}>
              How much of your solar system cost is recovered through savings.
            </Text>
          </View>
          <View style={styles.paidBackBadge}>
            <Text style={styles.paidBackBadgeText}>
              {payback.recoveryPct}% paid back
            </Text>
          </View>
        </View>

        {/* Horizontal Progress Bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, Math.max(payback.recoveryPct > 0 ? 3 : 0, payback.recoveryPct))}%` },
            ]}
          />
        </View>

        {/* Milestones row */}
        <View style={styles.milestonesRow}>
          <Text style={styles.milestoneText}>
            Installed {installedMonthYear}
          </Text>
          <Text style={styles.milestoneText}>
            Break-even around{' '}
            <Text style={styles.breakEvenHighlight}>
              {payback.isFullyRecovered ? 'Recovered 🎉' : payback.breakEvenDate}
            </Text>
          </Text>
        </View>

        {/* 2-Tile Split: Saved so far & Estimated yearly savings */}
        <View style={styles.tilesSplitRow}>
          {/* Left: Saved so far */}
          <View style={styles.savedTile}>
            <Ionicons name="wallet-outline" size={24} color="#16A34A" />
            <Text style={styles.savedTileAmount}>
              ₹{Math.round(payback.recoveredSoFarInr).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.savedTileLabel}>saved so far</Text>
          </View>

          {/* Right: Estimated yearly savings */}
          <View style={styles.yearlyTile}>
            <Ionicons name="stats-chart" size={24} color="#EA580C" />
            <Text style={styles.yearlyTileAmount}>
              ₹{Math.round(payback.annualProjectedSavingsInr).toLocaleString('en-IN')}
            </Text>
            <View style={styles.yearlyTileLabelRow}>
              <Text style={styles.yearlyTileLabel}>estimated yearly savings</Text>
              <Ionicons name="information-circle-outline" size={13} color="#94A3B8" />
            </View>
          </View>
        </View>

        {/* Edit system cost button */}
        <TouchableOpacity
          id="btn-edit-system-cost"
          style={styles.editCostBtn}
          onPress={() => {
            setCostInput(payback.isBenchmarkCost ? '' : String(payback.systemCostInr));
            setShowEditCost(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={16} color="#EA580C" />
          <Text style={styles.editCostBtnText}>Edit system cost</Text>
          <Ionicons name="chevron-forward" size={16} color="#EA580C" />
        </TouchableOpacity>
      </View>

      {/* ── Card 2: How your system is doing ── */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTitleCol}>
            <Text style={styles.cardTitle}>How your system is doing</Text>
            <Text style={styles.cardSub}>
              Based on your latest bill and solar generation
            </Text>
          </View>

          <View
            style={[
              styles.healthBadge,
              smartAnalysis.actionCheck.severity === 'warning'
                ? styles.healthBadgeWarning
                : styles.healthBadgeSuccess,
            ]}
          >
            <Ionicons
              name={
                smartAnalysis.actionCheck.severity === 'warning'
                  ? 'alert-circle'
                  : 'checkmark-circle'
              }
              size={14}
              color={
                smartAnalysis.actionCheck.severity === 'warning'
                  ? '#DC2626'
                  : '#16A34A'
              }
            />
            <Text
              style={[
                styles.healthBadgeText,
                smartAnalysis.actionCheck.severity === 'warning'
                  ? styles.healthBadgeTextWarning
                  : styles.healthBadgeTextSuccess,
              ]}
            >
              {smartAnalysis.actionCheck.severity === 'warning'
                ? 'Action suggested'
                : 'Looking good'}
            </Text>
          </View>
        </View>

        {/* Child Card 1: Electricity bill */}
        <TouchableOpacity
          id="card-electricity-bill-detail"
          style={styles.childCard}
          onPress={() => setIsBillDetailExpanded(!isBillDetailExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.childCardTopRow}>
            <View style={styles.billIconBox}>
              <Ionicons name="document-text" size={20} color="#2563EB" />
            </View>
            <View style={styles.childCardInfoCol}>
              <Text style={styles.childCardTitle}>Electricity bill</Text>
              <Text style={styles.childCardSub}>
                Your latest monthly bill amount
              </Text>
            </View>
            <Ionicons
              name={isBillDetailExpanded ? 'chevron-up' : 'chevron-forward'}
              size={18}
              color="#94A3B8"
            />
          </View>

          <View style={styles.childCardBottomRow}>
            <View>
              <Text style={styles.childCardLargeVal}>
                ₹{latestBill ? Math.round(latestBill.billAmount).toLocaleString('en-IN') : '0'}
              </Text>
              <Text style={styles.childCardUnitSub}>this month</Text>
            </View>

            <View style={styles.statusPillBox}>
              <Ionicons name="trending-up" size={16} color="#16A34A" />
              <View>
                <Text style={styles.statusPillPrimary}>
                  {smartAnalysis.billAnalysis.statusLabel || 'About normal'}
                </Text>
                <Text style={styles.statusPillSecondary}>for your home</Text>
              </View>
            </View>
          </View>

          {isBillDetailExpanded && (
            <View style={styles.childCardExpandedContent}>
              <Text style={styles.expandedDescText}>
                {smartAnalysis.billAnalysis.explanation}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Child Card 2: Solar production */}
        <TouchableOpacity
          id="card-solar-production-detail"
          style={styles.childCard}
          onPress={() => setIsSolarDetailExpanded(!isSolarDetailExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.childCardTopRow}>
            <View style={styles.solarIconBox}>
              <Ionicons name="sunny" size={20} color="#F59E0B" />
            </View>
            <View style={styles.childCardInfoCol}>
              <Text style={styles.childCardTitle}>Solar production</Text>
              <Text style={styles.childCardSub}>
                Average energy generated by your system
              </Text>
            </View>
            <Ionicons
              name={isSolarDetailExpanded ? 'chevron-up' : 'chevron-forward'}
              size={18}
              color="#94A3B8"
            />
          </View>

          <View style={styles.childCardBottomRow}>
            <View>
              <Text style={styles.childCardLargeVal}>
                {dailyGenKwh} <Text style={styles.childCardUnit}>kWh/day</Text>
              </Text>
              <Text style={styles.childCardUnitSub}>on average</Text>
            </View>

            <View style={styles.statusPillBox}>
              <Ionicons name="stats-chart" size={16} color="#16A34A" />
              <View>
                <Text style={styles.statusPillPrimary}>
                  {smartAnalysis.solarAnalysis.status === 'lower' ? 'Below expected' : 'In line with'}
                </Text>
                <Text style={styles.statusPillSecondary}>expected output</Text>
              </View>
            </View>
          </View>

          {isSolarDetailExpanded && (
            <View style={styles.childCardExpandedContent}>
              <Text style={styles.expandedDescText}>
                {smartAnalysis.solarAnalysis.explanation}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Card 3: Monthly Breakdown (Collapsible) ── */}
      {tableRows.length > 0 && (
        <View style={styles.historySection}>
          <TouchableOpacity
            id="btn-toggle-monthly-breakdown"
            style={[styles.historyHeaderCard, isBreakdownExpanded && styles.historyHeaderCardExpanded]}
            onPress={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={20} color="#475569" />
            <Text style={styles.historyCardTitle}>View monthly breakdown</Text>
            <Ionicons
              name={isBreakdownExpanded ? 'chevron-up' : 'chevron-forward'}
              size={18}
              color="#94A3B8"
            />
          </TouchableOpacity>

          {isBreakdownExpanded && (
            <View style={styles.historyDropdown}>
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
                    <Text style={[styles.tdPeriod, { flex: 1.6 }]} numberOfLines={1}>
                      {row.period}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#D97706', fontWeight: '600' }]}>
                      {row.generationKwh !== null ? row.generationKwh : '—'}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#334155' }]}>
                      {row.exportKwh}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#059669', fontWeight: '600' }]}>
                      {row.closingCreditKwh}
                    </Text>
                    <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '700', color: '#0F172A' }]}>
                      ₹{Math.round(row.billAmount).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {idx < tableRows.length - 1 && <View style={styles.tableDivider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Edit System Investment Modal ── */}
      <Modal visible={showEditCost} animationType="slide" transparent onRequestClose={() => setShowEditCost(false)}>
        <KeyboardAvoidingView style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Solar Investment</Text>
              <TouchableOpacity
                id="btn-close-edit-cost"
                onPress={() => setShowEditCost(false)}
              >
                <Ionicons name="close" size={22} color="#64748B" />
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
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.modalHelperText}>
                Enter the net capital cost for your solar system after subsidies. Benchmark for Goa is ~₹55,000 / kW.
              </Text>
            </View>

            <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Hero Cards ──
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 16,
    marginBottom: 16,
    ...SHADOW.card,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroTitleCol: {
    flex: 1,
    paddingRight: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  paidBackBadge: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  paidBackBadgeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#EA580C',
  },

  // Progress Bar
  progressTrack: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#EA580C',
    borderRadius: 4,
  },

  // Milestones Row
  milestonesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  milestoneText: {
    fontSize: 12,
    color: '#64748B',
  },
  breakEvenHighlight: {
    fontWeight: '700',
    color: '#EA580C',
  },

  // 2-Tile Split (Saved vs Yearly)
  tilesSplitRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  savedTile: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 14,
    padding: 14,
  },
  savedTileAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 10,
    letterSpacing: -0.3,
  },
  savedTileLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  yearlyTile: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 14,
    padding: 14,
  },
  yearlyTileAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#EA580C',
    marginTop: 10,
    letterSpacing: -0.3,
  },
  yearlyTileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  yearlyTileLabel: {
    fontSize: 12,
    color: '#64748B',
  },

  // Edit Cost Button
  editCostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  editCostBtnText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#EA580C',
  },

  // Health Badge in Card 2
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  healthBadgeSuccess: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  healthBadgeWarning: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  healthBadgeText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  healthBadgeTextSuccess: {
    color: '#16A34A',
  },
  healthBadgeTextWarning: {
    color: '#DC2626',
  },

  // ── Child Cards inside Card 2 ──
  childCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginTop: 12,
  },
  childCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  solarIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childCardInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  childCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  childCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  childCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
  },
  childCardLargeVal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  childCardUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  childCardUnitSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusPillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPillPrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  statusPillSecondary: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  childCardExpandedContent: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  expandedDescText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },

  // ── History Section (Collapsible) ──
  historySection: {
    marginBottom: 8,
  },
  historyHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.card,
  },
  historyHeaderCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: '#F1F5F9',
  },
  historyCardTitle: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  historyDropdown: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  // Table
  tableHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  tableRowContainer: {
    paddingVertical: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tdPeriod: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  td: {
    fontSize: 12.5,
  },
  tableDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginTop: 8,
  },

  // ── Modal ──
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetBody: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0F172A',
  },
  modalHelperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 16,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EA580C',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
