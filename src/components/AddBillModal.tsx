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
import { File as ExpoFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SolarBill, SystemProfile } from '../types/solar';
import { calculateEnergyAccounting } from '../domain/energyAccounting';
import { parseBillPdf, extractTextFromPdfContent, parseGoaBillText } from '../services/billPdfParser';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';
import { DateField } from './ui/DatePickerModal';

interface AddBillModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (bill: SolarBill) => Promise<void>;
  latestBill?: SolarBill | null;
  profile?: SystemProfile | null;
  existingBills?: SolarBill[];
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

/**
 * Decodes a Base64 string into a raw binary string.
 * PDFs contain arbitrary binary byte streams (0x00-0xFF), which fail when read
 * directly as UTF-8 strings across the React Native native bridge.
 */
function decodeBase64ToBinaryString(base64: string): string {
  try {
    if (typeof atob === 'function') {
      return atob(base64.replace(/\s/g, ''));
    }
  } catch (e) {
    console.warn('[atob error, using fallback]', e);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const b1 = chars.indexOf(clean.charAt(i++));
    const b2 = chars.indexOf(clean.charAt(i++));
    const b3 = chars.indexOf(clean.charAt(i++));
    const b4 = chars.indexOf(clean.charAt(i++));
    const c1 = (b1 << 2) | (b2 >> 4);
    const c2 = ((b2 & 15) << 4) | (b3 >> 2);
    const c3 = ((b3 & 3) << 6) | b4;
    out.push(String.fromCharCode(c1));
    if (b3 !== 64 && b3 !== -1) out.push(String.fromCharCode(c2));
    if (b4 !== 64 && b4 !== -1) out.push(String.fromCharCode(c3));
  }
  return out.join('');
}

/**
 * Robust cross-platform reader that reads a file URI as Base64.
 * Uses native FileSystem where accessible, and falls back to fetch + Blob + FileReader
 * to support Android Content URIs, Expo Go scoped cache directories, and web blobs.
 */
async function readFileAsBase64(uri: string): Promise<string> {
  // 1. Copy via ContentResolver to app internal cache directory
  // This seamlessly handles Samsung My Files providers, Expo Go scoped cache permissions,
  // and content:// stream access across all Android devices.
  if (Platform.OS !== 'web' && FileSystem.cacheDirectory && FileSystem.copyAsync) {
    const tempDest = `${FileSystem.cacheDirectory}bill_${Date.now()}.pdf`;
    try {
      await FileSystem.copyAsync({
        from: uri,
        to: tempDest,
      });
      let b64 = '';
      if (FileSystem.readAsStringAsync) {
        b64 = await FileSystem.readAsStringAsync(tempDest, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        const file = new ExpoFile(tempDest);
        b64 = await file.base64();
      }
      try {
        await FileSystem.deleteAsync(tempDest, { idempotent: true });
      } catch (_) {}
      if (b64 && b64.length > 0) {
        return b64;
      }
    } catch (copyErr) {
      console.warn('[copyAsync to cache failed, falling back to direct readers]', copyErr);
      try {
        await FileSystem.deleteAsync(tempDest, { idempotent: true });
      } catch (_) {}
    }
  }

  // 2. Modern Expo File API (supports content:// and file:// natively)
  try {
    const file = new ExpoFile(uri);
    const b64 = await file.base64();
    if (b64 && typeof b64 === 'string' && b64.length > 0) {
      return b64;
    }
  } catch (expoFileErr) {
    console.warn('[Expo File.base64 failed]', expoFileErr);
  }

  // 3. Legacy FileSystem.readAsStringAsync fallback
  if (Platform.OS !== 'web' && FileSystem.readAsStringAsync) {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (b64 && b64.length > 0) {
        return b64;
      }
    } catch (fsErr) {
      console.warn('[FileSystem Base64 read failed]', fsErr);
    }
  }

  // 4. Fetch + Blob + FileReader fallback (for web or standard HTTP/data/blob URIs)
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result;
        if (typeof res === 'string') {
          const base64 = res.includes(',') ? res.split(',')[1] : res;
          resolve(base64);
        } else {
          reject(new Error('FileReader did not produce a string result.'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader failed to read blob.'));
      reader.readAsDataURL(blob);
    });
  } catch (fetchErr) {
    console.warn('[Fetch+FileReader fallback failed]', fetchErr);
    throw fetchErr;
  }
}

