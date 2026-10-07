// ============================================================
// GOA SOLARTRACKER — Domain Types
// Source of truth for all domain objects; no `any` allowed.
// PRD §10 Firestore data model
// ============================================================

// ------------------------------------
// System Profile
// ------------------------------------
export interface SystemProfile {
  id: string;
  systemName: string;
  capacityKw: number;
  location: string;         // e.g. "Panaji, North Goa"
  taluka?: string;
  tariffCategory: string;   // e.g. "LTDS-II-SOLAR"
  installationDate: string; // YYYY-MM-DD
  panelCount?: number;
  inverterMake?: string;
  inverterModel?: string;
  lastCleanedDate?: string; // YYYY-MM-DD
  settlementRateInr?: number; // APPC benchmark ₹/kWh
  settlementPolicyId?: string;
}

// ------------------------------------
// Monthly Solar Bill  (PRD §10.2)
// ------------------------------------
export type BillSource = 'manual' | 'ocr_confirmed' | 'canonical_fixture';

export interface SolarBill {
  id: string;
  period: string;           // human label, e.g. "August 2026"
  periodStart: string;      // YYYY-MM-DD
  periodEnd: string;        // YYYY-MM-DD
  billingDays: number;

  tariffCategory: string;   // e.g. "LTDS-II-SOLAR"

  // ── Meter readings ──
  generationKwh: number | null; // KWH_G — null when not available on bill
  importKwh: number;            // KWH_I
  exportKwh: number;            // KWH_E

  // ── Energy bank ──
  openingCreditKwh: number;
  availableCreditKwh: number;
  adjustedCreditKwh: number;
  netBilledImportKwh: number;
  closingCreditKwh: number;

  // ── Derived estimates ──
  directSolarUseKwh: number | null;      // null when generationKwh is null
  estimatedTotalConsumptionKwh: number | null;

  // ── Financial ──
  billAmount: number;
  billNumber?: string;
  dueDate?: string;             // YYYY-MM-DD
  demandCharges?: number;       // Fixed / demand
  energyCharges?: number;
  fppca?: number;               // Fuel &amp; Power Purchase Cost Adjustment
  electricityDuty?: number;
  publicLightingDuty?: number;
  rebate?: number;              // negative = credit to consumer
  otherCharges?: number;

  // ── Mismatch flags ──
  adjustedMismatch?: boolean;   // OCR value != calculated
  closingMismatch?: boolean;
  needsReview?: boolean;

  notes?: string;
  source: BillSource;
  parserVersion?: string;
  calculationVersion?: string;
  sourceDocId?: string;         // Firebase Storage reference
  createdAt: number;            // ms epoch
  updatedAt?: number;
}

// ------------------------------------
// Energy Ledger Entry  (PRD §10.1)
// ------------------------------------
export interface EnergyLedgerEntry {
  id: string;
  sourceBillId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  openingCreditKwh: number;
  exportKwh: number;
  importKwh: number;
  adjustedCreditKwh: number;
  closingCreditKwh: number;
  generationKwh: number | null;
  directSolarUseKwh: number | null;
  estimatedTotalConsumptionKwh: number | null;
  createdAt: number;
}

// ------------------------------------
// Cleaning / Care Events  (PRD §10.1)
// ------------------------------------
export interface CleaningEvent {
  id: string;
  date: string;             // YYYY-MM-DD
  notes?: string;
  provider?: string;
  cost?: number;
  photoRef?: string;        // Firebase Storage ref
  skipped?: boolean;        // "Skip / not needed" action
  createdAt: number;
}

// ------------------------------------
// Care Assessment  (PRD §8.3)
// ------------------------------------
export type CleaningState =
  | 'Good'
  | 'Watch'
  | 'Cleaning check recommended'
  | 'Cleaning recommended';

export interface CareAssessment {
  score: number;            // 0–100 composite soiling score
  state: CleaningState;
  daysSinceLastClean: number;
  rationale: string;
  recommendation: string;
  signals: {
    cleanlinessRecencySignal: number;
    rainFreeSignal: number;
    generationDeviationSignal: number;
    weatherConfidenceSignal: number;
  };
  weatherExplained?: boolean; // true = weather explains generation drop
  assessedAt: number;
}

// ------------------------------------
// Tariff Configuration  (PRD §7.1)
// ------------------------------------
export interface TariffSlab {
  minKwh: number;
  maxKwh: number; // Infinity for top slab
  rateInr: number;
}

export interface TariffVersion {
  id: string;
  category: string;         // "LTDS-II"
  effectiveFrom: string;    // YYYY-MM-DD
  effectiveTo: string;      // YYYY-MM-DD
  slabs: TariffSlab[];
  fixedChargePerKwPerMonth: number;
  source: string;
}

// ------------------------------------
// Settlement Policy  (PRD §2.2)
// ------------------------------------
export interface SettlementPolicy {
  id: string;
  periodLabel: string;      // e.g. "FY 2026-27"
  periodStart: string;      // YYYY-MM-DD (1 April)
  periodEnd: string;        // YYYY-MM-DD (31 March)
  paymentByDate: string;    // 31 May of following year
  rateType: 'APPC' | 'feed_in' | 'configured';
  rateInrPerKwh: number;
  source: string;
}

// ------------------------------------
// Weather Snapshot  (PRD §8.2)
// ------------------------------------
export interface WeatherSnapshot {
  id: string;
  periodStart: string;
  periodEnd: string;
  rainfallMm?: number;
  cloudCoverPct?: number;
  sunshineHoursPerDay?: number;
  isMonsoonSeason: boolean;
  source: string;
  fetchedAt: number;
}

// ------------------------------------
// Firebase Sync Status
// ------------------------------------
export interface SyncStatus {
  isFirestoreConnected: boolean;
  lastSyncedAt: Date | null;
  message: string;
}

// ------------------------------------
// Analytics Aggregate  (PRD §13)
// ------------------------------------
export interface MonthlyAnalyticsRow {
  period: string;
  billingDays: number;
  generationKwh: number | null;
  avgGenerationPerDay: number | null;
  importKwh: number;
  exportKwh: number;
  directSolarUseKwh: number | null;
  openingCreditKwh: number;
  closingCreditKwh: number;
  billAmount: number;
  monthOverMonthChangePct: number | null; // null when < 3 months of data
}

export interface AnnualAnalytics {
  totalGenerationKwh: number;
  totalImportKwh: number;
  totalExportKwh: number;
  totalDirectUseKwh: number;
  totalBillsPaid: number;
  estimatedAvoidedCostInr: number;
  closingCreditKwh: number; // current bank balance
  cleaningEventCount: number;
}
