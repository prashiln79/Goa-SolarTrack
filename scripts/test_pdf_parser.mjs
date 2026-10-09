// ============================================================
// Comprehensive Test Suite for Goa EDG Bill PDF Parser
// Tests all exception cases, edge cases, and the real user PDF
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the parser functions from TypeScript build or direct import
// Since this is a test script running in node, we implement the import by compiling or
// importing directly. Let's dynamically import the source or test the exact logic.
import {
  parseBillPdf,
  parseGoaBillText,
  extractTextFromPdfContent,
  decodeHexString,
  safeParseFloat,
  safeFormatDate,
} from '../src/services/billPdfParser.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✅ PASS: ${message} (got ${JSON.stringify(actual)})`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

console.log('====================================================');
console.log('🧪 RUNNING GOA BILL PDF PARSER EXCEPTION & UNIT TESTS');
console.log('====================================================\n');

// ────────────────────────────────────────────────────────────
// TEST SUITE 1: Helper Functions & Exception Handling
// ────────────────────────────────────────────────────────────
console.log('▶ Test Suite 1: Helper Exception Handling');

// 1.1 safeParseFloat
assertEqual(safeParseFloat('123.45'), 123.45, 'safeParseFloat valid string');
assertEqual(safeParseFloat('1,234.56'), 1234.56, 'safeParseFloat with commas');
assertEqual(safeParseFloat(null), undefined, 'safeParseFloat handles null');
assertEqual(safeParseFloat(undefined), undefined, 'safeParseFloat handles undefined');
assertEqual(safeParseFloat('not-a-number'), undefined, 'safeParseFloat handles NaN string');
assertEqual(safeParseFloat(Infinity), undefined, 'safeParseFloat handles Infinity');
assertEqual(safeParseFloat(NaN), undefined, 'safeParseFloat handles NaN');
assertEqual(safeParseFloat('1e20'), undefined, 'safeParseFloat rejects absurd magnitude');

// 1.2 safeFormatDate
assertEqual(safeFormatDate('01', '08', '2026'), '2026-08-01', 'safeFormatDate formats valid date');
assertEqual(safeFormatDate(1, 8, 2026), '2026-08-01', 'safeFormatDate formats numbers');
assertEqual(safeFormatDate('32', '08', '2026'), undefined, 'safeFormatDate rejects invalid day 32');
assertEqual(safeFormatDate('01', '13', '2026'), undefined, 'safeFormatDate rejects invalid month 13');
assertEqual(safeFormatDate('01', '08', '1800'), undefined, 'safeFormatDate rejects out-of-range year 1800');
assertEqual(safeFormatDate(null, null, null), undefined, 'safeFormatDate handles null inputs');

// 1.3 decodeHexString
assertEqual(decodeHexString('41424'), 'AB', 'decodeHexString truncates odd length cleanly without crash');
assertEqual(decodeHexString('48656C6C6F'), 'Hello', 'decodeHexString decodes ASCII hex');
assertEqual(decodeHexString('   48 65 6C 6C 6F   '), 'Hello', 'decodeHexString ignores whitespace');
assertEqual(decodeHexString('ZZ!!@@'), '', 'decodeHexString handles invalid non-hex characters');
assertEqual(decodeHexString(''), '', 'decodeHexString handles empty string');
assertEqual(decodeHexString(null), '', 'decodeHexString handles null');

console.log('\n────────────────────────────────────────────────────');

// ────────────────────────────────────────────────────────────
// TEST SUITE 2: extractTextFromPdfContent Exception Safety
// ────────────────────────────────────────────────────────────
console.log('▶ Test Suite 2: Text Extraction Exception Safety');

assertEqual(extractTextFromPdfContent(''), '', 'extractText handles empty string');
assertEqual(extractTextFromPdfContent(null), '', 'extractText handles null');
assertEqual(extractTextFromPdfContent(undefined), '', 'extractText handles undefined');
const mixedExtract = extractTextFromPdfContent('Some text with (Hello) Tj and <576F726C64> Tj');
assert(
  mixedExtract.includes('Hello') && mixedExtract.includes('World'),
  'extractText extracts both paren and hex Tj'
);
assertEqual(
  extractTextFromPdfContent('[(Part1) -100 (Part2)] TJ'),
  'Part1 Part2',
  'extractText extracts array TJ'
);

