// ============================================================
// Bills Screen — History of all monthly bills
// PRD §3.2 / §13.1 monthly analytics
// Clean, minimal, and intuitive design
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
import { Card, Divider, LedgerRow, InfoNote } from '../components/ui/UIKit';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';

interface BillsScreenProps {
  bills: SolarBill[];
  onAddBill: () => void;
  onDeleteBill: (id: string) => Promise<void>;
}

export const BillsScreen: React.FC<BillsScreenProps> = ({
  bills,
  onAddBill,
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
            <Ionicons name="document-text-outline" size={36} color={COLORS.gold} />
          </View>
          <Text style={styles.emptyTitle}>No bills recorded yet</Text>
          <Text style={styles.emptySub}>
            Tap &apos;New Bill&apos; or use the Add Bill button to enter your first monthly Goa electricity bill.
          </Text>
        </View>
      )}

      {/* ── Bills List ── */}
      {bills.map((bill) => {
        const expanded = expandedId === bill.id;
        const readInterval =
          bill.periodStart && bill.periodEnd
            ? `${bill.periodStart} – ${bill.periodEnd}`
            : null;

        return (
          <Card
            key={bill.id}
            title={bill.period}
            subtitle={
              readInterval
                ? `Readings: ${readInterval} (${bill.billingDays || 31}d)`
                : `Bill #${bill.billNumber ?? 'N/A'} · Due: ${bill.dueDate ?? 'N/A'}`
            }
            style={styles.cardSpacing}
            badge={
              <View style={styles.amountBadge}>
                <Text style={styles.amountBadgeText}>₹{bill.billAmount.toFixed(0)}</Text>
              </View>
            }
          >
            {/* ── 3 Key Metric Tiles ── */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Solar Gen</Text>
                <Text style={[styles.summaryValue, { color: '#D97706' }]}>
                  {bill.generationKwh !== null ? bill.generationKwh : '—'}
                </Text>
                <Text style={styles.summaryUnit}>kWh</Text>
              </View>

              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Exported</Text>
                <Text style={[styles.summaryValue, { color: COLORS.text }]}>
                  {bill.exportKwh}
                </Text>
                <Text style={styles.summaryUnit}>kWh</Text>
              </View>

              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Banked Credit</Text>
                <Text style={[styles.summaryValue, { color: '#059669' }]}>
                  {bill.closingCreditKwh}
                </Text>
                <Text style={styles.summaryUnit}>kWh</Text>
              </View>
            </View>

            {/* ── Expand/Collapse Ledger Toggle ── */}
            <TouchableOpacity
              id={`btn-expand-bill-${bill.id}`}
              style={styles.expandToggle}
              onPress={() => toggle(bill.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.expandToggleText}>
                {expanded ? 'Hide ledger & charges' : 'Show full energy ledger & charges'}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.textSub}
              />
            </TouchableOpacity>

            {/* ── Expanded Detail Box ── */}
            {expanded && (
              <View style={styles.expandedBox}>
                <Text style={styles.expandedSection}>METER READING & INTERVAL</Text>
                {readInterval ? (
                  <LedgerRow label="Meter Read Period" value={readInterval} />
                ) : null}
                <LedgerRow label="Billing Days" value={`${bill.billingDays || 31} days`} />
                {bill.dueDate && <LedgerRow label="Payment Due Date" value={bill.dueDate} />}

                <Divider style={{ marginVertical: SPACING.sm }} />
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

                <Divider style={{ marginVertical: SPACING.sm }} />
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
                    style={{ marginTop: SPACING.sm }}
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
                  <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                  <Text style={styles.deleteBtnText}>Remove this bill</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>
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

  // Amount badge
  amountBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  amountBadgeText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },

  // 3-tile Summary Row
  summaryGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: FONT.medium,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: FONT.heavy,
    letterSpacing: -0.3,
    marginTop: 3,
  },
  summaryUnit: {
    fontSize: 10,
    fontWeight: FONT.medium,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Expand Toggle
  expandToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 12,
    color: COLORS.textSub,
    fontWeight: FONT.semi,
  },

  // Expanded details box
  expandedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: SPACING.md,
    marginTop: 4,
  },
  expandedSection: {
    fontSize: 10,
    fontWeight: FONT.heavy,
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  noteText: {
    fontSize: 11,
    color: COLORS.textSub,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  deleteBtnText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: FONT.semi,
  },

  // Empty State
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
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 18,
  },
});
