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
  const totalImportKwh = bills.reduce((s, b) => s + (b.importKwh ?? 0), 0);
  const totalExportKwh = bills.reduce((s, b) => s + (b.exportKwh ?? 0), 0);
  const totalDirectUseKwh = bills.reduce((s, b) => s + (b.directSolarUseKwh ?? 0), 0);
  const totalBillsPaid = bills.reduce((s, b) => s + (b.billAmount ?? 0), 0);
  const closingCreditKwh =
    bills.length > 0
      ? bills.reduce((latest, b) => {
          const bTime = new Date(b.periodEnd).getTime();
          const latestTime = new Date(latest.periodEnd).getTime();
          return !isNaN(bTime) && bTime > latestTime ? b : latest;
        }).closingCreditKwh
      : 0;

  // Estimated avoided cost: sum of per-bill savings estimates.
  // Reconstructs bill without solar. If estimatedTotalConsumptionKwh is null
  // (e.g. inverter generation not entered), fall back to grid import plus any direct use.
  const estimatedAvoidedCostInr = bills.reduce((s, b) => {
    const consumptionKwh =
      b.estimatedTotalConsumptionKwh !== null &&
      b.estimatedTotalConsumptionKwh !== undefined &&
      b.estimatedTotalConsumptionKwh > 0
        ? b.estimatedTotalConsumptionKwh
        : (b.directSolarUseKwh ?? 0) + (b.importKwh ?? 0);

    if (consumptionKwh <= 0 && (!b.exportKwh || b.exportKwh <= 0)) return s;

    const { estimatedSavingsInr } = estimateRetailBill(
      consumptionKwh,
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
  // If user provided a systemCostInr, use it. Otherwise use realistic benchmark: ₹55,000 / kW (minimum ₹2,00,000)
  const benchmarkCost = Math.max(200000, Math.round(capacityKw * 55000));
  
  // Normalize system cost:
  // If user entered e.g. 3 or 3.5 (meaning 3 Lakhs), auto-scale <= 100 to Lakhs (* 100,000).
  let systemCostInr: number;
  const rawCost = profile.systemCostInr;
  if (rawCost && rawCost > 0) {
    if (rawCost <= 100) {
      // User entered in Lakhs (e.g. 3 for 3 Lac)
      systemCostInr = Math.round(rawCost * 100000);
    } else {
      systemCostInr = Math.round(rawCost);
    }
  } else {
    systemCostInr = benchmarkCost;
  }
  const isBenchmarkCost = !profile.systemCostInr || profile.systemCostInr <= 0;

  // Monthly average savings calculation
  // Goa benchmark monthly savings (~4.0 kWh/kW/day, ~30.4 days, ~₹4.50/kWh average LTDS-II retail slab)
  const benchmarkMonthlySavings = round2(capacityKw * 4.0 * 30.4 * 4.5);

  let monthlyAverageSavingsInr: number;
  if (bills.length > 0 && annual.estimatedAvoidedCostInr > 0) {
    monthlyAverageSavingsInr = round2(annual.estimatedAvoidedCostInr / bills.length);
  } else {
    monthlyAverageSavingsInr = benchmarkMonthlySavings;
  }

  // Effective monthly savings used for projecting future break-even
  const effectiveMonthlySavings = monthlyAverageSavingsInr > 0 ? monthlyAverageSavingsInr : benchmarkMonthlySavings;
  const annualProjectedSavingsInr = round2(effectiveMonthlySavings * 12);

  // Recovered so far: represents actual avoided electricity costs from logged bills.
  // If no bills are logged yet, recovered amount is 0.
  const recoveredSoFarInr = bills.length > 0
    ? round2(Math.min(systemCostInr * 1.5, Math.max(0, annual.estimatedAvoidedCostInr)))
    : 0;

  const recoveryPct = systemCostInr > 0
    ? Math.min(100, Math.round((recoveredSoFarInr / systemCostInr) * 100))
    : 0;
  const remainingInr = Math.max(0, round2(systemCostInr - recoveredSoFarInr));
  const isFullyRecovered = systemCostInr > 0 && recoveredSoFarInr >= systemCostInr && remainingInr <= 0;

  // Payback duration in total years
  const paybackYearsTotal = annualProjectedSavingsInr > 0
    ? round2(systemCostInr / annualProjectedSavingsInr)
    : 0;

  const remainingMonths = isFullyRecovered
    ? 0
    : effectiveMonthlySavings > 0
      ? Math.ceil(remainingInr / effectiveMonthlySavings)
      : 0;

  // Break-even target calendar date
  let breakEvenDate: string;
  if (isFullyRecovered) {
    breakEvenDate = 'Recovered (Free Electricity!)';
  } else if (remainingMonths > 0) {
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + remainingMonths, 1);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    breakEvenDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
  } else {
    breakEvenDate = 'Target Pending';
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
