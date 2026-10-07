// ============================================================
// GOA SOLARTRACKER — Tariff Engine Domain Service
// PRD §7 — Versioned LTDS-II tariff + bill component model.
// Values stored as configuration, not hard-coded in components.
// ============================================================

import { TariffVersion, TariffSlab } from '../types/solar';

// ── FY 2026-27 LTDS-II Configuration  (PRD §7.1) ────────────
// Source: JERC Tariff Order w.e.f 1 October 2025 (FY 2025-26 to FY 2029-30)
// https://www.goaelectricity.gov.in/Regulations/TARIFF%20ORDER%20w.e.f%201st%20October%202025.pdf

export const LTDS_II_FY2026_27: TariffVersion = {
  id: 'ltds-ii-fy2026-27',
  category: 'LTDS-II',
  effectiveFrom: '2026-04-01',
  effectiveTo: '2027-03-31',
  slabs: [
    { minKwh: 0,   maxKwh: 100,      rateInr: 2.10 },
    { minKwh: 100, maxKwh: 200,      rateInr: 3.10 },
    { minKwh: 200, maxKwh: 300,      rateInr: 4.15 },
    { minKwh: 300, maxKwh: 400,      rateInr: 5.45 },
    { minKwh: 400, maxKwh: Infinity, rateInr: 6.60 },
  ],
  fixedChargePerKwPerMonth: 25.00, // ₹25 per kW or part thereof per month
  source: 'JERC Tariff Order w.e.f 1 October 2025, LTDS-II schedule',
};

// All known tariff versions — extend as JERC publishes new orders
export const TARIFF_VERSIONS: TariffVersion[] = [LTDS_II_FY2026_27];

// ── Active Tariff Lookup ─────────────────────────────────────

/**
 * Returns the applicable tariff version for a given billing period date.
 * Defaults to the latest known version if no exact match.
 */
export function getTariffVersionForDate(date: string): TariffVersion {
  const target = new Date(date);
  const match = TARIFF_VERSIONS.find((v) => {
    const from = new Date(v.effectiveFrom);
    const to = new Date(v.effectiveTo);
    return target >= from && target <= to;
  });
  // Fallback: most recent version
  return match ?? TARIFF_VERSIONS[TARIFF_VERSIONS.length - 1];
}

// ── Tariff Calculations ──────────────────────────────────────

/**
 * Telescopic energy charge for a given net billed consumption.
 * PRD §7.1 — telescopic slabs.
 */
export function calculateTelescopicEnergyCharge(
  kwhConsumed: number,
  slabs: TariffSlab[] = LTDS_II_FY2026_27.slabs
): number {
  if (kwhConsumed <= 0) return 0;
  let remaining = kwhConsumed;
  let total = 0;

  for (const slab of slabs) {
    if (remaining <= 0) break;
    const slabSpan = isFinite(slab.maxKwh) ? slab.maxKwh - slab.minKwh : remaining;
    const unitsInSlab = Math.min(remaining, slabSpan);
    total += unitsInSlab * slab.rateInr;
    remaining -= unitsInSlab;
  }

  return round2(total);
}

/**
 * Monthly fixed / demand charge.
 * Rounded up to next whole kW (part thereof).
 */
export function calculateFixedCharge(
  capacityKw: number,
  ratePerKw: number = LTDS_II_FY2026_27.fixedChargePerKwPerMonth
): number {
  const roundedKw = Math.ceil(capacityKw || 1);
  return round2(roundedKw * ratePerKw);
}

// ── Bill Financial Model  (PRD §7.2 & 7.3) ──────────────────

export interface BillEstimate {
  energyChargeInr: number;
  fixedChargeInr: number;
  totalEstimatedRetailInr: number;  // what the user would pay without solar
  estimatedSavingsInr: number;      // avoided cost = retail estimate - actual bill
  note: string;
}

/**
 * Estimates the retail equivalent bill (without solar credits).
 * PRD §7.2: "The actual bill amount is authoritative. The app may provide
 * an estimated 'retail-equivalent value' but such values must be labelled as estimates."
 */
export function estimateRetailBill(
  estimatedTotalConsumptionKwh: number,
  actualBillAmount: number,
  capacityKw: number,
  tariffVersion: TariffVersion = LTDS_II_FY2026_27
): BillEstimate {
  const energyChargeInr = calculateTelescopicEnergyCharge(
    estimatedTotalConsumptionKwh,
    tariffVersion.slabs
  );
  const fixedChargeInr = calculateFixedCharge(
    capacityKw,
    tariffVersion.fixedChargePerKwPerMonth
  );
  const totalEstimatedRetailInr = round2(energyChargeInr + fixedChargeInr);
  const estimatedSavingsInr = round2(
    Math.max(0, totalEstimatedRetailInr - actualBillAmount)
  );

  return {
    energyChargeInr,
    fixedChargeInr,
    totalEstimatedRetailInr,
    estimatedSavingsInr,
    note: 'Estimated retail equivalent using LTDS-II telescopic slabs + fixed charge. Excludes FPPCA, duties and other charges. Labelled as estimate per PRD §7.2.',
  };
}

// ── Settlement Projection  (PRD §2.2) ────────────────────────

export interface SettlementProjection {
  bankedCreditKwh: number;
  ratePerKwh: number;
  projectedPayoutInr: number;
  settlementPeriod: string;
  paymentByDate: string;
  isEstimate: boolean;
  note: string;
}

/**
 * Projects annual settlement payout.
 * PRD §2.2: "Do not hard-code the payout rate."
 * Rate must come from configured SettlementPolicy.
 */
export function projectSettlement(
  bankedCreditKwh: number,
  ratePerKwh: number,
  settlementPeriodLabel: string,
  paymentByDate: string
): SettlementProjection {
  return {
    bankedCreditKwh,
    ratePerKwh,
    projectedPayoutInr: round2(bankedCreditKwh * ratePerKwh),
    settlementPeriod: settlementPeriodLabel,
    paymentByDate,
    isEstimate: true,
    note: 'Projected payout at configured APPC benchmark rate. Actual settlement depends on EDG computation. PRD §2.2.',
  };
}

// ── Helpers ──────────────────────────────────────────────────
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
