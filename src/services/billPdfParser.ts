// ============================================================
// GOA SOLARTRACKER — Goa Electricity Department (EDG) Bill PDF Parser
// Extracts solar net-metering readings and financial details from
// digital EDG electricity bills.
// Resilient exception-safe parser for production mobile usage.
// ============================================================

export interface ParseDiagnostics {
  success: boolean;
  fieldsDetected: number;
  warnings: string[];
  error?: string;
  isPdf: boolean;
  isEncrypted: boolean;
  isScannedOrImageOnly: boolean;
  isGoaElectricityBill: boolean;
  textExtractionLength: number;
}

export interface ParsedBillData {
  consumerNumber?: string;
  billNumber?: string;
  billDate?: string;       // YYYY-MM-DD
  dueDate?: string;        // YYYY-MM-DD
  periodMonth?: number;    // 0-11
  periodYear?: number;
  periodLabel?: string;    // e.g. "August 2026"
  billingDays?: number;
  periodStart?: string;    // YYYY-MM-DD
  periodEnd?: string;      // YYYY-MM-DD

  // Meter readings
  generationKwh?: number | null;
  importKwh?: number;
  exportKwh?: number;
  openingCreditKwh?: number;   // Export KWH Prev.Balance (brought forward from last bill)
  adjustedCreditKwh?: number;  // Export KWH Adjusted (units offset against import)
  closingCreditKwh?: number;   // Export KWH Carried over (carried forward to next bill)

  // Financials
  billAmount?: number;
  demandCharges?: number;
  fppca?: number;
  rebate?: number;
  tariffCategory?: string;

