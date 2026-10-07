// ============================================================
// GOA SOLARTRACKER — Energy Accounting Domain Service
// PRD §6 — Pure TypeScript, fully testable, no UI dependencies.
// Canonical formulas from JERC 2019 net-metering regulations.
// ============================================================

import { SolarBill, EnergyLedgerEntry } from '../types/solar';

// ── Input / Output Types ────────────────────────────────────

export interface EnergyAccountingInput {
  generationKwh: number | null;
  importKwh: number;
  exportKwh: number;
  openingCreditKwh: number;
}

export interface EnergyAccountingResult {
  availableCreditKwh: number;
  adjustedCreditKwh: number;
  netBilledImportKwh: number;
  closingCreditKwh: number;
  directSolarUseKwh: number | null;         // null when generationKwh is null
  estimatedTotalConsumptionKwh: number | null;
}

export interface MismatchResult {
  adjustedMismatch: boolean;
  closingMismatch: boolean;
  needsReview: boolean;
}

// ── PRD §6.1 Canonical Formulas ─────────────────────────────

/**
 * Pure domain function implementing JERC 2019 net-metering arithmetic.
 * This function is the single source of truth for all energy accounting.
 *
 * PRD §14.2: "Create a single source of truth for energy calculations
 * in a pure TypeScript service/module with exhaustive tests."
 */
export function calculateEnergyAccounting(
  input: EnergyAccountingInput
): EnergyAccountingResult {
  const gen = input.generationKwh !== null ? Math.max(0, Number(input.generationKwh) || 0) : null;
  const imp = Math.max(0, Number(input.importKwh) || 0);
  const exp = Math.max(0, Number(input.exportKwh) || 0);
  const opening = Math.max(0, Number(input.openingCreditKwh) || 0);

  // availableCredit = openingCreditKwh + currentExportKwh
  const availableCreditKwh = round2(opening + exp);

  // adjustedKwh = min(importKwh, availableCredit)
  const adjustedCreditKwh = round2(Math.min(imp, availableCreditKwh));

  // netBilledImportKwh = max(0, importKwh - adjustedKwh)
  const netBilledImportKwh = round2(Math.max(0, imp - adjustedCreditKwh));

  // closingCreditKwh = max(0, availableCredit - importKwh)
  const closingCreditKwh = round2(Math.max(0, availableCreditKwh - imp));

  // directSolarUseKwh = max(0, generationKwh - exportKwh)   [estimate]
  const directSolarUseKwh = gen !== null ? round2(Math.max(0, gen - exp)) : null;

  // estimatedTotalConsumptionKwh = directSolarUseKwh + importKwh
  const estimatedTotalConsumptionKwh =
    directSolarUseKwh !== null ? round2(directSolarUseKwh + imp) : null;

  return {
    availableCreditKwh,
    adjustedCreditKwh,
    netBilledImportKwh,
    closingCreditKwh,
    directSolarUseKwh,
    estimatedTotalConsumptionKwh,
  };
}

/**
 * PRD §6.1 Bill-first rule: compare bill-stated values against calculated.
 * Flags mismatch records; does NOT overwrite bill values.
 */
export function detectMismatches(
  calculated: EnergyAccountingResult,
  billAdjusted?: number,
  billClosing?: number
): MismatchResult {
  const TOLERANCE = 1; // 1 kWh rounding tolerance
  const adjustedMismatch =
    billAdjusted !== undefined &&
    Math.abs(billAdjusted - calculated.adjustedCreditKwh) > TOLERANCE;
  const closingMismatch =
    billClosing !== undefined &&
    Math.abs(billClosing - calculated.closingCreditKwh) > TOLERANCE;

  return {
    adjustedMismatch,
    closingMismatch,
    needsReview: adjustedMismatch || closingMismatch,
  };
}

/**
 * Build an EnergyLedgerEntry from a confirmed SolarBill.
 */
export function buildLedgerEntry(bill: SolarBill): EnergyLedgerEntry {
  return {
    id: `ledger-${bill.id}`,
    sourceBillId: bill.id,
    period: bill.period,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    openingCreditKwh: bill.openingCreditKwh,
    exportKwh: bill.exportKwh,
    importKwh: bill.importKwh,
    adjustedCreditKwh: bill.adjustedCreditKwh,
    closingCreditKwh: bill.closingCreditKwh,
    generationKwh: bill.generationKwh,
    directSolarUseKwh: bill.directSolarUseKwh,
    estimatedTotalConsumptionKwh: bill.estimatedTotalConsumptionKwh,
    createdAt: Date.now(),
  };
}

// ── PRD §8.1 Monthly Performance Metrics ────────────────────

export interface MonthlyPerformanceMetrics {
  averageGenerationPerDay: number | null;
  generationPerKwDay: number | null;
  monthOverMonthChangePct: number | null;
}