// Fallback ASCII recovery on raw text without PDF operators
const rawAscii = 'Consumer Number: 60007315413 \x00\x01\x02 Total: Rs. 500';
const extractedFallback = extractTextFromPdfContent(rawAscii);
assert(extractedFallback.includes('60007315413'), 'extractText fallback recovers ASCII content');

console.log('\n────────────────────────────────────────────────────');

// ────────────────────────────────────────────────────────────
// TEST SUITE 3: Bad, Encrypted & Corrupted PDFs
// ────────────────────────────────────────────────────────────
console.log('▶ Test Suite 3: Malformed & Encrypted PDF Handling');

// 3.1 Empty input
const emptyRes = parseBillPdf('');
assert(!emptyRes.diagnostics.success, 'Empty PDF marked unsuccessful');
assert(emptyRes.diagnostics.error.includes('empty'), 'Empty PDF returns friendly error');

// 3.2 Password-protected / Encrypted PDF
const encryptedPdf = '%PDF-1.4\n1 0 obj\n<< /Filter /Standard /Encrypt 2 0 R >>\nendobj';
const encRes = parseBillPdf(encryptedPdf);
assert(encRes.diagnostics.isEncrypted, 'Encrypted PDF detected');
assert(encRes.diagnostics.error.includes('Password-protected'), 'Password error returned');
assert(!encRes.diagnostics.success, 'Encrypted PDF marked unsuccessful');

// 3.3 Scanned / image-only PDF (no text layer)
const scannedPdf = '%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 1000 /Height 1000 >>\nstream\nBINARAYDATA\nendstream\nendobj';
const scannedRes = parseBillPdf(scannedPdf);
assert(scannedRes.diagnostics.isScannedOrImageOnly, 'Scanned image PDF detected');
assert(scannedRes.diagnostics.error.includes('Scanned or image-only'), 'Scanned PDF warning returned');
assert(!scannedRes.diagnostics.success, 'Scanned PDF marked unsuccessful');

// 3.4 Non-PDF random binary garbage
const garbage = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01';
const garbageRes = parseBillPdf(garbage);
assert(!garbageRes.diagnostics.success, 'Binary garbage rejected safely');

console.log('\n────────────────────────────────────────────────────');

// ────────────────────────────────────────────────────────────
// TEST SUITE 4: Partial and Edge Case EDG Bills
// ────────────────────────────────────────────────────────────
console.log('▶ Test Suite 4: Partial Bills & Edge Cases');

// Partial bill with only Consumer No and Bill Amount
const partialText = 'Electricity Department Goa Contract Account Number: 60007315413 Bill Amount Payable Rs. 1420.50';
const partialParsed = parseGoaBillText(partialText);
assertEqual(partialParsed.consumerNumber, '60007315413', 'Partial bill extracts consumer number');
assertEqual(partialParsed.billAmount, 1420.50, 'Partial bill extracts bill amount');
assert(partialParsed.generationKwh === undefined, 'Missing generation kWh is safely undefined');
assert(partialParsed.importKwh === undefined, 'Missing import kWh is safely undefined');
assert(partialParsed.diagnostics.warnings.length > 0, 'Diagnostic warnings generated for missing fields');
assert(partialParsed.diagnostics.success, 'Partial bill is still considered a successful parse');

// Bill with negative energy bank balance notation: "239-"
const negativeBankText = 'Export KWH Prev.Balance 239- Curr.Period 331 Bill Amount Payable Rs. 264.00';
const bankParsed = parseGoaBillText(negativeBankText);
assertEqual(bankParsed.openingCreditKwh, 239, 'Opening credit handles trailing minus notation');
assertEqual(bankParsed.billAmount, 264, 'Bill amount parsed cleanly');

