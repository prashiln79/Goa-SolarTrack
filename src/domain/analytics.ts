// ============================================================
// GOA SOLARTRACKER — Analytics Domain Service
// PRD §13 — Monthly + Annual analytics from bill history.
// ============================================================

import { SolarBill, MonthlyAnalyticsRow, AnnualAnalytics, SystemProfile, PaybackAnalysis } from '../types/solar';
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
      systemCapacityKw,
      undefined,
      {
        actualDemandCharges: b.demandCharges,
        fppca: b.fppca,
      }
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

/**
 * Calculates solar system investment recovery (payback period),
 * break-even target date, and free-of-charge electricity milestone.
 */
export function calculatePaybackAnalysis(
  bills: SolarBill[],
  profile: SystemProfile,
  annual: AnnualAnalytics
): PaybackAnalysis {
  const capacityKw = profile.capacityKw && profile.capacityKw > 0 ? profile.capacityKw : 5.0;
  // If user provided a systemCostInr, use it. Otherwise use realistic benchmark: ₹55,000 / kW
  const benchmarkCost = Math.round(capacityKw * 55000);
  const isBenchmarkCost = !profile.systemCostInr || profile.systemCostInr <= 0;
  const systemCostInr = profile.systemCostInr && profile.systemCostInr > 0 ? profile.systemCostInr : benchmarkCost;

  // Monthly average savings calculation
  const billsWithSavings = bills.filter(b => b.estimatedTotalConsumptionKwh !== null);
  let monthlyAverageSavingsInr: number;

  if (billsWithSavings.length > 0 && annual.estimatedAvoidedCostInr > 0) {
    monthlyAverageSavingsInr = round2(annual.estimatedAvoidedCostInr / billsWithSavings.length);
  } else {
    // Goa solar benchmark: ~4.0 kWh / kW / day, ~30.4 days, retail tariff ~₹4.50/kWh
    monthlyAverageSavingsInr = round2(capacityKw * 4.0 * 30.4 * 4.5);
  }

  const annualProjectedSavingsInr = round2(monthlyAverageSavingsInr * 12);

  // Time elapsed since installation
  let installDate: Date;
  try {
    installDate = profile.installationDate ? new Date(profile.installationDate) : new Date();
    if (isNaN(installDate.getTime())) installDate = new Date();
  } catch {
    installDate = new Date();
  }

  const now = new Date();
  const monthsSinceInstall = Math.max(
    1,
    (now.getFullYear() - installDate.getFullYear()) * 12 + (now.getMonth() - installDate.getMonth())
  );

  // Recovered so far: use actual avoided cost from bills or projected elapsed savings
  const recoveredSoFarInr = round2(
    Math.min(
      systemCostInr * 1.5,
      Math.max(annual.estimatedAvoidedCostInr, monthlyAverageSavingsInr * monthsSinceInstall)
    )
  );

  const recoveryPct = Math.min(100, Math.round((recoveredSoFarInr / systemCostInr) * 100));
  const remainingInr = Math.max(0, round2(systemCostInr - recoveredSoFarInr));
  const isFullyRecovered = remainingInr <= 0;

  // Payback duration
  const paybackYearsTotal = annualProjectedSavingsInr > 0
    ? round2(systemCostInr / annualProjectedSavingsInr)
    : 0;

  const remainingMonths = isFullyRecovered
    ? 0
    : monthlyAverageSavingsInr > 0
      ? Math.ceil(remainingInr / monthlyAverageSavingsInr)
      : 0;

  // Break-even target calendar date
  let breakEvenDate: string;
  if (isFullyRecovered) {
    breakEvenDate = 'Recovered (Free Electricity!)';
  } else {
    const targetDate = new Date(now.getFullYear(), now.getMonth() + remainingMonths, 1);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    breakEvenDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
  }

  // Formatted remaining time
  let yearsRemainingFormatted: string;
  if (isFullyRecovered) {
    yearsRemainingFormatted = '100% Free of Charge';
  } else {
    const yLeft = Math.floor(remainingMonths / 12);
    const mLeft = remainingMonths % 12;
    if (yLeft > 0 && mLeft > 0) {
      yearsRemainingFormatted = `${yLeft} yr${yLeft > 1 ? 's' : ''} ${mLeft} mo${mLeft !== 1 ? 's' : ''}`;
    } else if (yLeft > 0) {
      yearsRemainingFormatted = `${yLeft} year${yLeft > 1 ? 's' : ''}`;
    } else {
      yearsRemainingFormatted = `${mLeft} month${mLeft !== 1 ? 's' : ''}`;
    }
  }

  // 25-year panel lifetime net profit (25 years of savings - capital cost)
  const estimated25YearNetProfitInr = round2(
    Math.max(0, (annualProjectedSavingsInr * 25) - systemCostInr)
  );

  return {
    systemCostInr,
    isBenchmarkCost,
    monthlyAverageSavingsInr,
    annualProjectedSavingsInr,
    recoveredSoFarInr,
    recoveryPct,
    remainingInr,
    paybackYearsTotal,
    remainingMonths,
    breakEvenDate,
    isFullyRecovered,
    yearsRemainingFormatted,
    estimated25YearNetProfitInr,
  };
}