export function calculateMonthlyPerformance(
  generationKwh: number | null,
  billingDays: number,
  systemCapacityKw: number,
  previousGenerationKwh?: number | null
): MonthlyPerformanceMetrics {
  if (generationKwh === null || billingDays <= 0) {
    return {
      averageGenerationPerDay: null,
      generationPerKwDay: null,
      monthOverMonthChangePct: null,
    };
  }

  const averageGenerationPerDay = round2(generationKwh / billingDays);
  const generationPerKwDay =
    systemCapacityKw > 0
      ? round2(generationKwh / systemCapacityKw / billingDays)
      : null;

  let monthOverMonthChangePct: number | null = null;
  if (previousGenerationKwh !== undefined && previousGenerationKwh !== null && previousGenerationKwh > 0) {
    monthOverMonthChangePct = round2(
      ((generationKwh - previousGenerationKwh) / previousGenerationKwh) * 100
    );
  }

  return {
    averageGenerationPerDay,
    generationPerKwDay,
    monthOverMonthChangePct,
  };
}

// ── PRD §6.2 Canonical August 2026 Test Fixture ─────────────

export const CANONICAL_AUGUST_2026_BILL: SolarBill = {
  id: 'canonical-2026-08',
  period: 'August 2026',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  billingDays: 31,
  tariffCategory: 'LTDS-II-SOLAR',
  generationKwh: 431,
  importKwh: 241,
  exportKwh: 331,
  openingCreditKwh: 239,
  availableCreditKwh: 570,   // 239 + 331
  adjustedCreditKwh: 241,   // min(241, 570)
  netBilledImportKwh: 0,    // max(0, 241 - 241)
  closingCreditKwh: 329,    // max(0, 570 - 241)
  directSolarUseKwh: 100,   // max(0, 431 - 331)
  estimatedTotalConsumptionKwh: 341, // 100 + 241
  billAmount: 264.00,
  billNumber: '17000216006',
  dueDate: '2026-09-09',
  demandCharges: 223.46,
  fppca: 42.98,
  rebate: -2.37,
  otherCharges: 0.00,
  source: 'canonical_fixture',
  parserVersion: 'goa-bill-parser-v1',
  calculationVersion: 'v1.0',
  createdAt: Date.now(),
};

/**
 * Verifies canonical test fixture expectations.
 * PRD §15.2 — must all pass before ship.
 */
export function runCanonicalVerification(): {
  passed: boolean;
  failures: string[];
} {
  const input: EnergyAccountingInput = {
    generationKwh: 431,
    importKwh: 241,
    exportKwh: 331,
    openingCreditKwh: 239,
  };
  const result = calculateEnergyAccounting(input);
  const failures: string[] = [];

  if (result.adjustedCreditKwh !== 241)
    failures.push(`adjustedCredit: expected 241, got ${result.adjustedCreditKwh}`);
  if (result.closingCreditKwh !== 329)
    failures.push(`closingCredit: expected 329, got ${result.closingCreditKwh}`);
  if (result.directSolarUseKwh !== 100)
    failures.push(`directSolarUse: expected 100, got ${result.directSolarUseKwh}`);
  if (result.estimatedTotalConsumptionKwh !== 341)
    failures.push(`estimatedTotal: expected 341, got ${result.estimatedTotalConsumptionKwh}`);

  // PRD §15.3 Edge cases
  const edge1 = calculateEnergyAccounting({ generationKwh: null, importKwh: 500, exportKwh: 100, openingCreditKwh: 200 });
  if (edge1.adjustedCreditKwh !== 300) failures.push(`edge1 adjusted: expected 300, got ${edge1.adjustedCreditKwh}`);
  if (edge1.netBilledImportKwh !== 200) failures.push(`edge1 netBilled: expected 200, got ${edge1.netBilledImportKwh}`);
  if (edge1.closingCreditKwh !== 0) failures.push(`edge1 closing: expected 0, got ${edge1.closingCreditKwh}`);

  const edge2 = calculateEnergyAccounting({ generationKwh: null, importKwh: 0, exportKwh: 250, openingCreditKwh: 100 });
  if (edge2.closingCreditKwh !== 350) failures.push(`edge2 closing: expected 350, got ${edge2.closingCreditKwh}`);

  const edge3 = calculateEnergyAccounting({ generationKwh: null, importKwh: 200, exportKwh: 50, openingCreditKwh: 0 });
  if (edge3.adjustedCreditKwh !== 50) failures.push(`edge3 adjusted: expected 50, got ${edge3.adjustedCreditKwh}`);
  if (edge3.netBilledImportKwh !== 150) failures.push(`edge3 netBilled: expected 150, got ${edge3.netBilledImportKwh}`);

  return { passed: failures.length === 0, failures };
}

// ── Helpers ──────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