  // Diagnostics & error tracking
  diagnostics?: ParseDiagnostics;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Safely parses a float string, guarding against NaN, Infinity, and null/undefined.
 */
export function safeParseFloat(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  try {
    const cleanStr = String(val).trim().replace(/,/g, '');
    const num = parseFloat(cleanStr);
    if (!Number.isFinite(num) || isNaN(num)) return undefined;
    // Guard against absurdly corrupted data
    if (num < -1e8 || num > 1e9) return undefined;
    return num;
  } catch {
    return undefined;
  }
}

/**
 * Safely formats day, month, year into YYYY-MM-DD.
 * Validates reasonable date limits.
 */
export function safeFormatDate(d: string | number, m: string | number, y: string | number): string | undefined {
  try {
    const day = typeof d === 'number' ? d : parseInt(String(d), 10);
    const month = typeof m === 'number' ? m : parseInt(String(m), 10);
    const year = typeof y === 'number' ? y : parseInt(String(y), 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return undefined;
    if (month < 1 || month > 12) return undefined;
    if (day < 1 || day > 31) return undefined;
    if (year < 1990 || year > 2100) return undefined;

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${year}-${pad(month)}-${pad(day)}`;
  } catch {
    return undefined;
  }
}

/**
 * Decodes a PDF hex string (e.g. "41424344") → "ABCD".
 * EDG electricity bills encode all text as hex rather than parenthesised strings.
 * Protected against odd lengths, invalid hex characters, and corrupted buffers.
 */
export function decodeHexString(hex: string): string {
  if (typeof hex !== 'string' || !hex) return '';
  try {
    // Strip all whitespace and non-hex characters
    let clean = hex.replace(/[^0-9A-Fa-f]/g, '');
    // If length is odd, discard the dangling half-byte
    if (clean.length % 2 !== 0) {
      clean = clean.slice(0, clean.length - 1);
    }
    if (clean.length === 0) return '';

    let out = '';
    for (let i = 0; i < clean.length; i += 2) {
      const code = parseInt(clean.substring(i, i + 2), 16);
      if (!isNaN(code)) {
        // Only keep valid printable ASCII or common whitespace (newline, tab, space)
        if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
          out += String.fromCharCode(code);
        } else {
          out += ' ';
        }
      }
    }
    return out;
  } catch {
    return '';
  }
}

/**
 * Extracts plain text from raw PDF data.
 * Handles:
 *   • Hex-encoded strings:    <48656C6C6F> Tj   (used by EDG/Goa Electricity bills)
 *   • Parenthesised strings:  (Hello World) Tj
 *   • TJ arrays:              [(text) -100 (more)] TJ
 *   • Fallback ASCII recovery
 * Fully guarded with try-catch and loop iteration safety limits.
 */
export function extractTextFromPdfContent(raw: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return '';
  }

  try {
    const textChunks: string[] = [];
    const MAX_CHUNKS = 30000;

    // 1. Hex-encoded strings: <HEX> Tj  (EDG bills use this)
    try {
      const hexTjRegex = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = hexTjRegex.exec(raw)) !== null && count < MAX_CHUNKS) {
        count++;
        if (match[1]) {
          const decoded = decodeHexString(match[1]);
          if (decoded.trim()) textChunks.push(decoded);
        }
      }
    } catch (hexErr) {
      console.warn('[PDF Parser] Hex chunk extraction error:', hexErr);
    }

    // 2. Parenthesised strings: (text) Tj
    try {
      const tjRegex = /\(([^)]+)\)\s*Tj/g;
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = tjRegex.exec(raw)) !== null && count < MAX_CHUNKS) {
        count++;
        if (match[1] && match[1].trim()) {
          textChunks.push(match[1]);
        }
      }
    } catch (tjErr) {
      console.warn('[PDF Parser] Tj string extraction error:', tjErr);
    }

    // 3. TJ arrays: [(text) -100 (more)] TJ or [<HEX> -100 <HEX>] TJ
    try {
      const arrayRegex = /\[([^\]]+)\]\s*TJ/g;
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = arrayRegex.exec(raw)) !== null && count < MAX_CHUNKS) {
        count++;
        const inner = match[1];
        if (!inner) continue;

        // Sub-match parenthesised text
        const parenSub = inner.match(/\(([^)]+)\)/g);
        if (parenSub) {
          textChunks.push(parenSub.map((s) => s.slice(1, -1)).join(' '));
        }

        // Sub-match hex in arrays: <HEX>
        const hexSub = inner.match(/<([0-9A-Fa-f\s]+)>/g);
        if (hexSub) {
          textChunks.push(
            hexSub
              .map((s) => decodeHexString(s.slice(1, -1)))
              .filter(Boolean)
              .join(' ')
          );
        }
      }
    } catch (arrayErr) {
      console.warn('[PDF Parser] TJ array extraction error:', arrayErr);
    }

    if (textChunks.length > 0) {
      return textChunks.join(' ');
    }

    // If it's a PDF with 0 text operators, it has NO selectable text layer (scanned/raster)
    if (raw.includes('%PDF')) {
      return '';
    }

    // 4. Fallback for non-PDF plain text: Strip binary control characters and extract readable printable ASCII
    // Cap raw length at 500k to prevent regex hanging on huge files
    const safeSlice = raw.slice(0, 500000);
    return safeSlice.replace(/[^\x20-\x7E\n\r]/g, ' ');
  } catch (err) {
    console.warn('[PDF Parser] extractTextFromPdfContent unexpected error:', err);
    return '';
  }
}

/**
 * Parses raw text extracted from a Goa Electricity Department (EDG) bill.
 * Individual field extractors are wrapped in independent try-catches
 * so a missing/unusual field never prevents parsing of other fields.
 */
export function parseGoaBillText(text: string): ParsedBillData {
  const warnings: string[] = [];
  const result: ParsedBillData = {};

  if (typeof text !== 'string' || !text.trim()) {
    return {
      diagnostics: {
        success: false,
        fieldsDetected: 0,
        warnings: ['No readable text found in document.'],
        error: 'Empty or unreadable document.',
        isPdf: false,
        isEncrypted: false,
        isScannedOrImageOnly: false,
        isGoaElectricityBill: false,
        textExtractionLength: 0,
      },
    };
  }

  // Normalize all whitespaces to single space for clean regex matching
  const clean = text.replace(/\s+/g, ' ');

  // Detect whether this appears to be a Goa Electricity Department (EDG) bill
  const hasEdgIndicators =
    /Contract Account|KWH_[GIE]|Export KWH|Electricity Department|Goa|1912|LTDS/i.test(clean);

  // ── 1. Consumer Number / Contract Account Number ──
  try {
    const caMatch =
      clean.match(/Contract Account Number\/Bill Number\s*[:\-]?\s*(\d{8,14})/i) ||
      clean.match(/(?:CA No|Contract Account(?: Number)?)\s*[:\-]?\s*(\d{8,14})/i) ||
      clean.match(/Consumer (?:No|Number)\s*[:\-]?\s*(\d{8,14})/i);
    if (caMatch?.[1]) {
      result.consumerNumber = caMatch[1];
    }
  } catch (e) {
    warnings.push(`Consumer Number parse failed: ${e}`);
  }

  // ── 2. Bill Number ──
  try {
    const billNoMatch =
      clean.match(/Contract Account Number\/Bill Number\s*[:\-]?\s*\d+\s*[\/\-]\s*(\d{8,14})/i) ||
      clean.match(/Bill Number\s*[:\-]?\s*(\d{8,14})/i) ||
      clean.match(/Bill No\.?\s*[:\-]?\s*(\d{8,14})/i);
    if (billNoMatch?.[1]) {
      result.billNumber = billNoMatch[1];
    }
  } catch (e) {
    warnings.push(`Bill Number parse failed: ${e}`);
  }

  // ── 3. Bill Date (e.g. 26/08/2026 or 26.08.2026 or 26-08-2026) ──
  // NOTE: We store bill date but do NOT derive periodLabel from it.
  // EDG issues bills up to 6 weeks after the reading date. The period is
  // determined from the KWH meter reading rows (periodEnd) parsed below.
  try {
    const billDateMatch = clean.match(
      /Bill (?:Issue )?Date\s*[:\-]?\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/i
    );
    if (billDateMatch) {
      const formatted = safeFormatDate(billDateMatch[1], billDateMatch[2], billDateMatch[3]);
      if (formatted) {
        result.billDate = formatted;
        // Tentative period label from bill date — will be overridden by KWH row dates below
        const mm = parseInt(billDateMatch[2], 10);
        const yyyy = parseInt(billDateMatch[3], 10);
        const mIdx = mm - 1;
        result.periodMonth = mIdx;
        result.periodYear = yyyy;
        result.periodLabel = `${MONTH_NAMES[mIdx]} ${yyyy}`;
      }
    }
  } catch (e) {
    warnings.push(`Bill Date parse failed: ${e}`);
  }

  // ── 4. Due Date ──
  try {
    const dueDateMatch = clean.match(
      /Due Date\s*[:\-]?\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/i
    );
    if (dueDateMatch) {
      const formatted = safeFormatDate(dueDateMatch[1], dueDateMatch[2], dueDateMatch[3]);
      if (formatted) {
        result.dueDate = formatted;
      }
    }
  } catch (e) {
    warnings.push(`Due Date parse failed: ${e}`);
  }

  // ── 5. Billing Period in Days ──
  try {
    const daysMatch =
      clean.match(/Billing Period in Days\s*[:\-]?\s*(\d{1,3})/i) ||
      clean.match(/Read Period in Days\s*[:\-]?\s*(\d{1,3})/i);
    if (daysMatch?.[1]) {
      const parsedDays = parseInt(daysMatch[1], 10);
      if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 365) {
        result.billingDays = parsedDays;
      }
    }
  } catch (e) {
    warnings.push(`Billing Days parse failed: ${e}`);
  }

  // ── 6. Meter Reading Rows (KWH_G, KWH_I, KWH_E) ──
  // EDG format:
  // GS30005158 KWH_G 01.09.2026 2999 01.08.2026 2488 511 1.00 511 OK
  // GS30016666 KWH_I 01.09.2026 1081 01.08.2026  829 252 1.00 252 OK
  // GS30016666 KWH_E 01.09.2026 1548 01.08.2026 1158 390 1.00 390 OK

  // Extract Solar Generation (KWH_G)
  try {
    const gFullRow = clean.match(
      /KWH_G\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+)\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/i
    );
    if (gFullRow) {
      // Consumption is match[6]
      const val = safeParseFloat(gFullRow[6]);
      if (val !== undefined) result.generationKwh = val;

      // Extract periodStart (prev reading date) and periodEnd (curr reading date).
      // gFullRow[1] = currDate (periodEnd), gFullRow[3] = prevDate (periodStart)
      const pStartParts = gFullRow[3].split(/[\/\.]/); 
      const pEndParts = gFullRow[1].split(/[\/\.]/);
      if (pStartParts.length === 3 && pEndParts.length === 3) {
        const startFormatted = safeFormatDate(pStartParts[0], pStartParts[1], pStartParts[2]);
        const endFormatted = safeFormatDate(pEndParts[0], pEndParts[1], pEndParts[2]);
        if (startFormatted) result.periodStart = startFormatted;
        if (endFormatted) {
          result.periodEnd = endFormatted;
          // ── CRITICAL FIX: Derive period label from reading end date, NOT bill date.
          // EDG bills are issued 4-6 weeks after the meter reading date.
          // e.g. Bill dated Oct 2026 covers the Sep 2026 reading period.
          // The correct period month is the month of the END reading date.
          try {
            const endMm = parseInt(pEndParts[1], 10);
            const endYyyy = parseInt(pEndParts[2], 10);
            if (!isNaN(endMm) && endMm >= 1 && endMm <= 12 && !isNaN(endYyyy)) {
              const mIdx = endMm - 1; // 0-indexed
              result.periodMonth = mIdx;
              result.periodYear = endYyyy;
              result.periodLabel = `${MONTH_NAMES[mIdx]} ${endYyyy}`;
            }
          } catch (_) {}
        }
      }
    } else {
      // Alternate patterns
      const gAlt =
        clean.match(/KWH_G[^\n\r]*?(\d+(?:\.\d+)?)\s+1\.00\s+(\d+(?:\.\d+)?)/i) ||
        clean.match(/KWH_G\s+(?:\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}\s+)?(?:\d+\s+){2,3}(\d+)\s+OK/i) ||
        clean.match(/KWH_G[^\n\r]*?(\d+(?:\.\d+)?)\s+OK/i);
      if (gAlt) {
        const lastCapture = gAlt[gAlt.length - 1];
        const val = safeParseFloat(lastCapture);
        if (val !== undefined) result.generationKwh = val;
      }
    }
  } catch (e) {
    warnings.push(`KWH_G parse failed: ${e}`);
  }

  // Extract Grid Import (KWH_I)
  try {
    const iFullRow = clean.match(
      /KWH_I\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+)\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/i
    );
    if (iFullRow) {
      const val = safeParseFloat(iFullRow[6]);
      if (val !== undefined) result.importKwh = val;

      if (!result.periodStart || !result.periodEnd) {
        const pStartParts = iFullRow[3].split(/[\/\.]/);
        const pEndParts = iFullRow[1].split(/[\/\.]/);
        if (pStartParts.length === 3 && pEndParts.length === 3) {
          result.periodStart = safeFormatDate(pStartParts[0], pStartParts[1], pStartParts[2]);
          result.periodEnd = safeFormatDate(pEndParts[0], pEndParts[1], pEndParts[2]);
        }
      }
    } else {
      const iAlt =
        clean.match(/KWH_I[^\n\r]*?(\d+(?:\.\d+)?)\s+1\.00\s+(\d+(?:\.\d+)?)/i) ||
        clean.match(/KWH_I\s+(?:\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}\s+)?(?:\d+\s+){2,3}(\d+)\s+OK/i) ||
        clean.match(/KWH_I[^\n\r]*?(\d+(?:\.\d+)?)\s+OK/i);
      if (iAlt) {
        const lastCapture = iAlt[iAlt.length - 1];
        const val = safeParseFloat(lastCapture);
        if (val !== undefined) result.importKwh = val;
      }
    }
  } catch (e) {
    warnings.push(`KWH_I parse failed: ${e}`);
  }

  // Extract Grid Export (KWH_E)
  try {
    const eFullRow = clean.match(
      /KWH_E\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+)\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/i
    );
    if (eFullRow) {
      const val = safeParseFloat(eFullRow[6]);
      if (val !== undefined) result.exportKwh = val;
    } else {
      const eAlt =
        clean.match(/KWH_E[^\n\r]*?(\d+(?:\.\d+)?)\s+1\.00\s+(\d+(?:\.\d+)?)/i) ||
        clean.match(/KWH_E\s+(?:\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}\s+)?(?:\d+\s+){2,3}(\d+)\s+OK/i) ||
        clean.match(/KWH_E[^\n\r]*?(\d+(?:\.\d+)?)\s+OK/i);
      if (eAlt) {
        const lastCapture = eAlt[eAlt.length - 1];
        const val = safeParseFloat(lastCapture);
        if (val !== undefined) result.exportKwh = val;
      }
    }
  } catch (e) {
    warnings.push(`KWH_E parse failed: ${e}`);
  }

  // ── 7. Energy Bank — Full bill-stated row ──
  // EDG bill format: "Export KWH Prev.Balance 329- Curr.Period 390 Adjusted 252 Carried over 467-"
  // This is the authoritative source for all energy bank values (bill-first rule).
  try {
    const fullBankMatch = clean.match(
      /Export KWH\s+Prev\.Balance\s+(\d+(?:\.\d+)?)-?\s+Curr\.Period\s+(\d+(?:\.\d+)?)\s+Adjusted\s+(\d+(?:\.\d+)?)\s+Carried over\s+(\d+(?:\.\d+)?)-?/i
    );
    if (fullBankMatch) {
      // All four values are stated on the bill — use them directly (bill-first rule)
      const opening = safeParseFloat(fullBankMatch[1]);
      const adjusted = safeParseFloat(fullBankMatch[3]);
      const closing = safeParseFloat(fullBankMatch[4]);
      if (opening !== undefined) result.openingCreditKwh = opening;
      if (adjusted !== undefined) result.adjustedCreditKwh = adjusted;
      if (closing !== undefined) result.closingCreditKwh = closing;
    } else {
      // Fallback: parse at least opening credit
      const bankMatch =
        clean.match(/Export KWH Prev\.Balance\s+(\d+(?:\.\d+)?)-?/i) ||
        clean.match(/Prev\.Balance\s+(\d+(?:\.\d+)?)-?\s+Curr\.Period/i);
      if (bankMatch?.[1]) {
        const val = safeParseFloat(bankMatch[1]);
        if (val !== undefined) result.openingCreditKwh = val;
      }
    }
  } catch (e) {
    warnings.push(`Energy Bank parse failed: ${e}`);
  }

  // ── 8. Total Bill Amount Payable ──
  try {
    const amountMatch =
      clean.match(/Bill Amount Payable Rs\.?\s*(\d+(?:\.\d+)?)/i) ||
      clean.match(/Amount Payable on or before due date[^\d]*?(\d+\.\d{2})/i) ||
      clean.match(/Present Total Bill\(D\)\s*(\d+(?:\.\d+)?)/i) ||
      clean.match(/Total Current Demand\s*(\d+(?:\.\d+)?)/i);
    if (amountMatch?.[1]) {
      const val = safeParseFloat(amountMatch[1]);
      if (val !== undefined) {
        result.billAmount = val;
      }
    }
  } catch (e) {
    warnings.push(`Bill Amount parse failed: ${e}`);
  }

  // ── 9. Detailed Financial Charges ──
  try {
    const demandMatch =
      clean.match(/Demand\/Fixed Charges\s+(\d+(?:\.\d+)?)/i) ||
      clean.match(/Fixed Charges\s+(\d+(?:\.\d+)?)/i);
    if (demandMatch?.[1]) {
      const val = safeParseFloat(demandMatch[1]);
      if (val !== undefined) result.demandCharges = val;
    }

    const fppcaMatch = clean.match(
      /Fuel and Power Purchase Cost Adjustment\s+(\d+(?:\.\d+)?)/i
    );
    if (fppcaMatch?.[1]) {
      const val = safeParseFloat(fppcaMatch[1]);
      if (val !== undefined) result.fppca = val;
    }

    const rebateMatch = clean.match(
      /Advance\/\s*Prompt Payment Rebate\s+(\d+(?:\.\d+)?)-?/i
    );
    if (rebateMatch?.[1]) {
      const val = safeParseFloat(rebateMatch[1]);
      if (val !== undefined) result.rebate = -Math.abs(val);
    }
  } catch (e) {
    warnings.push(`Detailed charges parse failed: ${e}`);
  }

  // ── 10. Tariff Category ──
  try {
    const tariffMatch =
      clean.match(/Tariff Category\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      clean.match(/Category\s*[:\-]?\s*(LTDS-[A-Z0-9\-]+)/i);
    if (tariffMatch?.[1]) {
      result.tariffCategory = tariffMatch[1].trim();
    }
  } catch (e) {
    warnings.push(`Tariff Category parse failed: ${e}`);
  }

  // ── Count successfully detected fields ──
  let fieldsDetected = 0;
  if (result.consumerNumber) fieldsDetected++;
  if (result.billNumber) fieldsDetected++;
  if (result.billDate) fieldsDetected++;
  if (result.dueDate) fieldsDetected++;
  if (result.billingDays !== undefined) fieldsDetected++;
  if (result.importKwh !== undefined) fieldsDetected++;
  if (result.exportKwh !== undefined) fieldsDetected++;
  if (result.generationKwh !== undefined) fieldsDetected++;
  if (result.openingCreditKwh !== undefined) fieldsDetected++;
  if (result.billAmount !== undefined) fieldsDetected++;
  if (result.demandCharges !== undefined) fieldsDetected++;
  if (result.fppca !== undefined) fieldsDetected++;
  if (result.rebate !== undefined) fieldsDetected++;
  if (result.tariffCategory) fieldsDetected++;

  // Add helpful warnings for missing critical solar fields
  if (result.importKwh === undefined) {
    warnings.push('Grid Import (KWH_I) could not be detected automatically.');
  }
  if (result.exportKwh === undefined) {
    warnings.push('Grid Export (KWH_E) could not be detected automatically.');
  }
  if (result.billAmount === undefined) {
    warnings.push('Bill Amount could not be detected automatically.');
  }

  result.diagnostics = {
    success: fieldsDetected > 0,
    fieldsDetected,
    warnings,
    error:
      fieldsDetected === 0
        ? hasEdgIndicators
          ? 'Identified as an EDG bill, but readings could not be extracted. Please enter manually.'
          : 'Document does not appear to be a recognized Goa Electricity bill.'
        : undefined,
    isPdf: true,
    isEncrypted: false,
    isScannedOrImageOnly: false,
    isGoaElectricityBill: hasEdgIndicators,
    textExtractionLength: clean.length,
  };

  return result;
}

/**
 * High-level master PDF parser for EDG electricity bills.
 * Takes the raw string content of a PDF file, validates PDF structure,
 * extracts text safely, parses all electricity bill fields, and returns
 * structured data with full diagnostic information.
 *
 * Guarantees NEVER to throw an unhandled exception.
 */
export function parseBillPdf(rawPdfContent: string): ParsedBillData {
  try {
    if (typeof rawPdfContent !== 'string' || !rawPdfContent.trim()) {
      return {
        diagnostics: {
          success: false,
          fieldsDetected: 0,
          warnings: ['Empty file content provided.'],
          error: 'File appears to be empty.',
          isPdf: false,
          isEncrypted: false,
          isScannedOrImageOnly: false,
          isGoaElectricityBill: false,
          textExtractionLength: 0,
        },
      };
    }

    const isPdf = rawPdfContent.includes('%PDF');
    const isEncrypted = /\/Encrypt\s+[0-9]+|\/Filter\s*\/Standard/i.test(rawPdfContent);

    if (isEncrypted) {
      return {
        diagnostics: {
          success: false,
          fieldsDetected: 0,
          warnings: ['The PDF file is encrypted / password protected.'],
          error: 'Password-protected PDF. Please remove password protection or enter values manually.',
          isPdf: true,
          isEncrypted: true,
          isScannedOrImageOnly: false,
          isGoaElectricityBill: false,
          textExtractionLength: 0,
        },
      };
    }

    const extractedText = extractTextFromPdfContent(rawPdfContent);

    if (!extractedText || extractedText.trim().length < 20) {
      return {
        diagnostics: {
          success: false,
          fieldsDetected: 0,
          warnings: [
            isPdf
              ? 'No selectable text layer found in PDF. This bill may be a scanned image or photo.'
              : 'File is not a valid text-readable document.',
          ],
          error: isPdf
            ? 'Scanned or image-only PDF detected. Please enter values manually.'
            : 'Unrecognized file format.',
          isPdf,
          isEncrypted: false,
          isScannedOrImageOnly: isPdf,
          isGoaElectricityBill: false,
          textExtractionLength: extractedText?.length || 0,
        },
      };
    }

    const parsed = parseGoaBillText(extractedText);

    // Update diagnostics with top-level metadata
    if (parsed.diagnostics) {
      parsed.diagnostics.isPdf = isPdf;
      parsed.diagnostics.isEncrypted = false;
      parsed.diagnostics.textExtractionLength = extractedText.length;
    }

    return parsed;
  } catch (unexpectedError: any) {
    console.warn('[PDF Parser] Fatal parseBillPdf error caught:', unexpectedError);
    return {
      diagnostics: {
        success: false,
        fieldsDetected: 0,
        warnings: [`Unexpected parsing error: ${unexpectedError?.message || unexpectedError}`],
        error: 'Failed to parse bill PDF due to an unexpected format.',
        isPdf: false,
        isEncrypted: false,
        isScannedOrImageOnly: false,
        isGoaElectricityBill: false,
        textExtractionLength: 0,
      },
    };
  }
}
