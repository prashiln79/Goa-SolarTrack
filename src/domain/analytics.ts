// ============================================================
// GOA SOLARTRACKER — Analytics Domain Service
// PRD §13 — Monthly + Annual analytics from bill history.
// ============================================================

import { SolarBill, MonthlyAnalyticsRow, AnnualAnalytics } from '../types/solar';
import { estimateRetailBill } from './tariffEngine';

/**
 * Builds a monthly analytics row from a bill, optionally with previous month's data.
 * PRD §13.1 — "Only show trend percentages when >= 3 months of data exist."
 */
export function buildMonthlyRow(
  bill: SolarBill,
  previousBill: SolarBill | null,
  totalMonthsAvailable: number,
  systemCapacityKw: number
): MonthlyAnalyticsRow {
  const days = bill.billingDays || 31;
  const gen = bill.generationKwh;

  const avgPerDay = gen !== null ? round2(gen / days) : null;
  // generationPerKwDay used for normalized comparison
  const _genPerKwDay =
    gen !== null && systemCapacityKw > 0
      ? round2(gen / systemCapacityKw / days)
      : null;

  // PRD §8.1 — guard: only show trend if >= 3 months of completed data
  let monthOverMonthChangePct: number | null = null;
  if (
    totalMonthsAvailable >= 3 &&
    gen !== null &&
    previousBill?.generationKwh !== null &&
    previousBill?.generationKwh !== undefined &&
    previousBill.generationKwh > 0
  ) {
    monthOverMonthChangePct = round2(
      ((gen - previousBill.generationKwh) / previousBill.generationKwh) * 100
    );
  }

  return {
    period: bill.period,
    billingDays: days,
    generationKwh: gen,
    avgGenerationPerDay: avgPerDay,
    importKwh: bill.importKwh,
    exportKwh: bill.exportKwh,
    directSolarUseKwh: bill.directSolarUseKwh,
    openingCreditKwh: bill.openingCreditKwh,
    closingCreditKwh: bill.closingCreditKwh,
    billAmount: bill.billAmount,
    monthOverMonthChangePct,
  };
}

/**
 * Builds all monthly rows from bill history.
 * Bills expected in descending order (newest first).
 */
export function buildMonthlyAnalytics(
  bills: SolarBill[],
  systemCapacityKw: number
): MonthlyAnalyticsRow[] {
  const sorted = [...bills].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );

  return sorted.map((bill, idx) => {
    const prevBill = idx > 0 ? sorted[idx - 1] : null;
    return buildMonthlyRow(bill, prevBill, sorted.length, systemCapacityKw);
  });
}

/**
 * Builds annual aggregate analytics.
 * PRD §13.2 — annual report metrics.
 */
export function buildAnnualAnalytics(
  bills: SolarBill[],
  systemCapacityKw: number,
  cleaningEventCount: number
): AnnualAnalytics {
  const totalGenerationKwh = bills.reduce((s, b) => s + (b.generationKwh ?? 0), 0);
  const totalImportKwh = bills.reduce((s, b) => s + b.importKwh, 0);
  const totalExportKwh = bills.reduce((s, b) => s + b.exportKwh, 0);
  const totalDirectUseKwh = bills.reduce((s, b) => s + (b.directSolarUseKwh ?? 0), 0);
  const totalBillsPaid = bills.reduce((s, b) => s + b.billAmount, 0);
  const closingCreditKwh =
    bills.length > 0
      ? bills.reduce((latest, b) =>
          new Date(b.periodEnd) > new Date(latest.periodEnd) ? b : latest
        ).closingCreditKwh
      : 0;

  // Estimated avoided cost: sum of per-bill savings estimates
  const estimatedAvoidedCostInr = bills.reduce((s, b) => {
    if (b.estimatedTotalConsumptionKwh === null) return s;
    const { estimatedSavingsInr } = estimateRetailBill(
      b.estimatedTotalConsumptionKwh,
      b.billAmount,
      systemCapacityKw
    );
    return s + estimatedSavingsInr;
  }, 0);

  return {
    totalGenerationKwh: round2(totalGenerationKwh),
    totalImportKwh: round2(totalImportKwh),
    totalExportKwh: round2(totalExportKwh),
    totalDirectUseKwh: round2(totalDirectUseKwh),
    totalBillsPaid: round2(totalBillsPaid),
    estimatedAvoidedCostInr: round2(estimatedAvoidedCostInr),
    closingCreditKwh,
    cleaningEventCount,
  };
}

// ── Helpers ──────────────────────────────────────────────────
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
