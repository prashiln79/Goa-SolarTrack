// ============================================================
// GOA SOLARTRACKER — Goa Electricity Department (EDG) Bill PDF Parser
// Extracts solar net-metering readings and financial details from
// digital EDG electricity bills.
// Resilient exception-safe parser for production mobile usage.
// ============================================================
import { inflate } from 'pako';

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
 * Determines the billing period month and year based on meter reading dates.
 * In EDG (Goa Electricity Department) bills:
 * A meter reading taken on e.g. 01.09.2026 records consumption from 01.08.2026 to 01.09.2026.
 * The 31 days of generation/import/export occurred during AUGUST.
 * The bill itself is issued weeks later in October.
 * When readings conclude in the first week of a month (day <= 7), the billed period is the START month.
 */
export function deriveBillingPeriod(
  startDay: number,
  startMonth: number, // 1-12
  startYear: number,
  endDay: number,
  endMonth: number,   // 1-12
  endYear: number
): { periodMonth: number; periodYear: number; periodLabel: string } {
  // If both dates fall in the same month
  if (startMonth === endMonth && startYear === endYear) {
    const mIdx = startMonth - 1;
    return {
      periodMonth: mIdx,
      periodYear: startYear,
      periodLabel: `${MONTH_NAMES[mIdx]} ${startYear}`,
    };
  }

  // If reading ends on the 1st through 7th of a month (e.g., 01.09.2026 after 01.08.2026),
  // the meter reader was recording closing units for the prior month.
  // The billed period is the START month (August).
  if (endDay <= 7) {
    const mIdx = startMonth - 1;
    return {
      periodMonth: mIdx,
      periodYear: startYear,
      periodLabel: `${MONTH_NAMES[mIdx]} ${startYear}`,
    };
  }

  // Otherwise calculate which month has the majority of days
  const daysInStartMonth = new Date(startYear, startMonth, 0).getDate();
  const daysInStart = Math.max(1, daysInStartMonth - startDay + 1);
  const daysInEnd = Math.max(1, endDay);

  if (daysInStart >= daysInEnd) {
    const mIdx = startMonth - 1;
    return {
      periodMonth: mIdx,
      periodYear: startYear,
      periodLabel: `${MONTH_NAMES[mIdx]} ${startYear}`,
    };
  } else {
    const mIdx = endMonth - 1;
    return {
      periodMonth: mIdx,
      periodYear: endYear,
      periodLabel: `${MONTH_NAMES[mIdx]} ${endYear}`,
    };
  }
}

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
 *   • Decompression of FlateDecode zlib streams with pako
 *   • Translation of ToUnicode CMaps (supporting Microsoft Print To PDF & web portals)
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

    // ── A. Parse all CMaps (ToUnicode mappings) in the PDF ──
    const masterCMap: Record<number, string> = {};
    try {
      const cmapBlocks = raw.split('begincmap');
      for (let i = 1; i < cmapBlocks.length; i++) {
        const endIdx = cmapBlocks[i].indexOf('endcmap');
        if (endIdx !== -1) {
          const block = cmapBlocks[i].slice(0, endIdx);
          // Parse bfchar entries: <0033> <0050>
          const bfcharMatch = block.match(/beginbfchar([\s\S]*?)endbfchar/);
          if (bfcharMatch) {
            const pairs = bfcharMatch[1].match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
            if (pairs) {
              for (const p of pairs) {
                const parts = p.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
                if (parts) {
                  masterCMap[parseInt(parts[1], 16)] = String.fromCharCode(parseInt(parts[2], 16));
                }
              }
            }
          }
          // Parse bfrange entries: <0000> <0005> <0020>
          const bfrangeMatch = block.match(/beginbfrange([\s\S]*?)endbfrange/);
          if (bfrangeMatch) {
            const triples = bfrangeMatch[1].match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
            if (triples) {
              for (const tr of triples) {
                const parts = tr.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
                if (parts) {
                  const start = parseInt(parts[1], 16);
                  const end = parseInt(parts[2], 16);
                  let to = parseInt(parts[3], 16);
                  for (let c = start; c <= end; c++) {
                    masterCMap[c] = String.fromCharCode(to++);
                  }
                }
              }
            }
          }
        }
      }
    } catch (cmapErr) {
      console.warn('[PDF Parser] CMap parse error:', cmapErr);
    }

    // ── B. FlateDecode / Decompressed Content Streams ──
    try {
      const streamRegex = /<<([^>]*)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let sm: RegExpExecArray | null;
      let streamCount = 0;
      while ((sm = streamRegex.exec(raw)) !== null && streamCount < 60) {
        streamCount++;
        const dict = sm[1];
        const rawStream = sm[2];
        // Skip images and font files
        if (dict.includes('/Image') || dict.includes('/Length1')) continue;

        let decompressedStr = '';
        if (dict.includes('/FlateDecode')) {
          try {
            const u8 = new Uint8Array(rawStream.length);
            for (let i = 0; i < rawStream.length; i++) u8[i] = rawStream.charCodeAt(i);
            const inflated = inflate(u8);
            let s = '';
            for (let i = 0; i < inflated.length; i++) s += String.fromCharCode(inflated[i]);
            decompressedStr = s;
          } catch {}
        } else {
          decompressedStr = rawStream;
        }

        if (!decompressedStr || !decompressedStr.includes('BT')) continue;

        const lines = decompressedStr.split(/\r?\n/);
        for (const line of lines) {
          // TJ array: [<0026>-100<0044>] TJ or [(text) -100 (more)] TJ
          const tjMatch = line.match(/\[(.*?)\]\s*TJ/);
          if (tjMatch) {
            const inner = tjMatch[1];
            const tokenRegex = /<([0-9A-Fa-f]+)>|\(([^)]*)\)|(-?\d+(?:\.\d+)?)/g;
            let t: RegExpExecArray | null;
            let word = '';
            while ((t = tokenRegex.exec(inner)) !== null) {
              if (t[1]) {
                const hex = t[1];
                for (let i = 0; i < hex.length; i += 4) {
                  const code = parseInt(hex.slice(i, i + 4), 16);
                  word += masterCMap[code] !== undefined
                    ? masterCMap[code]
                    : (code >= 32 && code <= 126 ? String.fromCharCode(code) : '');
                }
              } else if (t[2]) {
                word += t[2];
              } else if (t[3]) {
                if (parseFloat(t[3]) < -100) word += ' ';
              }
            }
            if (word.trim()) textChunks.push(word);
          }

          // Single Tj operator
          const singleTj = line.match(/(?:<([0-9A-Fa-f]+)>|\(([^)]*)\))\s*Tj/);
          if (singleTj) {
            if (singleTj[1]) {
              const hex = singleTj[1];
              let word = '';
              for (let i = 0; i < hex.length; i += 4) {
                const code = parseInt(hex.slice(i, i + 4), 16);
                word += masterCMap[code] !== undefined
                  ? masterCMap[code]
                  : (code >= 32 && code <= 126 ? String.fromCharCode(code) : '');
              }
              if (word.trim()) textChunks.push(word);
            } else if (singleTj[2] && singleTj[2].trim()) {
              textChunks.push(singleTj[2]);
            }
          }
        }
      }
    } catch (decompErr) {
      console.warn('[PDF Parser] Stream decompression error:', decompErr);
    }

    // ── C. Uncompressed hex <HEX> Tj and (text) Tj fallback/addition ──
    if (textChunks.length === 0) {
      // 1. Hex-encoded strings: <HEX> Tj (EDG bills use this)
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
          const hexSub = inner.match(/<([0-9A-Fa-f]+)>/g);
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
          // ── Derive accurate billing period from reading dates (start & end)
          // e.g. 01.08.2026 to 01.09.2026 = August 2026 billing period (31 days).
          try {
            const startDd = parseInt(pStartParts[0], 10);
            const startMm = parseInt(pStartParts[1], 10);
            const startYyyy = parseInt(pStartParts[2], 10);
            const endDd = parseInt(pEndParts[0], 10);
            const endMm = parseInt(pEndParts[1], 10);
            const endYyyy = parseInt(pEndParts[2], 10);

            if (!isNaN(startMm) && !isNaN(endMm) && !isNaN(startYyyy) && !isNaN(endYyyy)) {
              const derived = deriveBillingPeriod(startDd, startMm, startYyyy, endDd, endMm, endYyyy);
              result.periodMonth = derived.periodMonth;
              result.periodYear = derived.periodYear;
              result.periodLabel = derived.periodLabel;
            }
          } catch {}
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

  // Extract Grid Import (KWH_I or domestic KWH)
  try {
    const iFullRow = clean.match(
      /(?:KWH_I|(?<!Export\s)\bKWH)\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+(?:\.\d+)?)\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/i
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

          try {
            const startDd = parseInt(pStartParts[0], 10);
            const startMm = parseInt(pStartParts[1], 10);
            const startYyyy = parseInt(pStartParts[2], 10);
            const endDd = parseInt(pEndParts[0], 10);
            const endMm = parseInt(pEndParts[1], 10);
            const endYyyy = parseInt(pEndParts[2], 10);

            if (!isNaN(startMm) && !isNaN(endMm) && !isNaN(startYyyy) && !isNaN(endYyyy)) {
              const derived = deriveBillingPeriod(startDd, startMm, startYyyy, endDd, endMm, endYyyy);
              result.periodMonth = derived.periodMonth;
              result.periodYear = derived.periodYear;
              result.periodLabel = derived.periodLabel;
            }
          } catch {}
        }
      }
    } else {
      const iAlt =
        clean.match(/(?:KWH_I|(?<!Export\s)\bKWH)[^\n\r]*?(\d+(?:\.\d+)?)\s+1\.00\s+(\d+(?:\.\d+)?)/i) ||
        clean.match(/(?:KWH_I|(?<!Export\s)\bKWH)\s+(?:\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}\s+)?(?:\d+(?:\.\d+)?\s+){2,3}(\d+(?:\.\d+)?)\s+OK/i) ||
        clean.match(/(?:KWH_I|(?<!Export\s)\bKWH)[^\n\r]*?(\d+(?:\.\d+)?)\s+OK/i);
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
      /KWH_E\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+(?:\.\d+)?)\s+(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/i
    );
    if (eFullRow) {
      const val = safeParseFloat(eFullRow[6]);
      if (val !== undefined) result.exportKwh = val;
    } else {
      const eAlt =
        clean.match(/KWH_E[^\n\r]*?(\d+(?:\.\d+)?)\s+1\.00\s+(\d+(?:\.\d+)?)/i) ||
        clean.match(/KWH_E\s+(?:\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}\s+)?(?:\d+(?:\.\d+)?\s+){2,3}(\d+(?:\.\d+)?)\s+OK/i) ||
        clean.match(/KWH_E[^\n\r]*?(\d+(?:\.\d+)?)\s+OK/i);
      if (eAlt) {
        const lastCapture = eAlt[eAlt.length - 1];
        const val = safeParseFloat(lastCapture);
        if (val !== undefined) result.exportKwh = val;
      } else if (
        /Export KWH\s+Prev\.Balance\s+Curr\.Period\s+Adjusted\s+0/i.test(clean) ||
        /Export KWH[^\d]*?Adjusted\s+0/i.test(clean) ||
        /Export KWH\s+Prev\.Balance\s+0/i.test(clean)
      ) {
        result.exportKwh = 0;
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
      } else if (
        /Export KWH\s+Prev\.Balance\s+Curr\.Period\s+Adjusted\s+0/i.test(clean) ||
        /Export KWH[^\n\r]*?Adjusted\s+0/i.test(clean)
      ) {
        result.openingCreditKwh = 0;
        result.adjustedCreditKwh = 0;
        result.closingCreditKwh = 0;
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
      clean.match(/Fixed Charges\s+(\d+(?:\.\d+)?)/i) ||
      clean.match(/(\d+(?:\.\d+)?)\s+Demand\/Fixed Charges/i) ||
      clean.match(/(\d+(?:\.\d+)?)\s+(?:Demand\/)?Fixed Charges/i);
    if (demandMatch?.[1]) {
      const val = safeParseFloat(demandMatch[1]);
      if (val !== undefined) result.demandCharges = val;
    }

    const fppcaMatch =
      clean.match(/(\d+(?:\.\d+)?)\s+Fuel and Power Purchase Cost Adjustment/i) ||
      clean.match(/Fuel and Power Purchase Cost Adjustment\s*[:\-]?\s*(\d+(?:\.\d+)?)(?!\s*Energy)/i) ||
      clean.match(/FPPCA\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
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
