// ============================================================
// Bills Screen — Compact History of Monthly Bills
// PRD §3.2 / §13.1 monthly analytics
// Clean, minimal, compact, and intuitive design
// ============================================================
import React, { useState } from 'react';
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

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

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
      {/* ── Page Header ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.pageTitle}>Monthly Bills</Text>
          <Text style={styles.pageSub}>
            {bills.length} billing cycle{bills.length === 1 ? '' : 's'} recorded
          </Text>
        </View>
      </View>

      {/* ── Empty State ── */}
      {bills.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="document-text-outline" size={32} color={COLORS.gold} />
          </View>
          <Text style={styles.emptyTitle}>No bills recorded yet</Text>
          <Text style={styles.emptySub}>
            Tap &apos;New Bill&apos; or use the Add Bill button to enter your first monthly Goa electricity bill.
          </Text>
        </View>
      )}

      {/* ── Compact Bills List ── */}
      {bills.map((bill) => {
        const expanded = expandedId === bill.id;
        const readInterval =
          bill.periodStart && bill.periodEnd
            ? `${bill.periodStart} – ${bill.periodEnd}`
            : null;

        return (
          <TouchableOpacity
            key={bill.id}
            id={`btn-expand-bill-${bill.id}`}
            activeOpacity={0.75}
            onPress={() => toggle(bill.id)}
            style={[styles.billCard, expanded && styles.billCardExpanded]}
          >
            {/* ── Main Row: Period + Days/Due & Amount Badge + Chevron ── */}
            <View style={styles.billHeaderRow}>
              <View style={styles.billTitleCol}>
                <View style={styles.billTitleRow}>
                  <Text style={styles.billPeriod}>{bill.period}</Text>
                  {bill.needsReview && (
                    <View style={styles.warningPill}>
                      <Ionicons name="alert-circle" size={12} color={COLORS.danger} />
                    </View>
                  )}
                </View>
                <Text style={styles.billMeta} numberOfLines={1}>
                  {readInterval
                    ? `${readInterval} (${bill.billingDays || 30}d)`
                    : `Bill #${bill.billNumber ?? 'N/A'} · Due: ${bill.dueDate ?? '—'}`}
                </Text>
              </View>

              <View style={styles.billHeaderRight}>
                <View style={styles.billAmountBadge}>
                  <Text style={styles.billAmountText}>₹{bill.billAmount.toFixed(0)}</Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={COLORS.textMuted}
                  style={styles.chevronIcon}
                />
              </View>
            </View>

            {/* ── Compact Key Stats Strip (Gen, Export, Banked) ── */}
            <View style={styles.compactMetricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Gen</Text>
                <Text style={[styles.metricVal, { color: '#D97706' }]}>
                  {bill.generationKwh !== null && bill.generationKwh !== undefined
                    ? bill.generationKwh
                    : '—'}
                  <Text style={styles.metricUnit}> kWh</Text>
                </Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Export</Text>
                <Text style={[styles.metricVal, { color: COLORS.text }]}>
                  {bill.exportKwh}
                  <Text style={styles.metricUnit}> kWh</Text>
                </Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Banked</Text>
                <Text style={[styles.metricVal, { color: '#059669' }]}>
                  {bill.closingCreditKwh}
                  <Text style={styles.metricUnit}> kWh</Text>
                </Text>
              </View>
            </View>

            {/* ── Expanded Detail Box ── */}
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
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl + 24,
  },
  topBar: {
    marginBottom: SPACING.sm + 2,
    paddingHorizontal: 2,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: FONT.heavy,
    color: COLORS.text,
  },
  pageSub: {
    fontSize: 12,
    color: COLORS.textSub,
    marginTop: 1,
  },

  // ── Compact Bill Card ──
  billCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: SPACING.sm,
  },
  billCardExpanded: {
    borderColor: '#CBD5E1',
  },
  billHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billTitleCol: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  billTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  billPeriod: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  warningPill: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  billHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billAmountBadge: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  billAmountText: {
    fontSize: 12,
    fontWeight: FONT.heavy,
    color: COLORS.text,
  },
  chevronIcon: {
    marginLeft: 6,
  },

  // ── Compact Key Metrics Strip ──
  compactMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  metricItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: FONT.medium,
    textTransform: 'uppercase',
  },
  metricVal: {
    fontSize: 12,
    fontWeight: FONT.bold,
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: FONT.regular,
    color: COLORS.textMuted,
  },
  metricDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#E2E8F0',
  },

  // ── Expanded Drawer ──
  expandedDrawer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs + 2,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  expandedSection: {
    fontSize: 10,
    fontWeight: FONT.heavy,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
    marginTop: 6,
  },
  noteText: {
    fontSize: 11,
    color: COLORS.textSub,
    fontStyle: 'italic',
    marginTop: SPACING.xs + 2,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  deleteBtnText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: FONT.semi,
  },

  // ── Empty State ──
  emptyState: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    ...SHADOW.card,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 17,
  },
});