// Rebate with trailing minus
const rebateText = 'Advance/ Prompt Payment Rebate 2.37- Bill Amount Payable Rs. 100';
const rebateParsed = parseGoaBillText(rebateText);
assertEqual(rebateParsed.rebate, -2.37, 'Rebate with trailing minus parses as negative number');

console.log('\n────────────────────────────────────────────────────');

// ────────────────────────────────────────────────────────────
// TEST SUITE 5: Real User Uploaded EDG Bill PDF
// ────────────────────────────────────────────────────────────
console.log('▶ Test Suite 5: Real User EDG Bill PDF (media_1791527270150.pdf)');

const realPdfPath = '/Users/prashilwadkar/.gemini/antigravity-ide/brain/c807c1ae-f561-45b1-8958-d9653d3a2800/.user_uploaded/media_1791527270150.pdf';

if (fs.existsSync(realPdfPath)) {
  const realPdfContent = fs.readFileSync(realPdfPath, 'utf8');
  const realParsed = parseBillPdf(realPdfContent);

  console.log('  Extracted Data Summary:');
  console.log('    • Consumer No:   ', realParsed.consumerNumber);
  console.log('    • Bill No:       ', realParsed.billNumber);
  console.log('    • Bill Date:     ', realParsed.billDate);
  console.log('    • Due Date:      ', realParsed.dueDate);
  console.log('    • Period:        ', realParsed.periodLabel);
  console.log('    • Period Start:  ', realParsed.periodStart);
  console.log('    • Period End:    ', realParsed.periodEnd);
  console.log('    • Billing Days:  ', realParsed.billingDays);
  console.log('    • Solar Gen:     ', realParsed.generationKwh, 'kWh');
  console.log('    • Grid Import:   ', realParsed.importKwh, 'kWh');
  console.log('    • Grid Export:   ', realParsed.exportKwh, 'kWh');
  console.log('    • Opening Credit:', realParsed.openingCreditKwh, 'kWh');
  console.log('    • Bill Amount:   ', '₹' + realParsed.billAmount);
  console.log('    • Fields Count:  ', realParsed.diagnostics?.fieldsDetected);

  // Exact assertions for real user bill
  assertEqual(realParsed.consumerNumber, '60007315413', 'Real Bill: Consumer Number');
  assertEqual(realParsed.billNumber, '17000216006', 'Real Bill: Bill Number');
  assertEqual(realParsed.billDate, '2026-08-26', 'Real Bill: Bill Date (issued Oct 2026)');
  assertEqual(realParsed.dueDate, '2026-09-09', 'Real Bill: Due Date');
  // Period label must be derived from the reading END date (Aug 2026), NOT the bill date (Aug 2026)
  assertEqual(realParsed.periodMonth, 7, 'Real Bill: Period Month index 7 = August (from reading date)');
  assertEqual(realParsed.periodYear, 2026, 'Real Bill: Period Year 2026');
  assertEqual(realParsed.periodLabel, 'August 2026', 'Real Bill: Period Label = August 2026');
  assertEqual(realParsed.billingDays, 31, 'Real Bill: Billing Days');
  assertEqual(realParsed.periodStart, '2026-07-01', 'Real Bill: Period Start Date');
  assertEqual(realParsed.periodEnd, '2026-08-01', 'Real Bill: Period End Date');
  assertEqual(realParsed.generationKwh, 431, 'Real Bill: Generation KWH_G');
  assertEqual(realParsed.importKwh, 241, 'Real Bill: Import KWH_I');
  assertEqual(realParsed.exportKwh, 331, 'Real Bill: Export KWH_E');
  assertEqual(realParsed.openingCreditKwh, 239, 'Real Bill: Opening Credit (Prev.Balance)');
  assertEqual(realParsed.adjustedCreditKwh, 241, 'Real Bill: Adjusted Credit (bill-stated)');
  assertEqual(realParsed.closingCreditKwh, 329, 'Real Bill: Closing Credit = Carried over');
  assertEqual(realParsed.billAmount, 264, 'Real Bill: Payable Bill Amount');
  assert(realParsed.diagnostics.success === true, 'Real Bill: Marked as success');
  assert(realParsed.diagnostics.fieldsDetected >= 10, 'Real Bill: >= 10 fields detected');
  assert(realParsed.diagnostics.isGoaElectricityBill === true, 'Real Bill: Identified as Goa EDG bill');
} else {
  console.warn(`  ⚠️ Real PDF file not found at ${realPdfPath}`);
}

