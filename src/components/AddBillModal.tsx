// ============================================================
// Add/Edit Bill Modal
// PRD §3.3 Manual entry workflow + §6 energy accounting
// Shows live calculation preview as user types.
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolarBill } from '../types/solar';
import {
  calculateEnergyAccounting,
  detectMismatches,
  CANONICAL_AUGUST_2026_BILL,
} from '../domain/energyAccounting';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface AddBillModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (bill: SolarBill) => Promise<void>;
  latestBill?: SolarBill | null;
}

// ── Field helpers ─────────────────────────────────────────────
function parseNum(s: string): number | null {
  const v = parseFloat(s.trim());
  return isNaN(v) || s.trim() === '' ? null : v;
}

function fmtNum(n: number | null): string {
  return n === null ? '' : String(n);
}

export const AddBillModal: React.FC<AddBillModalProps> = ({
  visible,
  onClose,
  onSave,
  latestBill,
}) => {
  // ── Form fields ──
  const [period, setPeriod]                   = useState('');
  const [periodStart, setPeriodStart]         = useState('');
  const [periodEnd, setPeriodEnd]             = useState('');
  const [billingDays, setBillingDays]         = useState('31');
  const [generationKwh, setGenerationKwh]     = useState('');
  const [importKwh, setImportKwh]             = useState('');
  const [exportKwh, setExportKwh]             = useState('');
  const [openingCredit, setOpeningCredit]     = useState('');
  const [billAmount, setBillAmount]           = useState('');
  const [billNumber, setBillNumber]           = useState('');
  const [dueDate, setDueDate]                 = useState('');
  const [demandCharges, setDemandCharges]     = useState('');
  const [fppca, setFppca]                     = useState('');
  const [rebate, setRebate]                   = useState('');
  const [notes, setNotes]                     = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);

  // Pre-fill opening credit from previous bill closing credit
  useEffect(() => {
    if (latestBill && !openingCredit) {
      setOpeningCredit(String(latestBill.closingCreditKwh));
    }
  }, [latestBill]);

  // ── Live accounting preview ──
  const liveCalc = calculateEnergyAccounting({
    generationKwh: parseNum(generationKwh),
    importKwh: parseNum(importKwh) ?? 0,
    exportKwh: parseNum(exportKwh) ?? 0,
    openingCreditKwh: parseNum(openingCredit) ?? 0,
  });

  // ── Load canonical test fixture ──
  const loadCanonical = useCallback(() => {
    const b = CANONICAL_AUGUST_2026_BILL;
    setPeriod(b.period);
    setPeriodStart(b.periodStart);
    setPeriodEnd(b.periodEnd);
    setBillingDays(String(b.billingDays));
    setGenerationKwh(String(b.generationKwh ?? ''));
    setImportKwh(String(b.importKwh));
    setExportKwh(String(b.exportKwh));
    setOpeningCredit(String(b.openingCreditKwh));
    setBillAmount(String(b.billAmount));
    setBillNumber(b.billNumber ?? '');
    setDueDate(b.dueDate ?? '');
    setDemandCharges(String(b.demandCharges ?? ''));
    setFppca(String(b.fppca ?? ''));
    setRebate(String(b.rebate ?? ''));
    setNotes(b.notes ?? '');
  }, []);

  // ── Reset form on open ──
  useEffect(() => {
    if (!visible) return;
    setPeriod(''); setPeriodStart(''); setPeriodEnd('');
    setBillingDays('31');
    setGenerationKwh(''); setImportKwh(''); setExportKwh('');
    setOpeningCredit(latestBill ? String(latestBill.closingCreditKwh) : '');
    setBillAmount(''); setBillNumber(''); setDueDate('');
    setDemandCharges(''); setFppca(''); setRebate('');
    setNotes('');
  }, [visible]);

  // ── Save ──
  const handleSave = async () => {
    if (!period.trim()) {
      Alert.alert('Required', 'Please enter a billing period label (e.g. September 2026)');
      return;
    }
    const imp = parseNum(importKwh);
    const exp = parseNum(exportKwh);
    const amount = parseNum(billAmount);

    if (imp === null || exp === null || amount === null) {
      Alert.alert('Required', 'Import (KWH_I), Export (KWH_E) and Bill Amount are required.');
      return;
    }

    const gen = parseNum(generationKwh);
    const opening = parseNum(openingCredit) ?? 0;

    const calc = calculateEnergyAccounting({
      generationKwh: gen,
      importKwh: imp,
      exportKwh: exp,
      openingCreditKwh: opening,
    });

    const bill: SolarBill = {
      id: `bill-${Date.now()}`,
      period: period.trim(),
      periodStart: periodStart.trim() || new Date().toISOString().split('T')[0],
      periodEnd: periodEnd.trim() || new Date().toISOString().split('T')[0],
      billingDays: parseInt(billingDays) || 31,
      tariffCategory: 'LTDS-II-SOLAR',
      generationKwh: gen,
      importKwh: imp,
      exportKwh: exp,
      openingCreditKwh: opening,
      ...calc,
      billAmount: amount,
      billNumber: billNumber.trim() || undefined,
      dueDate: dueDate.trim() || undefined,
      demandCharges: parseNum(demandCharges) ?? undefined,
      fppca: parseNum(fppca) ?? undefined,
      rebate: parseNum(rebate) ?? undefined,
      notes: notes.trim() || undefined,
      source: 'manual',
      calculationVersion: 'v1.0',
      createdAt: Date.now(),
    };

    try {
      setIsSubmitting(true);
      await onSave(bill);
      setIsSubmitting(false);
      onClose();
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* ── Header ── */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Add Monthly Bill</Text>
              <Text style={styles.sheetSub}>Manual entry · Saved to Firebase Firestore</Text>
            </View>
            <TouchableOpacity id="btn-close-add-bill" onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            {/* Quick-fill button */}
            <TouchableOpacity
              id="btn-load-canonical"
              style={styles.presetBtn}
              onPress={loadCanonical}
            >
              <Ionicons name="sparkles-outline" size={14} color={COLORS.gold} />
              <Text style={styles.presetBtnText}>Load August 2026 Canonical Test Bill</Text>
            </TouchableOpacity>

            {/* ── Period ── */}
            <Text style={styles.section}>BILLING PERIOD</Text>
            <View style={styles.row}>
              <Field label="Period label *" value={period} onChange={setPeriod}
                placeholder="e.g. September 2026" style={{ flex: 2 }} />
              <Field label="Days" value={billingDays} onChange={setBillingDays}
                placeholder="31" keyboardType="numeric" style={{ flex: 1 }} />
            </View>
            <View style={styles.row}>
              <Field label="Period start (YYYY-MM-DD)" value={periodStart} onChange={setPeriodStart}
                placeholder="2026-09-01" style={{ flex: 1 }} />
              <Field label="Period end" value={periodEnd} onChange={setPeriodEnd}
                placeholder="2026-09-30" style={{ flex: 1 }} />
            </View>

            {/* ── Meter readings ── */}
            <Text style={styles.section}>METER READINGS (KWH)</Text>
            <View style={styles.row}>
              <Field label="Solar Gen KWH_G" value={generationKwh} onChange={setGenerationKwh}
                placeholder="Not on bill? Leave blank" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="Grid Import KWH_I *" value={importKwh} onChange={setImportKwh}
                placeholder="241" keyboardType="numeric" style={{ flex: 1 }} />
            </View>
            <View style={styles.row}>
              <Field label="Grid Export KWH_E *" value={exportKwh} onChange={setExportKwh}
                placeholder="331" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="Opening Credit (kWh)" value={openingCredit} onChange={setOpeningCredit}
                placeholder="Prev. balance" keyboardType="numeric" style={{ flex: 1 }} />
            </View>

            {/* ── Live Preview ── */}
            <View style={styles.liveBox}>
              <Text style={styles.liveTitle}>⚡ LIVE ENERGY ACCOUNTING PREVIEW</Text>
              <View style={styles.liveGrid}>
                <LiveStat label="Available" value={liveCalc.availableCreditKwh} />
                <LiveStat label="Credit used" value={liveCalc.adjustedCreditKwh} color={COLORS.export} />
                <LiveStat label="Net billed import" value={liveCalc.netBilledImportKwh} color={COLORS.import} />
                <LiveStat label="Closing credit →" value={liveCalc.closingCreditKwh} color={COLORS.gold} bold />
              </View>
              {liveCalc.directSolarUseKwh !== null && (
                <Text style={styles.liveFootnote}>
                  Direct solar use (est.): {liveCalc.directSolarUseKwh} kWh · Total consumption: {liveCalc.estimatedTotalConsumptionKwh} kWh
                </Text>
              )}
            </View>

            {/* ── Financial ── */}
            <Text style={styles.section}>BILL DETAILS (INR)</Text>
            <View style={styles.row}>
              <Field label="Total Amount (₹) *" value={billAmount} onChange={setBillAmount}
                placeholder="264.00" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="Due Date" value={dueDate} onChange={setDueDate}
                placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
            </View>
            <View style={styles.row}>
              <Field label="Demand/Fixed (₹)" value={demandCharges} onChange={setDemandCharges}
                placeholder="223.46" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="FPPCA (₹)" value={fppca} onChange={setFppca}
                placeholder="42.98" keyboardType="numeric" style={{ flex: 1 }} />
            </View>
            <View style={styles.row}>
              <Field label="Rebate (₹, use − for credit)" value={rebate} onChange={setRebate}
                placeholder="-2.37" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="Bill Number" value={billNumber} onChange={setBillNumber}
                placeholder="17000216006" style={{ flex: 1 }} />
            </View>
            <Field label="Notes (optional)" value={notes} onChange={setNotes}
              placeholder="Add any observations…" multiline />
          </ScrollView>

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <TouchableOpacity id="btn-cancel-add-bill" style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              id="btn-save-bill"
              style={[styles.saveBtn, isSubmitting && { opacity: 0.65 }]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
              <Text style={styles.saveBtnText}>
                {isSubmitting ? 'Saving…' : 'Save to Firestore'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── Helper sub-components ────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'default';
  multiline?: boolean;
  style?: object;
}
const Field: React.FC<FieldProps> = ({
  label, value, onChange, placeholder, keyboardType = 'default', multiline, style,
}) => (
  <View style={[{ marginBottom: SPACING.sm }, style]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && { height: 64, textAlignVertical: 'top' }]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      keyboardType={keyboardType}
      multiline={multiline}
    />
  </View>
);

interface LiveStatProps {
  label: string;
  value: number | null;
  color?: string;
  bold?: boolean;
}
const LiveStat: React.FC<LiveStatProps> = ({ label, value, color = COLORS.textSub, bold }) => (
  <View style={styles.liveStat}>
    <Text style={styles.liveStatLabel}>{label}</Text>
    <Text style={[styles.liveStatValue, { color }, bold && { fontWeight: FONT.bold }]}>
      {value ?? '—'} kWh
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '92%',
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
  sheetSub: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  closeBtn: { padding: SPACING.xs },
  form: { padding: SPACING.lg },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.glowGold,
    borderWidth: 1,
    borderColor: `${COLORS.gold}55`,
    padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  presetBtnText: { fontSize: 12, fontWeight: FONT.bold, color: COLORS.gold },
  section: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
    letterSpacing: 0.7,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  row: { flexDirection: 'row', gap: SPACING.sm },
  fieldLabel: { fontSize: 11, fontWeight: FONT.semi, color: COLORS.textSub, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 13,
  },
  liveBox: {
    backgroundColor: COLORS.glowGreen,
    borderWidth: 1,
    borderColor: `${COLORS.success}44`,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  liveTitle: {
    fontSize: 10,
    fontWeight: FONT.heavy,
    color: COLORS.success,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  liveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  liveStat: { flex: 1, minWidth: '45%' },
  liveStatLabel: { fontSize: 10, color: COLORS.textMuted },
  liveStatValue: { fontSize: 13, fontWeight: FONT.semi, color: COLORS.text },
  liveFootnote: { fontSize: 10, color: COLORS.textMuted, marginTop: SPACING.xs },
  footer: {
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
  cancelBtnText: { fontSize: 14, fontWeight: FONT.semi, color: COLORS.textSub },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    padding: 12,
    borderRadius: RADIUS.md,
  },
  saveBtnText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
});
