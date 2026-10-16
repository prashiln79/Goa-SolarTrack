// ============================================================
// GOA SOLARTRACKER — Intelligent Bill & Solar Generation Analysis
// Compares latest bill & solar performance against history & benchmarks
// ============================================================

import { SolarBill, SystemProfile, CareAssessment } from '../types/solar';

export type BillHealthStatus = 'lower' | 'normal' | 'higher' | 'insufficient_data';
export type SolarHealthStatus = 'good' | 'normal' | 'lower' | 'insufficient_data';

export interface IntelligentBillAnalysis {
  status: BillHealthStatus;
  statusLabel: string;
  currentAmount: number;
  previousAmount: number | null;
  amountDiff: number | null;
  amountChangePct: number | null;
  currentConsumptionKwh: number;
  previousConsumptionKwh: number | null;
  consumptionDiffKwh: number | null;
  consumptionChangePct: number | null;
  currentDailyConsumptionKwh: number;
  previousDailyConsumptionKwh: number | null;
  summary: string;
  explanation: string;
  highlights: string[];
}

export interface IntelligentSolarAnalysis {
  status: SolarHealthStatus;
  statusLabel: string;
  currentGenerationKwh: number | null;
  previousGenerationKwh: number | null;
  generationDiffKwh: number | null;
  generationChangePct: number | null;
  currentDailyGenKwh: number | null;
  previousDailyGenKwh: number | null;
  currentYieldKwhPerKwDay: number | null;
  benchmarkYieldKwhPerKwDay: number;
  season: 'monsoon' | 'sunny';
  summary: string;
  explanation: string;
  diagnosticAdvice: string[];
}

export interface IntelligentActionCheck {
  actionRequired: boolean;
  severity: 'info' | 'warning' | 'success';
  title: string;
  recommendation: string;
  actionType: 'cleaning' | 'consumption' | 'inverter' | 'none';
}

