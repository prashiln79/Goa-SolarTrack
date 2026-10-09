// ============================================================
// Add/Edit Bill Modal — Streamlined Quick Entry + PDF Upload
// PRD §3.3 Manual entry workflow + §6 energy accounting + PDF parser
// Auto-derives dates from Month/Year selector or uploaded bill PDF.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SolarBill, SystemProfile } from '../types/solar';
import { calculateEnergyAccounting } from '../domain/energyAccounting';
import { parseBillPdf, extractTextFromPdfContent, parseGoaBillText } from '../services/billPdfParser';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';

interface AddBillModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (bill: SolarBill) => Promise<void>;
  latestBill?: SolarBill | null;
  profile?: SystemProfile | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseNum(s: string): number | null {
  const v = parseFloat(s.trim());
  return isNaN(v) || s.trim() === '' ? null : v;
}

export const AddBillModal: React.FC<AddBillModalProps> = ({
  visible,
  onClose,
  onSave,
  latestBill,
  profile,
}) => {
  // ── Month & Year state ──
  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11
  const [showMonthGrid, setShowMonthGrid] = useState(false);

  // ── PDF Upload state ──
  const [attachedPdf, setAttachedPdf]     = useState<{
    name: string;
    size?: number;
    uri: string;
  } | null>(null);
  const [isParsingPdf, setIsParsingPdf]   = useState(false);
  // Inline status shown below PDF button — no Alert popups
  const [pdfStatus, setPdfStatus]         = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [saveError, setSaveError]         = useState<string | null>(null);

  // ── Core fields ──
  const [importKwh, setImportKwh]               = useState('');
  const [exportKwh, setExportKwh]               = useState('');
  const [billAmount, setBillAmount]             = useState('');
  const [generationKwh, setGenerationKwh]       = useState('');
  const [openingCredit, setOpeningCredit]       = useState('');
  // Bill-stated bank values — parsed directly from the PDF (bill-first rule)
  const [billAdjustedCredit, setBillAdjustedCredit] = useState<number | null>(null);
  const [billClosingCredit, setBillClosingCredit]   = useState<number | null>(null);

  // ── Detailed / Optional fields (collapsed by default) ──
  const [showDetails, setShowDetails]     = useState(false);
  const [customDays, setCustomDays]       = useState('');
  const [customStart, setCustomStart]     = useState('');
  const [customEnd, setCustomEnd]         = useState('');
  const [billNumber, setBillNumber]       = useState('');
  const [dueDate, setDueDate]             = useState('');
  const [demandCharges, setDemandCharges] = useState('');
  const [fppca, setFppca]                 = useState('');
  const [rebate, setRebate]               = useState('');
  const [notes, setNotes]                 = useState('');

  const [isSubmitting, setIsSubmitting]   = useState(false);

  // ── Auto-derive period dates ──
  const derivedDates = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const mm = String(selectedMonth + 1).padStart(2, '0');
    const label = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const start = `${selectedYear}-${mm}-01`;
    const end = `${selectedYear}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
    return { label, start, end, daysInMonth };
  }, [selectedYear, selectedMonth]);

  // ── Initialize form on modal open ──
  useEffect(() => {
    if (!visible) return;

    // Reset core inputs
    setImportKwh('');
    setExportKwh('');
    setBillAmount('');
    setGenerationKwh('');
    setBillAdjustedCredit(null);
    setBillClosingCredit(null);
    setPdfStatus(null);
    setSaveError(null);
    setAttachedPdf(null);
    setIsParsingPdf(false);
    setShowDetails(false);
    setShowMonthGrid(false);

    // Reset detailed inputs
    setCustomDays('');
    setCustomStart('');
    setCustomEnd('');
    setBillNumber('');
    setDueDate('');
    setDemandCharges('');
    setFppca('');
    setRebate('');
    setNotes('');

    // Pre-fill opening credit from latest bill
    if (latestBill) {
      setOpeningCredit(String(latestBill.closingCreditKwh));

      // Try suggesting next month after latest bill
      try {
        const parts = latestBill.periodStart.split('-');
        if (parts.length >= 2) {
          const prevY = parseInt(parts[0]);
          const prevM = parseInt(parts[1]) - 1; // 0-indexed
          const nextDate = new Date(prevY, prevM + 1, 1);
          setSelectedYear(nextDate.getFullYear());
          setSelectedMonth(nextDate.getMonth());
          return;
        }
      } catch (_) {}
    } else {
      setOpeningCredit('0');
      setSelectedYear(now.getFullYear());
      setSelectedMonth(now.getMonth());
    }
  }, [visible, latestBill]);

  // ── Month step navigation ──
  const stepMonth = (direction: -1 | 1) => {
    let nextM = selectedMonth + direction;
    let nextY = selectedYear;
    if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    } else if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setSelectedMonth(nextM);
    setSelectedYear(nextY);
  };

  // ── Handle PDF File Picker & Auto-Extraction ──
  const handlePickPdf = async () => {
    try {
      setPdfStatus(null);
      setSaveError(null);
      setIsParsingPdf(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setIsParsingPdf(false);
        return;
      }

      const asset = result.assets[0];
      setAttachedPdf({ name: asset.name, size: asset.size, uri: asset.uri });
      setPdfStatus({ type: 'info', text: `Reading ${asset.name}…` });

      // Read the raw PDF bytes — use FileSystem on native (avoids fetch URI failure),
      // fall back to fetch on web where FileSystem is unavailable.
      let rawText = '';
      try {
        if (Platform.OS !== 'web' && FileSystem.readAsStringAsync) {
          rawText = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } else {
          const response = await fetch(asset.uri);
          rawText = await response.text();
        }
      } catch (readErr) {
        // If reading fails just attach the PDF without auto-fill
        console.warn('[PDF read]', readErr);
        setPdfStatus({ type: 'info', text: `📄 ${asset.name} attached — enter values manually.` });
        setIsParsingPdf(false);
        return;
      }

      // Parse extracted text and fill form fields safely
      const parsed = parseBillPdf(rawText);
      const diagnostics = parsed.diagnostics;
      let fieldsDetected = 0;

      if (parsed.importKwh !== undefined && !isNaN(parsed.importKwh)) {
        setImportKwh(String(parsed.importKwh));
        fieldsDetected++;
      }
      if (parsed.exportKwh !== undefined && !isNaN(parsed.exportKwh)) {
        setExportKwh(String(parsed.exportKwh));
        fieldsDetected++;
      }
      if (parsed.billAmount !== undefined && !isNaN(parsed.billAmount)) {
        setBillAmount(String(parsed.billAmount));
        fieldsDetected++;
      }
      if (parsed.generationKwh !== undefined && parsed.generationKwh !== null && !isNaN(parsed.generationKwh)) {
        setGenerationKwh(String(parsed.generationKwh));
        fieldsDetected++;
      }
      if (parsed.openingCreditKwh !== undefined && !isNaN(parsed.openingCreditKwh)) {
        setOpeningCredit(String(parsed.openingCreditKwh));
        fieldsDetected++;
      }
      // Bill-stated adjusted and closing credit (bill-first rule — use these directly on save)
      if (parsed.adjustedCreditKwh !== undefined && !isNaN(parsed.adjustedCreditKwh)) {
        setBillAdjustedCredit(parsed.adjustedCreditKwh);
      }
      if (parsed.closingCreditKwh !== undefined && !isNaN(parsed.closingCreditKwh)) {
        setBillClosingCredit(parsed.closingCreditKwh);
        fieldsDetected++;
      }
      if (parsed.periodMonth !== undefined && parsed.periodYear !== undefined) {
        setSelectedMonth(parsed.periodMonth);
        setSelectedYear(parsed.periodYear);
        fieldsDetected++;
      }
      if (parsed.billNumber) {
        setBillNumber(parsed.billNumber);
        fieldsDetected++;
      }
      if (parsed.dueDate) {
        setDueDate(parsed.dueDate);
        fieldsDetected++;
      }
      if (parsed.billingDays !== undefined && !isNaN(parsed.billingDays)) {
        setCustomDays(String(parsed.billingDays));
      }
      if (parsed.periodStart) {
        setCustomStart(parsed.periodStart);
      }
      if (parsed.periodEnd) {
        setCustomEnd(parsed.periodEnd);
      }
      if (parsed.demandCharges !== undefined && !isNaN(parsed.demandCharges)) {
        setDemandCharges(String(parsed.demandCharges));
        fieldsDetected++;
      }
      if (parsed.fppca !== undefined && !isNaN(parsed.fppca)) {
        setFppca(String(parsed.fppca));
        fieldsDetected++;
      }
      if (parsed.rebate !== undefined && !isNaN(parsed.rebate)) {
        setRebate(String(parsed.rebate));
        fieldsDetected++;
      }

      if (fieldsDetected > 0) {
        const periodNote = parsed.periodLabel ? ` (${parsed.periodLabel})` : '';
        setPdfStatus({
          type: 'success',
          text: `✅ ${fieldsDetected} fields auto-filled${periodNote} — please review below.`,
        });
      } else if (diagnostics?.error) {
        setPdfStatus({
          type: 'info',
          text: `📄 ${diagnostics.error}`,
        });
      } else {
        setPdfStatus({
          type: 'info',
          text: `📄 ${asset.name} attached — enter values manually.`,
        });
      }
    } catch (err: any) {
      console.warn('[handlePickPdf]', err);
      setPdfStatus({ type: 'error', text: err?.message ?? 'Could not open document picker.' });
    } finally {
      setIsParsingPdf(false);
    }
  };

  // ── Live Energy Accounting calculation ──
  const liveCalc = useMemo(() => {
    const imp = parseNum(importKwh) ?? 0;
    const exp = parseNum(exportKwh) ?? 0;
    const openCred = parseNum(openingCredit) ?? 0;
    const gen = parseNum(generationKwh);

    return calculateEnergyAccounting({
      generationKwh: gen,
      importKwh: imp,
      exportKwh: exp,
      openingCreditKwh: openCred,
    });
  }, [importKwh, exportKwh, openingCredit, generationKwh]);

  // ── Save action ──
  const handleSave = async () => {
    const imp = parseNum(importKwh);
    const exp = parseNum(exportKwh);
    const amount = parseNum(billAmount);
    setSaveError(null);

    if (imp === null || exp === null || amount === null) {
      setSaveError('Please enter Grid Import (kWh), Grid Export (kWh), and Bill Amount (₹).');
      return;
    }

    const gen = parseNum(generationKwh);
    const opening = parseNum(openingCredit) ?? 0;
    const days = parseInt(customDays) || derivedDates.daysInMonth;
    const start = customStart.trim() || derivedDates.start;
    const end = customEnd.trim() || derivedDates.end;

    const calc = calculateEnergyAccounting({
      generationKwh: gen,
      importKwh: imp,
      exportKwh: exp,
      openingCreditKwh: opening,
    });

    const cleanBillNum = billNumber.trim();
    const billId = cleanBillNum ? `bill_${cleanBillNum}` : `bill_${Date.now()}`;

    const bill: SolarBill = {
      id: billId,
      consumerNumber: profile?.consumerNumber,
      period: derivedDates.label,
      periodStart: start,
      periodEnd: end,
      billingDays: days,
      tariffCategory: profile?.tariffCategory || 'LTDS-II-SOLAR',
      generationKwh: gen,
      importKwh: imp,
      exportKwh: exp,
      openingCreditKwh: opening,
      // Bill-first rule: use bill-stated values from PDF if available,
      // otherwise fall back to calculated values.
      ...calc,
      ...(billAdjustedCredit !== null && { adjustedCreditKwh: billAdjustedCredit }),
      ...(billClosingCredit !== null && { closingCreditKwh: billClosingCredit }),
      billAmount: amount,
      billNumber: billNumber.trim() || undefined,
      dueDate: dueDate.trim() || undefined,
      demandCharges: parseNum(demandCharges) ?? undefined,
      fppca: parseNum(fppca) ?? undefined,
      rebate: parseNum(rebate) ?? undefined,
      notes: notes.trim() || undefined,
      source: attachedPdf ? 'ocr_confirmed' : 'manual',
      sourceDocId: attachedPdf?.name,
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
      setSaveError(e?.message ?? 'Save failed — please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* ── Modal Header ── */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Add Monthly Bill</Text>
              <Text style={styles.sheetSub}>
                {profile?.consumerNumber ? `Consumer #${profile.consumerNumber}` : 'Quick Entry'}
              </Text>
            </View>
            <TouchableOpacity id="btn-close-add-bill" onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>

            {/* ── 1. PDF UPLOAD CARD ── */}
            {!attachedPdf ? (
              <TouchableOpacity
                id="btn-upload-bill-pdf"
                style={styles.uploadCard}
                onPress={handlePickPdf}
                disabled={isParsingPdf}
                activeOpacity={0.8}
              >
                <View style={styles.uploadIconWrap}>
                  <Ionicons name="document-text" size={22} color={COLORS.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadTitle}>
                    {isParsingPdf ? 'Analyzing PDF…' : 'Upload EDG Bill (PDF)'}
                  </Text>
                  <Text style={styles.uploadSub}>
                    {isParsingPdf
                      ? 'Extracting meter readings and charges…'
                      : 'Auto-fill readings directly from your electricity bill'}
                  </Text>
                </View>
                <View style={styles.uploadBadge}>
                  {isParsingPdf ? (
                    <ActivityIndicator size="small" color={COLORS.gold} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={15} color={COLORS.gold} />
                      <Text style={styles.uploadBadgeText}>Upload</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.attachedCard}>
                <View style={styles.attachedLeft}>
                  <Ionicons name="document-attach" size={22} color={COLORS.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachedName} numberOfLines={1}>
                      {attachedPdf.name}
                    </Text>
                    <Text style={styles.attachedStatus}>
                      {attachedPdf.size ? `${(attachedPdf.size / 1024).toFixed(0)} KB · ` : ''}
                      Bill Attached & Extracted
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  id="btn-remove-pdf"
                  onPress={() => setAttachedPdf(null)}
                  style={styles.removePdfBtn}
                >
                  <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── PDF inline status (no Alert popups) ── */}
            {pdfStatus && (
              <View
                style={[
                  styles.pdfStatusBar,
                  pdfStatus.type === 'success' && { backgroundColor: '#064e3b22', borderColor: COLORS.success },
                  pdfStatus.type === 'error'   && { backgroundColor: '#7f1d1d22', borderColor: '#ef4444' },
                ]}
              >
                <Text style={[
                  styles.pdfStatusText,
                  pdfStatus.type === 'success' && { color: COLORS.success },
                  pdfStatus.type === 'error'   && { color: '#ef4444' },
                ]}>
                  {pdfStatus.text}
                </Text>
              </View>
            )}

            {/* ── 2. MONTH SELECTOR ── */}
            <View style={styles.monthCard}>
              <View style={styles.monthHeaderRow}>
                <TouchableOpacity
                  id="btn-prev-month"
                  style={styles.monthArrowBtn}
                  onPress={() => stepMonth(-1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={20} color={COLORS.gold} />
                </TouchableOpacity>

                <TouchableOpacity
                  id="btn-toggle-month-picker"
                  style={styles.monthCenterDisplay}
                  onPress={() => setShowMonthGrid(!showMonthGrid)}
                  activeOpacity={0.7}
                >
                  <View style={styles.calendarTag}>
                    <Ionicons name="calendar-outline" size={15} color={COLORS.gold} />
                    <Text style={styles.monthLabelText}>{derivedDates.label}</Text>
                    <Ionicons
                      name={showMonthGrid ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={COLORS.textSub}
                    />
                  </View>
                  <Text style={styles.monthDateSubtext}>
                    {derivedDates.start} to {derivedDates.end} ({derivedDates.daysInMonth} days)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  id="btn-next-month"
                  style={styles.monthArrowBtn}
                  onPress={() => stepMonth(1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-forward" size={20} color={COLORS.gold} />
                </TouchableOpacity>
              </View>

              {/* Month Grid (Quick picker when tapped) */}
              {showMonthGrid && (
                <View style={styles.monthGridContainer}>
                  <View style={styles.yearRow}>
                    <TouchableOpacity
                      onPress={() => setSelectedYear((y) => y - 1)}
                      style={styles.yearStepBtn}
                    >
                      <Ionicons name="chevron-back" size={16} color={COLORS.textSub} />
                    </TouchableOpacity>
                    <Text style={styles.yearLabel}>{selectedYear}</Text>
                    <TouchableOpacity
                      onPress={() => setSelectedYear((y) => y + 1)}
                      style={styles.yearStepBtn}
                    >
                      <Ionicons name="chevron-forward" size={16} color={COLORS.textSub} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.monthPillsGrid}>
                    {SHORT_MONTHS.map((m, idx) => {
                      const isSelected = idx === selectedMonth;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[styles.monthPill, isSelected && styles.monthPillActive]}
                          onPress={() => {
                            setSelectedMonth(idx);
                            setShowMonthGrid(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.monthPillText,
                              isSelected && styles.monthPillTextActive,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* ── 3. PREVIOUS ENERGY BANK BANNER ── */}
            <View style={styles.bankBanner}>
              <View style={styles.bankLeft}>
                <Ionicons name="wallet-outline" size={18} color={COLORS.bank} />
                <View>
                  <Text style={styles.bankTitle}>Energy Bank Opening Balance</Text>
                  <Text style={styles.bankSub}>Carried forward from previous month</Text>
                </View>
              </View>
              <View style={styles.bankRight}>
                <TextInput
                  id="input-opening-credit"
                  style={styles.bankInput}
                  value={openingCredit}
                  onChangeText={setOpeningCredit}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
                <Text style={styles.bankUnit}>kWh</Text>
              </View>
            </View>

            {/* ── 4. THREE CORE INPUTS ── */}
            <Text style={styles.sectionHeader}>METER READINGS & BILL AMOUNT</Text>

            <View style={styles.coreGrid}>
              {/* Grid Import */}
              <View style={styles.coreCard}>
                <View style={styles.coreCardTop}>
                  <Ionicons name="arrow-down-circle" size={18} color={COLORS.import} />
                  <Text style={styles.coreLabel}>
                    Grid Import <Text style={styles.req}>*</Text>
                  </Text>
                </View>
                <View style={styles.inputBox}>
                  <TextInput
                    id="input-grid-import"
                    style={styles.coreInput}
                    value={importKwh}
                    onChangeText={setImportKwh}
                    placeholder="e.g. 240"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <Text style={styles.unitText}>kWh</Text>
                </View>
                <Text style={styles.coreDesc}>Units drawn from grid</Text>
              </View>

              {/* Grid Export */}
              <View style={styles.coreCard}>
                <View style={styles.coreCardTop}>
                  <Ionicons name="arrow-up-circle" size={18} color={COLORS.export} />
                  <Text style={styles.coreLabel}>
                    Grid Export <Text style={styles.req}>*</Text>
                  </Text>
                </View>
                <View style={styles.inputBox}>
                  <TextInput
                    id="input-grid-export"
                    style={styles.coreInput}
                    value={exportKwh}
                    onChangeText={setExportKwh}
                    placeholder="e.g. 330"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <Text style={styles.unitText}>kWh</Text>
                </View>
                <Text style={styles.coreDesc}>Solar sent to grid</Text>
              </View>
            </View>

            {/* Total Payable Bill Amount */}
            <View style={styles.amountCard}>
              <View style={styles.amountTop}>
                <Ionicons name="cash-outline" size={20} color={COLORS.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.amountLabel}>
                    Total Bill Amount <Text style={styles.req}>*</Text>
                  </Text>
                  <Text style={styles.amountDesc}>Payable amount printed on EDG bill</Text>
                </View>
              </View>
              <View style={styles.amountInputRow}>
                <Text style={styles.rupeeSign}>₹</Text>
                <TextInput
                  id="input-bill-amount"
                  style={styles.amountInput}
                  value={billAmount}
                  onChangeText={setBillAmount}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Optional Solar Generation */}
            <View style={styles.optionalCard}>
              <View style={styles.optionalLeft}>
                <Ionicons name="sunny-outline" size={18} color={COLORS.generation} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionalLabel}>Solar Generation (Optional)</Text>
                  <Text style={styles.optionalDesc}>Read from inverter app (KWH_G)</Text>
                </View>
              </View>
              <View style={styles.optionalInputBox}>
                <TextInput
                  id="input-solar-generation"
                  style={styles.optionalInput}
                  value={generationKwh}
                  onChangeText={setGenerationKwh}
                  placeholder="e.g. 430"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
                <Text style={styles.unitText}>kWh</Text>
              </View>
            </View>

            {/* ── 5. LIVE ENERGY ACCOUNTING PREVIEW ── */}
            <View style={styles.liveBox}>
              <View style={styles.liveHeader}>
                <Ionicons name="flash" size={14} color={COLORS.success} />
                <Text style={styles.liveTitle}>ENERGY ACCOUNTING RESULT</Text>
              </View>

              <View style={styles.liveGrid}>
                <View style={styles.liveCol}>
                  <Text style={styles.liveColLabel}>Net Billed Units</Text>
                  <Text style={[styles.liveColValue, { color: COLORS.import }]}>
                    {liveCalc.netBilledImportKwh} kWh
                  </Text>
                </View>

                <View style={styles.liveCol}>
                  <Text style={styles.liveColLabel}>Credit Offset</Text>
                  <Text style={[styles.liveColValue, { color: COLORS.export }]}>
                    {liveCalc.adjustedCreditKwh} kWh
                  </Text>
                </View>

                <View style={styles.liveCol}>
                  <Text style={styles.liveColLabel}>Bank Closing</Text>
                  <Text style={[styles.liveColValue, { color: COLORS.gold, fontWeight: FONT.bold }]}>
                    {liveCalc.closingCreditKwh} kWh
                  </Text>
                </View>
              </View>
            </View>

            {/* ── 6. OPTIONAL DETAILED CHARGES (COLLAPSED) ── */}
            <TouchableOpacity
              id="btn-toggle-details"
              style={styles.detailsToggle}
              onPress={() => setShowDetails(!showDetails)}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsToggleText}>
                {showDetails ? '− Hide Detailed Charges & Dates' : '+ Additional Bill Charges & Dates (Optional)'}
              </Text>
              <Ionicons
                name={showDetails ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.gold}
              />
            </TouchableOpacity>

            {showDetails && (
              <View style={styles.detailsContent}>
                <View style={styles.row}>
                  <Field
                    label="Bill Number"
                    value={billNumber}
                    onChange={setBillNumber}
                    placeholder="17000216006"
                    style={{ flex: 1 }}
                  />
                  <Field
                    label="Due Date (YYYY-MM-DD)"
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="2026-10-15"
                    style={{ flex: 1 }}
                  />
                </View>

                <View style={styles.row}>
                  <Field
                    label="Fixed/Demand (₹)"
                    value={demandCharges}
                    onChange={setDemandCharges}
                    placeholder="223.46"
                    keyboardType="numeric"
                    style={{ flex: 1 }}
                  />
                  <Field
                    label="FPPCA (₹)"
                    value={fppca}
                    onChange={setFppca}
                    placeholder="42.98"
                    keyboardType="numeric"
                    style={{ flex: 1 }}
                  />
                </View>

                <View style={styles.row}>
                  <Field
                    label="Rebate (₹)"
                    value={rebate}
                    onChange={setRebate}
                    placeholder="-2.37"
                    keyboardType="numeric"
                    style={{ flex: 1 }}
                  />
                  <Field
                    label="Custom Billing Days"
                    value={customDays}
                    onChange={setCustomDays}
                    placeholder={String(derivedDates.daysInMonth)}
                    keyboardType="numeric"
                    style={{ flex: 1 }}
                  />
                </View>

                <View style={styles.row}>
                  <Field
                    label="Custom Start Date"
                    value={customStart}
                    onChange={setCustomStart}
                    placeholder={derivedDates.start}
                    style={{ flex: 1 }}
                  />
                  <Field
                    label="Custom End Date"
                    value={customEnd}
                    onChange={setCustomEnd}
                    placeholder={derivedDates.end}
                    style={{ flex: 1 }}
                  />
                </View>

                <Field
                  label="Notes (Optional)"
                  value={notes}
                  onChange={setNotes}
                  placeholder="Meter remarks, tariff notes…"
                  multiline
                />
              </View>
            )}

            <View style={{ height: SPACING.md }} />
          </ScrollView>

          {/* ── Modal Footer ── */}
          <View style={styles.footer}>
            {/* Save error shown inline above buttons */}
            {saveError && (
              <View style={styles.saveErrorBar}>
                <Ionicons name="warning-outline" size={14} color={'#ef4444'} />
                <Text style={styles.saveErrorText}>{saveError}</Text>
              </View>
            )}

            <View style={styles.footerBtns}>
              <TouchableOpacity id="btn-cancel-add-bill" style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                id="btn-save-bill"
                style={[styles.saveBtn, isSubmitting && { opacity: 0.65 }]}
                onPress={handleSave}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                <Text style={styles.saveBtnText}>
                  {isSubmitting ? 'Saving…' : `Save ${derivedDates.label} Bill`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── Reusable Field component ──────────────────────────────────
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
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  multiline,
  style,
}) => (
  <View style={[{ marginBottom: SPACING.sm }, style]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && { height: 60, textAlignVertical: 'top' }]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      keyboardType={keyboardType}
      multiline={multiline}
    />
  </View>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: FONT.bold, color: COLORS.text },
  sheetSub: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  closeBtn: { padding: SPACING.xs },
  form: { padding: SPACING.lg },

  // PDF Upload Card
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glowGold,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: `${COLORS.gold}55`,
    borderStyle: 'dashed',
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  uploadIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.gold}33`,
  },
  uploadTitle: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  uploadSub: {
    fontSize: 11,
    color: COLORS.textSub,
    marginTop: 2,
    lineHeight: 15,
  },
  uploadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: `${COLORS.gold}44`,
    gap: 4,
  },
  uploadBadgeText: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.gold,
  },

  // Attached PDF Card
  attachedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${COLORS.success}12`,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: `${COLORS.success}44`,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  attachedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    marginRight: SPACING.sm,
  },
  attachedName: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  attachedStatus: {
    fontSize: 11,
    color: COLORS.success,
    marginTop: 2,
    fontWeight: FONT.semi,
  },
  removePdfBtn: {
    padding: SPACING.xs,
  },
  pdfStatusBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: SPACING.sm,
  },
  pdfStatusText: {
    fontSize: 12,
    fontWeight: FONT.medium,
    color: COLORS.textSub,
    flexShrink: 1,
  },

  // Month Picker Card
  monthCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthCenterDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  calendarTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthLabelText: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  monthDateSubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  monthGridContainer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  yearStepBtn: {
    padding: SPACING.xs,
  },
  yearLabel: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  monthPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  monthPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthPillActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  monthPillTextActive: {
    color: COLORS.textInverse,
    fontWeight: FONT.bold,
  },

  // Bank Banner
  bankBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${COLORS.bank}12`,
    borderWidth: 1,
    borderColor: `${COLORS.bank}33`,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  bankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  bankTitle: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.bank,
  },
  bankSub: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  bankRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bankInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: `${COLORS.bank}55`,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
    minWidth: 50,
    textAlign: 'center',
  },
  bankUnit: {
    fontSize: 11,
    fontWeight: FONT.semi,
    color: COLORS.bank,
  },

  // Section Header
  sectionHeader: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },

  // Core inputs
  coreGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  coreCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  coreCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.xs,
  },
  coreLabel: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  req: {
    color: COLORS.danger,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    height: 44,
    marginVertical: 4,
  },
  coreInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  unitText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
  },
  coreDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Amount Card
  amountCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: `${COLORS.gold}55`,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  amountTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  amountDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 50,
    marginTop: SPACING.xs,
  },
  rupeeSign: {
    fontSize: 20,
    fontWeight: FONT.bold,
    color: COLORS.gold,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },

  // Optional Generation
  optionalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  optionalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    marginRight: SPACING.sm,
  },
  optionalLabel: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  optionalDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  optionalInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    height: 38,
    width: 110,
  },
  optionalInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },

  // Live box
  liveBox: {
    backgroundColor: `${COLORS.success}10`,
    borderWidth: 1,
    borderColor: `${COLORS.success}44`,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  liveTitle: {
    fontSize: 10,
    fontWeight: FONT.heavy,
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  liveGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  liveCol: {
    flex: 1,
  },
  liveColLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  liveColValue: {
    fontSize: 14,
    fontWeight: FONT.semi,
    marginTop: 2,
  },

  // Details toggle
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  detailsToggleText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.gold,
  },
  detailsContent: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 13,
  },

  // Footer
  footer: {
    flexDirection: 'column',
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.lg,
    gap: SPACING.sm,
  },
  footerBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  saveErrorBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#7f1d1d18',
    borderWidth: 1,
    borderColor: '#ef444460',
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  saveErrorText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: FONT.medium,
    flex: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    ...SHADOW.card,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },
});
