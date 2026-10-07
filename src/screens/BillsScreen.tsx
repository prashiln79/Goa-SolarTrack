// ============================================================
// Bills Screen — History of all monthly bills
// PRD §3.2 / §13.1 monthly analytics
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill } from '../types/solar';
import { Card, Divider, LedgerRow, InfoNote } from '../components/ui/UIKit';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface BillsScreenProps {
  bills: SolarBill[];
  onAddBill: () => void;
  onDeleteBill: (id: string) => Promise<void>;
}

export const BillsScreen: React.FC<BillsScreenProps> = ({
  bills, onAddBill, onDeleteBill,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(
    bills.length > 0 ? bills[0].id : null
  );

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const confirmDelete = (bill: SolarBill) =>
    Alert.alert(
      'Delete Bill',
      `Remove the record for ${bill.period}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteBill(bill.id) },
      ]
    );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.pageTitle}>Monthly Bills</Text>
          <Text style={styles.pageSub}>
            {bills.length} billing cycle{bills.length === 1 ? '' : 's'} recorded
          </Text>
        </View>
        <TouchableOpacity id="btn-add-bill-bills" style={styles.addBtn} onPress={onAddBill}>
          <Ionicons name="add" size={16} color={COLORS.textInverse} />
          <Text style={styles.addBtnText}>New Bill</Text>
        </TouchableOpacity>
      </View>

      {bills.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No bills recorded yet</Text>
          <Text style={styles.emptySub}>
            Tap "New Bill" or use the Add Bill button to enter your first monthly Goa electricity bill.
          </Text>
        </View>
      )}

      {bills.map((bill) => {
        const expanded = expandedId === bill.id;
        const days = bill.billingDays || 31;

        return (
          <Card
            key={bill.id}
            title={bill.period}
            subtitle={`Bill #${bill.billNumber ?? 'N/A'} · Due: ${bill.dueDate ?? 'N/A'} · ${bill.source}`}
            badge={
              <View style={styles.amountBadge}>
                <Text style={styles.amountBadgeText}>₹{bill.billAmount.toFixed(0)}</Text>
              </View>
            }
          >
            {/* ── 3-column summary ── */}
            <View style={styles.summaryGrid}>
              <SummaryCol
                label="Solar Gen" value={bill.generationKwh !== null ? `${bill.generationKwh}` : 'N/A'}
                unit={bill.generationKwh !== null ? 'kWh' : ''} color={COLORS.generation}
              />
              <SummaryCol label="Exported" value={`${bill.exportKwh}`} unit="kWh" color={COLORS.export} />
              <SummaryCol
                label="Closing Credit" value={`${bill.closingCreditKwh}`} unit="kWh" color={COLORS.gold}
              />
            </View>

            {/* ── Expand toggle ── */}
            <TouchableOpacity
              id={`btn-expand-bill-${bill.id}`}
              style={styles.expandToggle}
              onPress={() => toggle(bill.id)}
            >
              <Text style={styles.expandToggleText}>
                {expanded ? 'Hide energy ledger & charges' : 'Show full energy ledger & charges'}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {/* ── Expanded detail ── */}
            {expanded && (
              <View style={styles.expandedBox}>
                <Text style={styles.expandedSection}>ENERGY LEDGER</Text>
                <LedgerRow label="Opening Bank Balance" value={`${bill.openingCreditKwh} kWh`} />
                <LedgerRow label="+ Current Export" value={`${bill.exportKwh} kWh`} valueColor={COLORS.export} />
                <LedgerRow label="Available Credit" value={`${bill.availableCreditKwh} kWh`} />
                <LedgerRow label="− Credit Used (Adjusted)" value={`${bill.adjustedCreditKwh} kWh`} valueColor={COLORS.import} />
                <LedgerRow label="= Closing Credit Carried →" value={`${bill.closingCreditKwh} kWh`} valueColor={COLORS.gold} />
                <LedgerRow label="Net Billed Grid Import" value={`${bill.netBilledImportKwh} kWh`} />
                {bill.directSolarUseKwh !== null && (
                  <LedgerRow
                    label="Direct Solar Use (est.)"
                    value={`${bill.directSolarUseKwh} kWh`}
                    valueColor={COLORS.directUse}
                  />
                )}

                <Divider style={{ marginVertical: SPACING.sm }} />
                <Text style={styles.expandedSection}>BILL COMPONENTS</Text>
                {bill.demandCharges !== undefined && (
                  <LedgerRow label="Demand / Fixed Charge" value={`₹${bill.demandCharges.toFixed(2)}`} />
                )}
                {bill.fppca !== undefined && (
                  <LedgerRow label="FPPCA" value={`₹${bill.fppca.toFixed(2)}`} />
                )}
                {bill.rebate !== undefined && bill.rebate !== 0 && (
                  <LedgerRow label="Rebate" value={`₹${bill.rebate.toFixed(2)}`} valueColor={COLORS.success} />
                )}
                <LedgerRow label="Total Payable" value={`₹${bill.billAmount.toFixed(2)}`} />

                {bill.needsReview && (
                  <InfoNote
                    text="⚠️ Mismatch detected between bill-stated and calculated values. Preserved as-is per PRD §6.1."
                    color={COLORS.danger}
                    style={{ marginTop: SPACING.sm }}
                  />
                )}

                {bill.notes && (
                  <Text style={styles.noteText}>📝 {bill.notes}</Text>
                )}

                <TouchableOpacity
                  id={`btn-delete-bill-${bill.id}`}
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(bill)}
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

const SummaryCol: React.FC<{
  label: string; value: string; unit: string; color?: string;
}> = ({ label, value, unit, color = COLORS.text }) => (
  <View style={styles.summaryCol}>
    <Text style={styles.summaryColLabel}>{label}</Text>
    <Text style={[styles.summaryColValue, { color }]}>{value}</Text>
    {unit ? <Text style={styles.summaryColUnit}>{unit}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  pageTitle: { fontSize: 20, fontWeight: FONT.heavy, color: COLORS.text },
  pageSub: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.gold,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full,
  },
  addBtnText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.textInverse },
  emptyState: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: COLORS.border, padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.text },
  emptySub: { fontSize: 12, color: COLORS.textSub, textAlign: 'center' },
  amountBadge: {
    backgroundColor: COLORS.glowGold, borderWidth: 1, borderColor: `${COLORS.gold}55`,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full,
  },
  amountBadgeText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.gold },
  summaryGrid: {
    flexDirection: 'row', backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderSubtle, paddingVertical: SPACING.sm,
  },
  summaryCol: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xs },
  summaryColLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryColValue: { fontSize: 16, fontWeight: FONT.heavy, color: COLORS.text, marginTop: 2 },
  summaryColUnit: { fontSize: 10, color: COLORS.textMuted },
  expandToggle: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 4, paddingVertical: 8, marginTop: SPACING.xs,
  },
  expandToggleText: { fontSize: 11, color: COLORS.textSub, fontWeight: FONT.semi },
  expandedBox: {
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: COLORS.borderSubtle, padding: SPACING.md,
  },
  expandedSection: {
    fontSize: 10, fontWeight: FONT.heavy, color: COLORS.textMuted,
    letterSpacing: 0.6, marginBottom: SPACING.xs,
  },
  noteText: { fontSize: 11, color: COLORS.textSub, fontStyle: 'italic', marginTop: SPACING.sm },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, marginTop: SPACING.sm,
  },
  deleteBtnText: { fontSize: 11, color: COLORS.danger, fontWeight: FONT.semi },
});