// ────────────────────────────────────────────────────────────
// TEST SUITE 6: All 3 user bills — bank chain + period labels
// ────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────');
console.log('▶ Test Suite 6: All 3 EDG Bills — Bank Chain Verification');

const billFiles = [
  {
    path: '/Users/prashilwadkar/.gemini/antigravity-ide/brain/c807c1ae-f561-45b1-8958-d9653d3a2800/.user_uploaded/media_1791535613910.pdf',
    label: 'July 2026 Bill',
    expectedPeriodLabel: 'July 2026',
    expectedOpening: 123,
    expectedExport: 358,
    expectedAdjusted: 242,
    expectedClosing: 239,
    expectedBillDate: '2026-08-10', // bill date is in Aug, but period is July
  },
  {
    path: '/Users/prashilwadkar/.gemini/antigravity-ide/brain/c807c1ae-f561-45b1-8958-d9653d3a2800/.user_uploaded/media_1791535613948.pdf',
    label: 'August 2026 Bill',
    expectedPeriodLabel: 'August 2026',
    expectedOpening: 239, // = July's closing ✓
    expectedExport: 331,
    expectedAdjusted: 241,
    expectedClosing: 329,
  },
  {
    path: '/Users/prashilwadkar/.gemini/antigravity-ide/brain/c807c1ae-f561-45b1-8958-d9653d3a2800/.user_uploaded/media_1791535613883.pdf',
    label: 'September 2026 Bill',
    expectedPeriodLabel: 'September 2026',
    expectedOpening: 329, // = August's closing ✓
    expectedExport: 390,
    expectedAdjusted: 252,
    expectedClosing: 467,
  },
];

for (const bill of billFiles) {
  if (!fs.existsSync(bill.path)) {
    console.warn(`  ⚠️ File not found: ${bill.path}`);
    continue;
  }
  const content = fs.readFileSync(bill.path, 'utf8');
  const parsed = parseBillPdf(content);

  assertEqual(parsed.periodLabel, bill.expectedPeriodLabel, `${bill.label}: Period Label (must be reading date month, not bill issue date)`);
  assertEqual(parsed.openingCreditKwh, bill.expectedOpening, `${bill.label}: Opening Credit (Prev.Balance)`);
  assertEqual(parsed.exportKwh, bill.expectedExport, `${bill.label}: Export KWH`);
  assertEqual(parsed.adjustedCreditKwh, bill.expectedAdjusted, `${bill.label}: Adjusted Credit (bill-stated)`);
  assertEqual(parsed.closingCreditKwh, bill.expectedClosing, `${bill.label}: Closing Credit (Carried over)`);

  // Formula: Prev.Balance + Curr.Period - Adjusted = Carried over
  const calcClosing = parsed.openingCreditKwh + parsed.exportKwh - parsed.adjustedCreditKwh;
  assert(
    Math.abs(calcClosing - parsed.closingCreditKwh) < 1,
    `${bill.label}: Bank formula OK (${parsed.openingCreditKwh} + ${parsed.exportKwh} - ${parsed.adjustedCreditKwh} = ${calcClosing}, bill says ${parsed.closingCreditKwh})`
  );
}

// Chain verification: each bill's closing = next bill's opening
const julyBill  = parseBillPdf(fs.readFileSync(billFiles[0].path, 'utf8'));
const augBill   = parseBillPdf(fs.readFileSync(billFiles[1].path, 'utf8'));
const sepBill   = parseBillPdf(fs.readFileSync(billFiles[2].path, 'utf8'));
assertEqual(augBill.openingCreditKwh,  julyBill.closingCreditKwh, 'Chain: Aug opening = July closing ✓');
assertEqual(sepBill.openingCreditKwh,  augBill.closingCreditKwh,  'Chain: Sep opening = Aug closing ✓');

console.log('\n====================================================');
console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
