// ============================================================
// Bills Screen — Beautiful, Modern Monthly Electricity Bills
// Matches reference mockup: Summary banner, Year filter & 3-column energy cards
// ============================================================
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill } from '../types/solar';
import { Divider, LedgerRow, InfoNote } from '../components/ui/UIKit';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';

interface BillsScreenProps {
  bills: SolarBill[];
  onAddBill: () => void;
  onDeleteBill: (id: string) => Promise<void>;
}

export const BillsScreen: React.FC<BillsScreenProps> = ({
  bills,
  onAddBill: _onAddBill,
  onDeleteBill,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // Extract unique years from bill periods
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    bills.forEach((b) => {
      // Period is either "August 2026", "Aug 2026", or "2026-08"
      const match = b.period.match(/\b(20\d\d)\b/);
      if (match) {
        set.add(match[1]);
      } else if (b.periodStart) {
        const startYear = b.periodStart.slice(0, 4);
        if (startYear.startsWith('20')) set.add(startYear);
      }
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [bills]);

  // Current filtered year (default to latest year available)
  const activeYear = selectedYear || (availableYears.length > 0 ? availableYears[0] : null);

  // Filter bills by active year
  const filteredBills = useMemo(() => {
    if (!activeYear || activeYear === 'All') return bills;
    return bills.filter((b) => {
      if (b.period.includes(activeYear)) return true;
      if (b.periodStart && b.periodStart.startsWith(activeYear)) return true;
      return false;
    });
  }, [bills, activeYear]);

  // Summary figures
  const latestBill = bills.length > 0 ? bills[0] : null;
  const earliestBill = bills.length > 0 ? bills[bills.length - 1] : null;
  const totalAmount = useMemo(() => {
    return bills.reduce((sum, b) => sum + (b.billAmount || 0), 0);
  }, [bills]);
  const dateRangeText =
    bills.length > 1 && earliestBill && latestBill
      ? `${earliestBill.period} – ${latestBill.period}`
      : latestBill
      ? latestBill.period
      : 'No bills yet';

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const handleYearPress = () => {
    if (availableYears.length <= 1) return;
    const options = [...availableYears, 'All'];
    const nextIdx = (options.indexOf(activeYear || 'All') + 1) % options.length;
    setSelectedYear(options[nextIdx]);
  };

  const confirmDelete = (bill: SolarBill) => {
    if (Platform.OS === 'web') {
      if (
        typeof window !== 'undefined' &&
        window.confirm(`Remove the record for ${bill.period}? This cannot be undone.`)
      ) {
        onDeleteBill(bill.id);
      }
      return;
    }
    Alert.alert(
      'Delete Bill',
      `Remove the record for ${bill.period}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDeleteBill(bill.id);
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.message ?? 'Could not delete bill.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Screen Header ── */}
      {/* <View style={styles.headerRow}>
        <View style={styles.headerIconBox}>
          <Ionicons name="document-text" size={22} color="#EA580C" />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.screenTitle}>Bills</Text>
          <Text style={styles.screenSub}>Your monthly electricity bills</Text>
        </View>
      </View> */}

      {/* ── Top Summary Banner Card ── */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeftCol}>
          <View style={styles.summaryIconBox}>
            <Ionicons name="stats-chart" size={22} color="#EA580C" />
          </View>
          <View style={styles.summaryTextCol}>
            <Text style={styles.summaryTitle}>
              {bills.length} bill{bills.length === 1 ? '' : 's'} recorded
            </Text>
            <Text style={styles.summarySub}>{dateRangeText}</Text>
          </View>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRightCol}>
          <Text style={styles.latestLabel}>Total amount</Text>
          <Text style={styles.latestAmount}>
            ₹{Math.round(totalAmount).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.latestPeriod}>
            {bills.length > 0 ? 'all bills' : '—'}
          </Text>
        </View>
      </View>

      {/* ── Year Filter Row ── */}
      {availableYears.length > 0 && (
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Year</Text>
          <TouchableOpacity
            id="btn-year-dropdown"
            style={styles.yearDropdownBtn}
            onPress={handleYearPress}
            activeOpacity={0.7}
          >
            <Text style={styles.yearDropdownText}>{activeYear || 'All'}</Text>
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Empty State ── */}
      {bills.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="document-text-outline" size={32} color="#EA580C" />
          </View>
          <Text style={styles.emptyTitle}>No bills recorded yet</Text>
          <Text style={styles.emptySub}>
            Use the &apos;+ Add Bill&apos; button in the header to enter your first monthly Goa electricity bill.
          </Text>
        </View>
      )}

      {/* ── Bill Cards List ── */}
      {filteredBills.map((bill) => {
        const expanded = expandedId === bill.id;
        const readInterval =
          bill.periodStart && bill.periodEnd
            ? `${bill.periodStart} – ${bill.periodEnd}`
            : null;

        const genFormatted =
          bill.generationKwh !== null && bill.generationKwh !== undefined
            ? `${bill.generationKwh}`
            : '—';

        return (
          <TouchableOpacity
            key={bill.id}
            id={`btn-expand-bill-${bill.id}`}
            activeOpacity={0.8}
            onPress={() => toggle(bill.id)}
            style={[styles.billCard, expanded && styles.billCardExpanded]}
          >
            {/* Top Row: Calendar Icon, Period, Read Interval & Amount Pill */}
            <View style={styles.billTopRow}>
              <View style={styles.calIconBox}>
                <Ionicons name="calendar-outline" size={18} color="#2563EB" />
              </View>

              <View style={styles.billTitleCol}>
                <View style={styles.titleWithBadge}>
                  <Text style={styles.billPeriodTitle}>{bill.period}</Text>
                  {bill.needsReview && (
                    <View style={styles.warningPill}>
                      <Ionicons name="alert-circle" size={12} color={COLORS.danger} />
                    </View>
                  )}
                </View>
                <Text style={styles.billDatesSubtitle} numberOfLines={1}>
                  {readInterval
                    ? `${readInterval} (${bill.billingDays || 30}d)`
                    : `Due: ${bill.dueDate || '—'}`}
                </Text>
              </View>

              <View style={styles.amountPill}>
                <Text style={styles.amountPillText}>
                  ₹{Math.round(bill.billAmount).toLocaleString('en-IN')}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#64748B"
                />
              </View>
            </View>

            {/* 3-Column Metrics Strip: Solar gen, Export, Banked */}
            <View style={styles.metricsStrip}>
              {/* Col 1: Solar Generated */}
              <View style={styles.metricCol}>
                <View style={styles.metricValRow}>
                  <Ionicons name="sunny-outline" size={17} color="#EA580C" style={styles.iconMargin} />
                  <Text style={styles.metricValOrange}>
                    {genFormatted} <Text style={styles.metricUnitOrange}>kWh</Text>
                  </Text>
                </View>
                <Text style={styles.metricLabel}>Solar generated</Text>
              </View>

              {/* Arrow */}
              <View style={styles.arrowCol}>
                <Ionicons name="swap-horizontal" size={18} color="#94A3B8" />
              </View>

              {/* Col 2: Exported to Grid */}
              <View style={styles.metricCol}>
                <View style={styles.metricValRow}>
                  <Text style={styles.metricValDark}>
                    {bill.exportKwh} <Text style={styles.metricUnitMuted}>kWh</Text>
                  </Text>
                </View>
                <Text style={styles.metricLabel}>Exported to grid</Text>
              </View>

              {/* Col 3: Banked Units */}
              <View style={styles.metricCol}>
                <View style={styles.metricValRow}>
                  <Ionicons name="business-outline" size={17} color="#16A34A" style={styles.iconMargin} />
                  <Text style={styles.metricValGreen}>
                    {bill.closingCreditKwh} <Text style={styles.metricUnitGreen}>kWh</Text>
                  </Text>
                </View>
                <Text style={styles.metricLabel}>Banked units</Text>
              </View>
            </View>

            {/* ── Expanded Detail Drawer ── */}
            {expanded && (
              <View style={styles.expandedDrawer}>
                <Text style={styles.expandedSection}>METER READING & INTERVAL</Text>
                {readInterval ? (
                  <LedgerRow label="Meter Read Period" value={readInterval} />
                ) : null}
                <LedgerRow label="Billing Days" value={`${bill.billingDays || 30} days`} />
                {bill.dueDate && <LedgerRow label="Payment Due Date" value={bill.dueDate} />}

                <Divider style={{ marginVertical: SPACING.xs + 2 }} />
                <Text style={styles.expandedSection}>ENERGY LEDGER (KWH)</Text>
                <LedgerRow label="Opening Bank Balance" value={`${bill.openingCreditKwh} kWh`} />
                <LedgerRow label="+ Current Export" value={`${bill.exportKwh} kWh`} valueColor={COLORS.export} />
                <LedgerRow label="Available Credit" value={`${bill.availableCreditKwh} kWh`} />
                <LedgerRow label="− Credit Used (Adjusted)" value={`${bill.adjustedCreditKwh} kWh`} valueColor={COLORS.import} />
                <LedgerRow label="= Closing Banked Credit" value={`${bill.closingCreditKwh} kWh`} valueColor={COLORS.success} />
                <LedgerRow label="Net Billed Grid Import" value={`${bill.netBilledImportKwh} kWh`} />
                {bill.directSolarUseKwh !== null && (
                  <LedgerRow
                    label="Direct Solar Use (est.)"
                    value={`${bill.directSolarUseKwh} kWh`}
                    valueColor={COLORS.directUse}
                  />
                )}

                <Divider style={{ marginVertical: SPACING.xs + 2 }} />
                <Text style={styles.expandedSection}>BILL COMPONENTS (INR)</Text>
                {bill.demandCharges !== undefined && (
                  <LedgerRow label="Demand / Fixed Charge" value={`₹${bill.demandCharges.toFixed(2)}`} />
                )}
                {bill.fppca !== undefined && (
                  <LedgerRow label="FPPCA Charge" value={`₹${bill.fppca.toFixed(2)}`} />
                )}
                {bill.rebate !== undefined && bill.rebate !== 0 && (
                  <LedgerRow label="Prompt Rebate" value={`₹${bill.rebate.toFixed(2)}`} valueColor={COLORS.success} />
                )}
                <LedgerRow label="Total Amount Payable" value={`₹${bill.billAmount.toFixed(2)}`} valueColor={COLORS.text} />

                {bill.needsReview && (
                  <InfoNote
                    text="⚠️ Mismatch detected between bill-stated and calculated values. Preserved as-is per PRD §6.1."
                    color={COLORS.danger}
                    style={{ marginTop: SPACING.xs + 2 }}
                  />
                )}

                {bill.notes ? (
                  <Text style={styles.noteText}>📝 {bill.notes}</Text>
                ) : null}

                <TouchableOpacity
                  id={`btn-delete-bill-${bill.id}`}
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(bill)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={13} color={COLORS.danger} />
                  <Text style={styles.deleteBtnText}>Remove this bill</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
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

  // ── Top Summary Banner Card ──
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    ...SHADOW.card,
  },
  summaryLeftCol: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryTextCol: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  summarySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 12,
  },
  summaryRightCol: {
    flex: 0.9,
    alignItems: 'flex-end',
  },
  latestLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'right',
  },
  latestAmount: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  latestPeriod: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
    textAlign: 'right',
  },

  // ── Year Filter Row ──
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  filterLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  yearDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  yearDropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── Bill Card ──
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    ...SHADOW.card,
  },
  billCardExpanded: {
    borderColor: '#CBD5E1',
  },
  billTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  billTitleCol: {
    flex: 1,
    marginLeft: 10,
    paddingRight: 6,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  billPeriodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  warningPill: {
    padding: 2,
  },
  billDatesSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  amountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  amountPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── Metrics Strip (3 Columns) ──
  metricsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  metricCol: {
    flex: 1,
  },
  arrowCol: {
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconMargin: {
    marginRight: 4,
  },
  metricValOrange: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EA580C',
  },
  metricUnitOrange: {
    fontSize: 11,
    fontWeight: '500',
    color: '#EA580C',
  },
  metricValDark: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricUnitMuted: {
    fontSize: 11,
    fontWeight: '400',
    color: '#64748B',
  },
  metricValGreen: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
  },
  metricUnitGreen: {
    fontSize: 11,
    fontWeight: '500',
    color: '#16A34A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Expanded Drawer ──
  expandedDrawer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  expandedSection: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSub,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.danger,
  },

  // ── Empty State ──
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: FONT.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 18,
  },
});