export interface IntelligentAnalysisResult {
  hasBills: boolean;
  hasComparison: boolean;
  comparisonPeriod: string;
  billAnalysis: IntelligentBillAnalysis;
  solarAnalysis: IntelligentSolarAnalysis;
  actionCheck: IntelligentActionCheck;
  threeQuestions: {
    billAnswer: string;
    solarAnswer: string;
    actionAnswer: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function isGoaMonsoon(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const m = d.getMonth(); // 0-indexed: 5=June, 6=July, 7=August, 8=September
  return m >= 5 && m <= 8;
}

/**
 * Calculates total consumption in kWh for a bill.
 * Total home consumption = Direct solar used + Grid import.
 */
function getBillConsumption(bill: SolarBill): number {
  if (
    bill.estimatedTotalConsumptionKwh !== null &&
    bill.estimatedTotalConsumptionKwh !== undefined &&
    bill.estimatedTotalConsumptionKwh > 0
  ) {
    return bill.estimatedTotalConsumptionKwh;
  }
  const direct = bill.directSolarUseKwh ?? 0;
  const imp = bill.importKwh ?? 0;
  return direct + imp;
}

/**
 * Evaluates intelligent bill & solar generation analysis.
 */
export function analyzeIntelligentPerformance(
  bills: SolarBill[],
  profile: SystemProfile,
  careAssessment?: CareAssessment
): IntelligentAnalysisResult {
  if (!bills || bills.length === 0) {
    return createEmptyAnalysis();
  }

  // Sort bills chronologically (oldest to newest)
  const sorted = [...bills].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );

  const latestBill = sorted[sorted.length - 1];
  const prevBill = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const capacityKw = profile.capacityKw && profile.capacityKw > 0 ? profile.capacityKw : 5.0;
  const latestDays = Math.max(1, latestBill.billingDays || 30);
  const prevDays = prevBill ? Math.max(1, prevBill.billingDays || 30) : 30;

  // ─────────────────────────────────────────────────────────────
  // 1. ELECTRICITY BILL ANALYSIS
  // ─────────────────────────────────────────────────────────────
  const currentAmount = latestBill.billAmount;
  const previousAmount = prevBill ? prevBill.billAmount : null;
  const currentCons = getBillConsumption(latestBill);
  const prevCons = prevBill ? getBillConsumption(prevBill) : null;

  const currentDailyCons = round1(currentCons / latestDays);
  const prevDailyCons = prevCons !== null ? round1(prevCons / prevDays) : null;

  let amountDiff: number | null = null;
  let amountChangePct: number | null = null;
  if (previousAmount !== null) {
    amountDiff = round2(currentAmount - previousAmount);
    if (previousAmount > 0) {
      amountChangePct = Math.round(((currentAmount - previousAmount) / previousAmount) * 100);
    } else if (currentAmount > 0) {
      amountChangePct = 100;
    } else {
      amountChangePct = 0;
    }
  }

  let consumptionDiffKwh: number | null = null;
  let consumptionChangePct: number | null = null;
  if (prevDailyCons !== null && prevDailyCons > 0) {
    // Normalizing by daily consumption gives a true reflection even if billing days differ
    consumptionDiffKwh = round1(currentCons - (prevCons ?? 0));
    consumptionChangePct = Math.round(((currentDailyCons - prevDailyCons) / prevDailyCons) * 100);
  }

  // Determine Bill Status
  let billStatus: BillHealthStatus = 'insufficient_data';
  let billStatusLabel = 'Normal';
  let billSummary = '';
  let billExplanation = '';
  const billHighlights: string[] = [];

  if (prevBill === null) {
    billStatus = 'normal';
    billStatusLabel = 'First Bill Recorded';
    billSummary = `Initial bill is ₹${Math.round(currentAmount).toLocaleString('en-IN')} (${currentCons.toFixed(0)} kWh total consumption).`;
    billExplanation = 'Comparison baseline will be active once your second monthly bill is added.';
    billHighlights.push(`Grid import: ${latestBill.importKwh} kWh`);
    if (latestBill.closingCreditKwh > 0) {
      billHighlights.push(`${latestBill.closingCreditKwh} kWh banked credit carried forward`);
    }
  } else {
    // We have at least 2 bills to compare
    const absAmtPct = Math.abs(amountChangePct ?? 0);
    const absConsPct = Math.abs(consumptionChangePct ?? 0);

    if ((amountChangePct ?? 0) >= 15 || (consumptionChangePct ?? 0) >= 18) {
      billStatus = 'higher';
      billStatusLabel = 'Higher than usual';
      billSummary = `Your electricity bill is ₹${Math.round(currentAmount).toLocaleString('en-IN')}, up ${amountChangePct}% from ${prevBill.period}.`;
      
      if ((consumptionChangePct ?? 0) > 10) {
        billExplanation = `Household energy usage increased from ${prevDailyCons} to ${currentDailyCons} kWh/day (+${consumptionChangePct}%). Increased air conditioning or appliance run-time is a primary driver.`;
      } else if (latestBill.importKwh > prevBill.importKwh) {
        billExplanation = `Grid import rose to ${latestBill.importKwh} kWh (+${latestBill.importKwh - prevBill.importKwh} kWh from grid), leading to higher retail energy charges.`;
      } else {
        billExplanation = 'Higher bill due to government fixed demand charges, duty, or previous cycle adjustments.';
      }
    } else if ((amountChangePct ?? 0) <= -15 || (consumptionChangePct ?? 0) <= -18) {
      billStatus = 'lower';
      billStatusLabel = 'Lower than usual';
      billSummary = `Your electricity bill dropped by ${Math.abs(amountChangePct ?? 0)}% compared with ${prevBill.period}.`;
      
      if (latestBill.closingCreditKwh > prevBill.closingCreditKwh) {
        billExplanation = `Solar generation covered daytime usage and banked ${latestBill.closingCreditKwh} kWh, keeping net billed imports minimal.`;
      } else {
        billExplanation = `Household consumption decreased from ${prevDailyCons} to ${currentDailyCons} kWh/day (${consumptionChangePct}%).`;
      }
    } else {
      billStatus = 'normal';
      billStatusLabel = 'Normal';
      billSummary = `Bill amount (₹${Math.round(currentAmount).toLocaleString('en-IN')}) is consistent with recent billing patterns.`;
      billExplanation = `Daily electricity consumption is steady at ~${currentDailyCons} kWh/day (shifted by ${consumptionChangePct ?? 0}%).`;
    }

    billHighlights.push(`Latest: ₹${Math.round(currentAmount).toLocaleString('en-IN')} vs Prev: ₹${Math.round(previousAmount ?? 0).toLocaleString('en-IN')}`);
    billHighlights.push(`Consumption: ${currentCons.toFixed(0)} kWh (${currentDailyCons} kWh/day)`);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. SOLAR GENERATION ANALYSIS
  // ─────────────────────────────────────────────────────────────
  const currentGen = latestBill.generationKwh;
  const prevGen = prevBill ? prevBill.generationKwh : null;
  const currentDailyGen = currentGen !== null ? round1(currentGen / latestDays) : null;
  const prevDailyGen = prevGen !== null && prevGen !== undefined ? round1(prevGen / prevDays) : null;

  const isMonsoon = isGoaMonsoon(latestBill.periodEnd || latestBill.periodStart);
  // Benchmark Goa specific yield (kWh/kWp/day):
  // Non-monsoon: ~4.2 kWh/kW/day | Monsoon: ~2.8 kWh/kW/day
  const benchmarkYield = isMonsoon ? 2.8 : 4.2;
  const currentYield =
    currentDailyGen !== null && capacityKw > 0
      ? round2(currentDailyGen / capacityKw)
      : null;

  let genDiffKwh: number | null = null;
  let genChangePct: number | null = null;
  if (currentDailyGen !== null && prevDailyGen !== null && prevDailyGen > 0) {
    genDiffKwh = round1(currentGen! - prevGen!);
    genChangePct = Math.round(((currentDailyGen - prevDailyGen) / prevDailyGen) * 100);
  }

  let solarStatus: SolarHealthStatus = 'insufficient_data';
  let solarStatusLabel = 'Normal';
  let solarSummary = '';
  let solarExplanation = '';
  const diagnosticAdvice: string[] = [];

  if (currentGen === null) {
    solarStatus = 'insufficient_data';
    solarStatusLabel = 'No Generation Reading';
    solarSummary = 'Inverter solar generation (KWH_G) was not entered for this bill.';
    solarExplanation = 'Add your meter or inverter generation reading to unlock generation health checks.';
    diagnosticAdvice.push('Check your solar inverter display for monthly units generated.');
  } else if (prevGen === null && currentYield !== null) {
    // Only 1 bill with generation
    if (currentYield >= benchmarkYield * 0.9) {
      solarStatus = 'good';
      solarStatusLabel = 'Performing Well';
      solarSummary = `System generated ${currentGen} kWh (${currentDailyGen} kWh/day), yielding ${currentYield} kWh/kWp/day.`;
      solarExplanation = `Meeting the expected Goa regional benchmark (~${benchmarkYield} kWh/kWp/day) for ${isMonsoon ? 'monsoon season' : 'sunny season'}.`;
    } else {
      solarStatus = 'normal';
      solarStatusLabel = 'Normal';
      solarSummary = `System generated ${currentGen} kWh (${currentDailyGen} kWh/day).`;
      solarExplanation = `Specific yield is ${currentYield} kWh/kWp/day (baseline benchmark is ${benchmarkYield} kWh/kWp/day).`;
    }
  } else if (currentYield !== null) {
    // Multiple bills with generation
    const yieldRatio = currentYield / benchmarkYield;
    const isUnderperformingMoM = (genChangePct ?? 0) <= -15;

    if (isUnderperformingMoM && yieldRatio < 0.8) {
      solarStatus = 'lower';
      solarStatusLabel = 'Lower than expected';
      solarSummary = `Solar generation dropped by ${Math.abs(genChangePct ?? 0)}% to ${currentGen} kWh (${currentDailyGen} kWh/day).`;
      
      if (isMonsoon) {
        solarExplanation = 'Monsoon cloud cover in Goa heavily reduces solar irradiance. Lower seasonal generation is expected during heavy rains.';
        diagnosticAdvice.push('Weather impact: Persistent monsoon cloudiness naturally decreases PV output.');
      } else {
        solarExplanation = `Daily yield of ${currentYield} kWh/kWp/day is lower than seasonal normal (${benchmarkYield} kWh/kWp/day).`;
        diagnosticAdvice.push('Inspect solar panels for dust, bird droppings, or foliage shading.');
        if (careAssessment && careAssessment.daysSinceLastClean > 30) {
          diagnosticAdvice.push(`Panels were last washed ${careAssessment.daysSinceLastClean} days ago — wash recommended.`);
        }
        diagnosticAdvice.push('Check inverter LEDs/display to ensure all strings are active without error codes.');
      }
    } else if (yieldRatio >= 1.05 || (genChangePct !== null && genChangePct >= 8)) {
      solarStatus = 'good';
      solarStatusLabel = 'Performing Well';
      solarSummary = `System generated ${currentGen} kWh (${currentDailyGen} kWh/day), +${genChangePct ?? 0}% higher than previous period.`;
      solarExplanation = `High specific yield of ${currentYield} kWh/kWp/day outperforming benchmark expectations.`;
      diagnosticAdvice.push('System is running at peak conversion efficiency.');
    } else {
      solarStatus = 'normal';
      solarStatusLabel = 'Normal';
      solarSummary = `System produced ${currentGen} kWh (${currentDailyGen} kWh/day), operating within expected range.`;
      solarExplanation = `Average daily yield is ${currentYield} kWh/kWp/day (Goa benchmark: ${benchmarkYield} kWh/kWp/day).`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. ACTION CHECK & 3 CORE QUESTIONS
  // ─────────────────────────────────────────────────────────────
  let actionRequired = false;
  let severity: 'info' | 'warning' | 'success' = 'success';
  let actionTitle = 'All Systems Operating Normally';
  let actionRecommendation = 'Your rooftop solar system and electricity usage are balanced.';
  let actionType: 'cleaning' | 'consumption' | 'inverter' | 'none' = 'none';

  if (solarStatus === 'lower' && !isMonsoon) {
    actionRequired = true;
    severity = 'warning';
    actionTitle = 'Check Solar System Output';
    actionRecommendation = 'Generation dropped significantly below seasonal baseline. Inspect panels for dirt/soiling or check inverter status.';
    actionType = careAssessment && careAssessment.daysSinceLastClean > 25 ? 'cleaning' : 'inverter';
  } else if (billStatus === 'higher') {
    actionRequired = false;
    severity = 'info';
    actionTitle = 'Higher Consumption Observed';
    actionRecommendation = `Electricity consumption increased by ${consumptionChangePct}%. Consider running washing machines and pumps during peak solar hours (10 AM - 3 PM).`;
    actionType = 'consumption';
  } else if (solarStatus === 'good') {
    severity = 'success';
    actionTitle = 'Optimal Solar Harvest';
    actionRecommendation = 'Your panels are harvesting maximum sunlight and offsetting high-slab grid costs.';
    actionType = 'none';
  }

  // 3 Concise Answers
  const billAnswer =
    billStatus === 'higher'
      ? `Higher by ${amountChangePct}% (₹${Math.round(currentAmount).toLocaleString('en-IN')} vs ₹${Math.round(previousAmount ?? 0).toLocaleString('en-IN')}) due to higher grid consumption.`
      : billStatus === 'lower'
      ? `Lower by ${Math.abs(amountChangePct ?? 0)}% (₹${Math.round(currentAmount).toLocaleString('en-IN')}) thanks to solar offsets and banked units.`
      : `Normal — ₹${Math.round(currentAmount).toLocaleString('en-IN')} is within your typical range.`;

  const solarAnswer =
    solarStatus === 'good'
      ? `Yes — generating ${currentDailyGen ?? '—'} kWh/day (${currentYield ?? '—'} kWh/kWp/day), performing above seasonal targets.`
      : solarStatus === 'lower'
      ? `Lower than normal (${currentDailyGen ?? '—'} kWh/day). ${isMonsoon ? 'Monsoon overcast explains the decrease.' : 'Possible dust or shading on panels.'}`
      : `Yes — generating ${currentDailyGen ?? '—'} kWh/day, in line with Goa regional expectations.`;

  const actionAnswer =
    actionRequired
      ? actionRecommendation
      : 'No immediate action required. Everything is performing normally.';

  return {
    hasBills: true,
    hasComparison: prevBill !== null,
    comparisonPeriod: prevBill ? `vs ${prevBill.period}` : 'Initial Cycle',
    billAnalysis: {
      status: billStatus,
      statusLabel: billStatusLabel,
      currentAmount,
      previousAmount,
      amountDiff,
      amountChangePct,
      currentConsumptionKwh: currentCons,
      previousConsumptionKwh: prevCons,
      consumptionDiffKwh,
      consumptionChangePct,
      currentDailyConsumptionKwh: currentDailyCons,
      previousDailyConsumptionKwh: prevDailyCons,
      summary: billSummary,
      explanation: billExplanation,
      highlights: billHighlights,
    },
    solarAnalysis: {
      status: solarStatus,
      statusLabel: solarStatusLabel,
      currentGenerationKwh: currentGen,
      previousGenerationKwh: prevGen,
      generationDiffKwh: genDiffKwh,
      generationChangePct: genChangePct,
      currentDailyGenKwh: currentDailyGen,
      previousDailyGenKwh: prevDailyGen,
      currentYieldKwhPerKwDay: currentYield,
      benchmarkYieldKwhPerKwDay: benchmarkYield,
      season: isMonsoon ? 'monsoon' : 'sunny',
      summary: solarSummary,
      explanation: solarExplanation,
      diagnosticAdvice,
    },
    actionCheck: {
      actionRequired,
      severity,
      title: actionTitle,
      recommendation: actionRecommendation,
      actionType,
    },
    threeQuestions: {
      billAnswer,
      solarAnswer,
      actionAnswer,
    },
  };
}

function createEmptyAnalysis(): IntelligentAnalysisResult {
  return {
    hasBills: false,
    hasComparison: false,
    comparisonPeriod: 'No history',
    billAnalysis: {
      status: 'insufficient_data',
      statusLabel: 'No Data',
      currentAmount: 0,
      previousAmount: null,
      amountDiff: null,
      amountChangePct: null,
      currentConsumptionKwh: 0,
      previousConsumptionKwh: null,
      consumptionDiffKwh: null,
      consumptionChangePct: null,
      currentDailyConsumptionKwh: 0,
      previousDailyConsumptionKwh: null,
      summary: 'Add your first electricity bill to enable bill analytics.',
      explanation: 'No bills logged yet.',
      highlights: [],
    },
    solarAnalysis: {
      status: 'insufficient_data',
      statusLabel: 'No Data',
      currentGenerationKwh: null,
      previousGenerationKwh: null,
      generationDiffKwh: null,
      generationChangePct: null,
      currentDailyGenKwh: null,
      previousDailyGenKwh: null,
      currentYieldKwhPerKwDay: null,
      benchmarkYieldKwhPerKwDay: 4.2,
      season: 'sunny',
      summary: 'Solar generation data not available yet.',
      explanation: 'No generation logs recorded.',
      diagnosticAdvice: [],
    },
    actionCheck: {
      actionRequired: false,
      severity: 'info',
      title: 'Welcome to Goa SolarTrack',
      recommendation: 'Add your monthly bill to start tracking intelligent performance.',
      actionType: 'none',
    },
    threeQuestions: {
      billAnswer: 'No bill data available yet.',
      solarAnswer: 'No generation data available yet.',
      actionAnswer: 'Log your first electricity bill to start tracking.',
    },
  };
}