export const AddBillModal: React.FC<AddBillModalProps> = ({
  visible,
  onClose,
  onSave,
  latestBill,
  profile,
  existingBills,
}) => {
  const insets = useSafeAreaInsets();

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
  const [entryMode, setEntryMode]               = useState<'bill' | 'simple'>('bill');
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
        type: '*/*',
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setIsParsingPdf(false);
        return;
      }

      const asset = result.assets[0];

      // Validate that selected file is indeed a PDF
      const isPdf =
        asset.name.toLowerCase().endsWith('.pdf') ||
        (asset.mimeType && asset.mimeType.toLowerCase().includes('pdf'));

      if (!isPdf) {
        Alert.alert(
          'PDF Required',
          'The selected file does not appear to be a PDF (.pdf). Please select your Goa electricity bill PDF.'
        );
        setIsParsingPdf(false);
        return;
      }

      setAttachedPdf({ name: asset.name, size: asset.size, uri: asset.uri });
      setPdfStatus({ type: 'info', text: `Reading ${asset.name}…` });

      // Read raw PDF bytes via robust Base64 pipeline (supports both native FileSystem and fetch fallback)
      let rawText = '';
      try {
        const base64Data = await readFileAsBase64(asset.uri);
        rawText = decodeBase64ToBinaryString(base64Data);
      } catch (readErr: any) {
        // If reading fails just attach the PDF without auto-fill
        console.warn('[PDF read error]', readErr);
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

      if (fieldsDetected === 0) {
        setAttachedPdf(null);
        const errorDetail = diagnostics?.isScannedOrImageOnly
          ? 'This PDF appears to be a scanned image or photo without selectable digital text.\n\nPlease upload an official digital PDF downloaded from the Goa Electricity Department portal, or enter your readings manually.'
          : diagnostics?.error ||
            'This document does not contain recognizable Goa Electricity Department (EDG) bill data.\n\nPlease check the file or enter your readings manually.';

        setPdfStatus({
          type: 'error',
          text: `⚠️ Not a valid EDG bill: ${diagnostics?.error || 'No bill data detected'}.`,
        });

        Alert.alert('Invalid Bill Document', errorDetail, [{ text: 'OK' }]);
        setIsParsingPdf(false);
        return;
      }

      // Check if this month's bill or bill number already exists in history
      const detectedPeriod = parsed.periodLabel || (parsed.periodMonth !== undefined && parsed.periodYear !== undefined
        ? `${MONTH_NAMES[parsed.periodMonth]} ${parsed.periodYear}`
        : null);

      const duplicate = existingBills?.find((b) => {
        if (parsed.billNumber && b.billNumber && b.billNumber.trim() === parsed.billNumber.trim()) {
          return true;
        }
        if (detectedPeriod && b.period.toLowerCase() === detectedPeriod.toLowerCase()) {
          return true;
        }
        return false;
      });

      if (duplicate) {
        Alert.alert(
          'Duplicate Bill Detected',
          `A bill for ${duplicate.period}${duplicate.billNumber ? ` (Bill #${duplicate.billNumber})` : ''} already exists in your records.\n\nUploading this will overwrite your existing bill when saved.`,
          [
            {
              text: 'Cancel Upload',
              style: 'cancel',
              onPress: () => {
                setAttachedPdf(null);
                setPdfStatus({
                  type: 'info',
                  text: `ℹ️ Kept existing ${duplicate.period} bill record.`,
                });
              },
            },
            {
              text: 'Review & Overwrite',
              style: 'destructive',
            },
          ]
        );
      } else if (parsed.importKwh === undefined || parsed.exportKwh === undefined) {
        Alert.alert(
          'Incomplete Bill Data',
          'Some key solar readings (Grid Import or Export) could not be detected automatically. Please check and fill in the missing fields before saving.',
          [{ text: 'Review Readings' }]
        );
      }

      const periodNote = parsed.periodLabel ? ` (${parsed.periodLabel})` : '';
      setPdfStatus({
        type: 'success',
        text: `✅ ${fieldsDetected} fields auto-filled${periodNote} — please review below.`,
      });
    } catch (err: any) {
      console.warn('[handlePickPdf]', err);
      const msg = err?.message ?? 'Could not open document picker.';
      setPdfStatus({ type: 'error', text: msg });
      Alert.alert('File Picker Error', `Could not open file picker:\n${msg}`);
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


    const commitSave = async () => {
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

    // Prevent accidental duplicate submission for the same billing month
    const targetPeriod = derivedDates.label;
    const existingDuplicate = existingBills?.find((b) => {
      if (cleanBillNum && b.billNumber && b.billNumber.trim() === cleanBillNum) {
        return true;
      }
      if (b.period && b.period.toLowerCase() === targetPeriod.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (existingDuplicate) {
      Alert.alert(
        'Bill Already Exists',
        `A record for ${existingDuplicate.period}${existingDuplicate.billNumber ? ` (Bill #${existingDuplicate.billNumber})` : ''} already exists.\n\nDo you want to update and overwrite it with these values?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Overwrite & Save',
            style: 'destructive',
            onPress: () => {
              bill.id = existingDuplicate.id;
              commitSave();
            },
          },
        ]
      );
      return;
    }

    await commitSave();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="height" style={styles.overlay}>
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

          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

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

            {/* ── ENTRY MODE SELECTOR ── */}
            <View style={styles.entryModeBar}>
              <TouchableOpacity
                id="btn-entry-mode-bill"
                style={[styles.entryModeTab, entryMode === 'bill' && styles.entryModeTabActive]}
                onPress={() => setEntryMode('bill')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="receipt"
                  size={16}
                  color={entryMode === 'bill' ? COLORS.gold : COLORS.textMuted}
                />
                <Text
                  style={[
                    styles.entryModeTabText,
                    entryMode === 'bill' && styles.entryModeTabTextActive,
                  ]}
                >
                  Bill View
                </Text>
                <View style={styles.easyBadge}>
                  <Text style={styles.easyBadgeText}>Match Bill</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                id="btn-entry-mode-simple"
                style={[styles.entryModeTab, entryMode === 'simple' && styles.entryModeTabActive]}
                onPress={() => setEntryMode('simple')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="grid-outline"
                  size={16}
                  color={entryMode === 'simple' ? COLORS.gold : COLORS.textMuted}
                />
                <Text
                  style={[
                    styles.entryModeTabText,
                    entryMode === 'simple' && styles.entryModeTabTextActive,
                  ]}
                >
                  Quick Cards
                </Text>
              </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════════════════════════════
                MODE A: OFFICIAL GOA ELECTRICITY DEPARTMENT BILL VIEW
               ══════════════════════════════════════════════════════════ */}
            {entryMode === 'bill' ? (
              <View style={styles.edgBillContainer}>
                {/* Perforation / tear-off dashed marker */}
                <View style={styles.cutLineRow}>
                  <Ionicons name="cut-outline" size={12} color={COLORS.textMuted} />
                  <View style={styles.cutLineDashes} />
                  <Text style={styles.cutLineText}>GOA ELECTRICITY DEPARTMENT BILL</Text>
                  <View style={styles.cutLineDashes} />
                  <Ionicons name="cut-outline" size={12} color={COLORS.textMuted} />
                </View>

                {/* Bill Header */}
                <View style={styles.edgHeader}>
                  <View style={styles.edgHeaderTitles}>
                    <Text style={styles.edgGovTitle}>ELECTRICITY DEPARTMENT - GOVERNMENT OF GOA</Text>
                    <Text style={styles.edgSubTitle}>
                      {profile?.consumerNumber
                        ? `Div 10 : Ponda • CA: ${profile.consumerNumber}`
                        : 'Ponda Sub Division • Solar Net-Metering Bill'}
                    </Text>
                  </View>
                  <View style={styles.edgHelplineBadge}>
                    <Text style={styles.edgHelplineLabel}>Help Line</Text>
                    <Text style={styles.edgHelplineNumber}>1912</Text>
                  </View>
                </View>

                {/* Bill Metadata Grid */}
                <View style={styles.edgMetaGrid}>
                  <View style={styles.edgMetaCol}>
                    <Text style={styles.edgMetaLabel}>Bill Number</Text>
                    <TextInput
                      id="input-edg-bill-number"
                      style={styles.edgMetaInput}
                      value={billNumber}
                      onChangeText={setBillNumber}
                      placeholder="e.g. 17000216006"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.edgMetaCol}>
                    <Text style={styles.edgMetaLabel}>Bill Date</Text>
                    <TextInput
                      id="input-edg-bill-date"
                      style={styles.edgMetaInput}
                      value={customEnd}
                      onChangeText={setCustomEnd}
                      placeholder={derivedDates.end}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.edgMetaCol}>
                    <Text style={styles.edgMetaLabel}>Due Date</Text>
                    <TextInput
                      id="input-edg-due-date"
                      style={styles.edgMetaInput}
                      value={dueDate}
                      onChangeText={setDueDate}
                      placeholder="e.g. 09/09/2026"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.edgMetaCol}>
                    <Text style={styles.edgMetaLabel}>Billing Days</Text>
                    <TextInput
                      id="input-edg-billing-days"
                      style={styles.edgMetaInput}
                      value={customDays}
                      onChangeText={setCustomDays}
                      placeholder={String(derivedDates.daysInMonth)}
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Helpful Instruction Banner */}
                <View style={styles.edgGuideBanner}>
                  <Ionicons name="information-circle" size={15} color={COLORS.import} />
                  <Text style={styles.edgGuideText}>
                    Simply match each section below to the corresponding row printed on your physical or PDF bill.
                  </Text>
                </View>

                {/* ── 1. EXPORT KWH (NET-METERING SOLAR BANK ROW) ── */}
                <View style={styles.edgSection}>
                  <View style={styles.edgSectionHeader}>
                    <Text style={styles.edgSectionTitle}>Export KWH (Net-Metering Solar Bank)</Text>
                    <Text style={styles.edgSectionTag}>Matches solar banking row</Text>
                  </View>

                  <View style={styles.edgBankStrip}>
                    {/* Prev.Balance */}
                    <View style={styles.edgBankItem}>
                      <View style={styles.edgBankLabelRow}>
                        <Text style={styles.edgBankLabel}>Prev.Balance</Text>
                        <Text style={styles.edgBankSub}>Opening Bank</Text>
                      </View>
                      <View style={styles.edgBankInputWrap}>
                        <TextInput
                          id="input-edg-prev-balance"
                          style={styles.edgBankInput}
                          value={openingCredit}
                          onChangeText={setOpeningCredit}
                          placeholder="0"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                        <Text style={styles.edgUnitSmall}>kWh</Text>
                      </View>
                    </View>

                    <Text style={styles.edgMathSign}>+</Text>

                    {/* Curr.Period (Grid Export) */}
                    <View style={styles.edgBankItem}>
                      <View style={styles.edgBankLabelRow}>
                        <Text style={styles.edgBankLabel}>Curr.Period</Text>
                        <Text style={styles.edgBankSub}>KWH_E Export</Text>
                      </View>
                      <View style={styles.edgBankInputWrap}>
                        <TextInput
                          id="input-edg-curr-period"
                          style={styles.edgBankInput}
                          value={exportKwh}
                          onChangeText={setExportKwh}
                          placeholder="0"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                        <Text style={styles.edgUnitSmall}>kWh</Text>
                      </View>
                    </View>

                    <Text style={styles.edgMathSign}>−</Text>

                    {/* Adjusted (Offset) */}
                    <View style={[styles.edgBankItem, styles.edgBankItemComputed]}>
                      <View style={styles.edgBankLabelRow}>
                        <Text style={styles.edgBankLabel}>Adjusted</Text>
                        <Text style={styles.edgBankSub}>Offset Import</Text>
                      </View>
                      <View style={styles.edgBankInputWrap}>
                        <Text style={styles.edgBankStaticText}>
                          {liveCalc.adjustedCreditKwh}
                        </Text>
                        <Text style={styles.edgUnitSmall}>kWh</Text>
                      </View>
                    </View>

                    <Text style={styles.edgMathSign}>=</Text>

                    {/* Carried over (Closing Bank) */}
                    <View style={[styles.edgBankItem, styles.edgBankItemClosing]}>
                      <View style={styles.edgBankLabelRow}>
                        <Text style={[styles.edgBankLabel, { color: COLORS.bank }]}>Carried over</Text>
                        <Text style={styles.edgBankSub}>Next Month</Text>
                      </View>
                      <View style={styles.edgBankInputWrap}>
                        <Text style={[styles.edgBankStaticText, { color: COLORS.bank, fontWeight: FONT.bold }]}>
                          {liveCalc.closingCreditKwh}
                        </Text>
                        <Text style={styles.edgUnitSmall}>kWh</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* ── 2. METER READINGS TABLE ── */}
                <View style={styles.edgSection}>
                  <View style={styles.edgSectionHeader}>
                    <Text style={styles.edgSectionTitle}>Meter Readings Table</Text>
                    <Text style={styles.edgSectionTag}>Matches readings table on bill</Text>
                  </View>

                  <View style={styles.edgTable}>
                    {/* Table Header */}
                    <View style={styles.edgTableHeader}>
                      <Text style={[styles.edgTh, { width: 56 }]}>Unit</Text>
                      <Text style={[styles.edgTh, { flex: 1 }]}>What this means on your bill</Text>
                      <Text style={[styles.edgTh, { width: 120, textAlign: 'center' }]}>Consumption *</Text>
                    </View>

                    {/* Row 1: KWH_I (Grid Import) */}
                    <View style={[styles.edgTableRow, styles.edgTableRowHighlight]}>
                      <View style={{ width: 56 }}>
                        <View style={[styles.edgUnitBadge, { backgroundColor: `${COLORS.import}18`, borderColor: `${COLORS.import}44` }]}>
                          <Text style={[styles.edgUnitBadgeText, { color: COLORS.import }]}>KWH_I</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.edgRowTitle}>Grid Import</Text>
                        <Text style={styles.edgRowSub}>Units drawn from electricity grid</Text>
                      </View>
                      <View style={styles.edgInputCell}>
                        <TextInput
                          id="input-edg-import-kwh"
                          style={[styles.edgTableInput, !importKwh && styles.edgInputPending]}
                          value={importKwh}
                          onChangeText={setImportKwh}
                          placeholder="241"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                        <Text style={styles.edgUnitLabel}>kWh</Text>
                      </View>
                    </View>

                    {/* Row 2: KWH_E (Grid Export) */}
                    <View style={[styles.edgTableRow, styles.edgTableRowHighlight]}>
                      <View style={{ width: 56 }}>
                        <View style={[styles.edgUnitBadge, { backgroundColor: `${COLORS.export}18`, borderColor: `${COLORS.export}44` }]}>
                          <Text style={[styles.edgUnitBadgeText, { color: COLORS.export }]}>KWH_E</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.edgRowTitle}>Grid Export</Text>
                        <Text style={styles.edgRowSub}>Solar power sent into grid</Text>
                      </View>
                      <View style={styles.edgInputCell}>
                        <TextInput
                          id="input-edg-export-kwh"
                          style={[styles.edgTableInput, !exportKwh && styles.edgInputPending]}
                          value={exportKwh}
                          onChangeText={setExportKwh}
                          placeholder="331"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                        <Text style={styles.edgUnitLabel}>kWh</Text>
                      </View>
                    </View>

                    {/* Row 3: KWH_G (Solar Generation) */}
                    <View style={styles.edgTableRow}>
                      <View style={{ width: 56 }}>
                        <View style={[styles.edgUnitBadge, { backgroundColor: `${COLORS.generation}18`, borderColor: `${COLORS.generation}44` }]}>
                          <Text style={[styles.edgUnitBadgeText, { color: COLORS.generation }]}>KWH_G</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.edgRowTitle}>Solar Generation</Text>
                        <Text style={styles.edgRowSub}>Inverter output (Optional)</Text>
                      </View>
                      <View style={styles.edgInputCell}>
                        <TextInput
                          id="input-edg-gen-kwh"
                          style={styles.edgTableInput}
                          value={generationKwh}
                          onChangeText={setGenerationKwh}
                          placeholder="431"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                        <Text style={styles.edgUnitLabel}>kWh</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* ── 3. BILL SUMMARY (AMOUNT PAYABLE) ── */}
                <View style={styles.edgSection}>
                  <View style={styles.edgSectionHeader}>
                    <Text style={styles.edgSectionTitle} numberOfLines={1}>
                      Bill Summary : Note- E-BILL
                    </Text>
                    <Text style={styles.edgSectionTag}>Matches payment box</Text>
                  </View>

                  {/* Summary row matching the official bill table */}
                  <View style={styles.edgSummaryMiniRow}>
                    <View style={styles.edgSummaryMiniCell}>
                      <Text style={styles.edgSummaryMiniLabel}>Arrears (A)</Text>
                      <Text style={styles.edgSummaryMiniVal}>₹ 0.00</Text>
                    </View>
                    <View style={styles.edgSummaryMiniCell}>
                      <Text style={styles.edgSummaryMiniLabel}>Delay Chg (C)</Text>
                      <Text style={styles.edgSummaryMiniVal}>₹ 0.00</Text>
                    </View>
                    <View style={[styles.edgSummaryMiniCell, { borderRightWidth: 0 }]}>
                      <Text style={styles.edgSummaryMiniLabel}>Present (D)</Text>
                      <Text style={styles.edgSummaryMiniVal}>
                        {billAmount ? `₹ ${billAmount}` : '₹ 0.00'}
                      </Text>
                    </View>
                  </View>

                  {/* Main Amount Payable Box (Full-width responsive, no horizontal squeezing) */}
                  <View style={styles.edgPayableCard}>
                    <View style={styles.edgPayableTopRow}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.edgPayableLabel}>
                          Amount Payable on or before due date <Text style={styles.req}>*</Text>
                        </Text>
                        <Text style={styles.edgPayableFormula}>
                          Total Current Demand (A + B + C + D + E)
                        </Text>
                      </View>
                      {dueDate ? (
                        <View style={styles.edgDueBadge}>
                          <Text style={styles.edgDueBadgeText}>Due: {dueDate}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.edgPayableInputRow}>
                      <Text style={styles.edgRupeeSymbol}>₹</Text>
                      <TextInput
                        id="input-edg-bill-amount"
                        style={[styles.edgPayableInput, !billAmount && styles.edgInputPending]}
                        value={billAmount}
                        onChangeText={setBillAmount}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                    </View>

                    <Text style={styles.edgPayableHint}>
                      📍 Look for the large total printed under &quot;Amount Payable on or before due date&quot;
                    </Text>
                  </View>
                </View>

                {/* ── 4. PRESENT BILL CHARGES (OPTIONAL BREAKDOWN) ── */}
                <TouchableOpacity
                  id="btn-toggle-edg-charges"
                  style={styles.edgChargesToggle}
                  onPress={() => setShowDetails(!showDetails)}
                  activeOpacity={0.7}
                >
                  <View style={styles.edgChargesToggleLeft}>
                    <Ionicons name="receipt-outline" size={15} color={COLORS.gold} />
                    <Text style={styles.edgChargesToggleTitle}>
                      Present Bill Charges Breakdown
                    </Text>
                    <Text style={styles.edgOptionalPill}>Optional</Text>
                  </View>
                  <Ionicons
                    name={showDetails ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={COLORS.textSub}
                  />
                </TouchableOpacity>

                {showDetails && (
                  <View style={styles.edgChargesTable}>
                    <View style={styles.edgChargesRow}>
                      <Text style={styles.edgChargesParticular}>Demand / Fixed Charges</Text>
                      <View style={styles.edgChargesInputWrap}>
                        <Text style={styles.edgChargeRupee}>₹</Text>
                        <TextInput
                          id="input-edg-demand-charges"
                          style={styles.edgChargesInput}
                          value={demandCharges}
                          onChangeText={setDemandCharges}
                          placeholder="223.46"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={styles.edgChargesRow}>
                      <Text style={styles.edgChargesParticular}>Fuel & Power Cost Adjustment (FPPCA)</Text>
                      <View style={styles.edgChargesInputWrap}>
                        <Text style={styles.edgChargeRupee}>₹</Text>
                        <TextInput
                          id="input-edg-fppca"
                          style={styles.edgChargesInput}
                          value={fppca}
                          onChangeText={setFppca}
                          placeholder="42.98"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={styles.edgChargesRow}>
                      <Text style={styles.edgChargesParticular}>Advance / Prompt Payment Rebate</Text>
                      <View style={styles.edgChargesInputWrap}>
                        <Text style={styles.edgChargeRupee}>₹</Text>
                        <TextInput
                          id="input-edg-rebate"
                          style={styles.edgChargesInput}
                          value={rebate}
                          onChangeText={setRebate}
                          placeholder="-2.37"
                          placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={[styles.edgChargesRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.edgChargesParticular}>Notes / Remarks</Text>
                      <TextInput
                        id="input-edg-notes"
                        style={styles.edgNotesInput}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Meter remarks, tariff notes…"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  </View>
                )}
              </View>
            ) : (
              /* ══════════════════════════════════════════════════════════
                  MODE B: QUICK CARDS VIEW (COMPACT)
                 ══════════════════════════════════════════════════════════ */
              <View>
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

                {/* ── OPTIONAL DETAILED CHARGES (COLLAPSED) ── */}
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
                      <DateField
                        label="Due Date"
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
                      <DateField
                        label="Custom Start Date"
                        value={customStart}
                        onChange={setCustomStart}
                        placeholder={derivedDates.start}
                        style={{ flex: 1 }}
                      />
                      <DateField
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
              </View>
            )}

            {/* ── 5. LIVE ENERGY ACCOUNTING PREVIEW (SHARED) ── */}
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

            <View style={{ height: SPACING.md }} />
          </ScrollView>

          {/* ── Modal Footer ── */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
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
                <Ionicons name="checkmark-circle" size={28} color={COLORS.textInverse} />
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
    height: '95%',
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
  form: {
    flex: 1,
  },
  formContent: {
    padding: SPACING.lg,
    paddingBottom: 60,
  },

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
    paddingHorizontal: SPACING.md,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: SPACING.xs,
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
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceRaised,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.md,
    ...SHADOW.card,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },

  // ── Mode Switcher ──
  entryModeBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  entryModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  entryModeTabActive: {
    borderColor: COLORS.gold,
    backgroundColor: `${COLORS.gold}12`,
  },
  entryModeTabText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  entryModeTabTextActive: {
    fontWeight: FONT.bold,
    color: '#78350F',
  },
  easyBadge: {
    backgroundColor: `${COLORS.gold}24`,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: RADIUS.full,
  },
  easyBadgeText: {
    fontSize: 9,
    fontWeight: FONT.heavy,
    color: COLORS.goldDim,
  },

  // ── EDG Bill View Container ──
  edgBillContainer: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: RADIUS.lg,
    padding: SPACING.sm + 4,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  cutLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
    opacity: 0.7,
  },
  cutLineDashes: {
    flex: 1,
    height: 1,
    borderWidth: 0.8,
    borderColor: COLORS.textMuted,
    borderStyle: 'dashed',
  },
  cutLineText: {
    fontSize: 9,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  edgHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0F172A',
    marginBottom: SPACING.sm,
  },
  edgHeaderTitles: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  edgGovTitle: {
    fontSize: 12,
    fontWeight: FONT.heavy,
    color: '#0F172A',
    letterSpacing: 0.4,
  },
  edgSubTitle: {
    fontSize: 10,
    color: COLORS.textSub,
    marginTop: 2,
  },
  edgHelplineBadge: {
    borderWidth: 1,
    borderColor: '#0F172A',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  edgHelplineLabel: {
    fontSize: 8,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  edgHelplineNumber: {
    fontSize: 11,
    fontWeight: FONT.heavy,
    color: '#0F172A',
  },

  // Meta Grid
  edgMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  edgMetaCol: {
    flex: 1,
    minWidth: '46%',
  },
  edgMetaLabel: {
    fontSize: 10,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
    marginBottom: 2,
  },
  edgMetaInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },

  // Instruction Banner
  edgGuideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${COLORS.import}12`,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  edgGuideText: {
    fontSize: 11,
    color: COLORS.import,
    fontWeight: FONT.semi,
    flex: 1,
  },

  // Sections
  edgSection: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    backgroundColor: '#FAFCFE',
  },
  edgSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  edgSectionTitle: {
    fontSize: 11,
    fontWeight: FONT.heavy,
    color: '#1E293B',
    letterSpacing: 0.2,
  },
  edgSectionTag: {
    fontSize: 9,
    color: COLORS.goldDim,
    fontWeight: FONT.semi,
  },

  // Bank Strip
  edgBankStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
  },
  edgBankItem: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: RADIUS.sm,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  edgBankItemComputed: {
    backgroundColor: '#F1F5F9',
    borderColor: '#94A3B8',
  },
  edgBankItemClosing: {
    backgroundColor: `${COLORS.bank}12`,
    borderColor: `${COLORS.bank}55`,
  },
  edgBankLabelRow: {
    alignItems: 'center',
    marginBottom: 2,
  },
  edgBankLabel: {
    fontSize: 9,
    fontWeight: FONT.bold,
    color: '#334155',
  },
  edgBankSub: {
    fontSize: 8,
    color: COLORS.textMuted,
  },
  edgBankInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  edgBankInput: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
    textAlign: 'center',
    minWidth: 38,
    paddingVertical: 2,
  },
  edgBankStaticText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
    textAlign: 'center',
    minWidth: 32,
    paddingVertical: 2,
  },
  edgUnitSmall: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: FONT.semi,
  },
  edgMathSign: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
  },

  // Meter Table
  edgTable: {
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  edgTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  edgTh: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: '#F8FAFC',
  },
  edgTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  edgTableRowHighlight: {
    backgroundColor: '#F8FAFD',
  },
  edgUnitBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgUnitBadgeText: {
    fontSize: 10,
    fontWeight: FONT.heavy,
    letterSpacing: 0.3,
  },
  edgRowTitle: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  edgRowSub: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  edgInputCell: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  edgTableInput: {
    width: 86,
    height: 42,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 4,
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  edgInputPending: {
    borderColor: `${COLORS.gold}AA`,
    backgroundColor: '#FFFBEB',
  },
  edgUnitLabel: {
    fontSize: 11,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
    width: 26,
  },

  // ── Bill Summary Mini Row (Matches official bill table) ──
  edgSummaryMiniRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    backgroundColor: '#F8FAFC',
    marginBottom: SPACING.xs + 2,
    overflow: 'hidden',
  },
  edgSummaryMiniCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  edgSummaryMiniLabel: {
    fontSize: 9,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
  },
  edgSummaryMiniVal: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.textSub,
    marginTop: 2,
  },

  // ── Payable Card (Vertical layout: never breaks on narrow screens) ──
  edgPayableCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: `${COLORS.gold}66`,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
  },
  edgPayableTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs + 2,
    gap: 6,
  },
  edgPayableLabel: {
    fontSize: 12,
    fontWeight: FONT.heavy,
    color: '#78350F',
    lineHeight: 16,
  },
  edgPayableFormula: {
    fontSize: 9,
    color: '#92400E',
    marginTop: 2,
  },
  edgDueBadge: {
    backgroundColor: `${COLORS.danger}14`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: `${COLORS.danger}33`,
  },
  edgDueBadgeText: {
    fontSize: 9,
    fontWeight: FONT.bold,
    color: COLORS.danger,
  },
  edgPayableInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    height: 48,
    width: '100%',
  },
  edgRupeeSymbol: {
    fontSize: 20,
    fontWeight: FONT.bold,
    color: COLORS.gold,
    marginRight: 6,
  },
  edgPayableInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  edgPayableHint: {
    fontSize: 9,
    color: '#92400E',
    marginTop: 5,
    fontWeight: FONT.medium,
  },

  // Charges Breakdown
  edgChargesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F8FAFC',
    marginTop: 4,
  },
  edgChargesToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  edgChargesToggleTitle: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  edgOptionalPill: {
    fontSize: 9,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  edgChargesTable: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    marginTop: 6,
  },
  edgChargesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  edgChargesParticular: {
    fontSize: 11,
    color: COLORS.textSub,
    flex: 1,
  },
  edgChargesInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100,
    height: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    backgroundColor: COLORS.surface,
  },
  edgChargeRupee: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginRight: 2,
  },
  edgChargesInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.text,
    textAlign: 'right',
  },
  edgNotesInput: {
    flex: 1,
    fontSize: 11,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORS.surface,
    marginLeft: 8,
  },
});
