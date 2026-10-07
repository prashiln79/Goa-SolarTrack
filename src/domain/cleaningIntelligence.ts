// ============================================================
// GOA SOLARTRACKER — Cleaning Intelligence Domain Service
// PRD §8 — Transparent V1 heuristic scoring model.
// Weather-aware, monsoon-aware, Goa-specific.
// ============================================================

import { CareAssessment, CleaningState } from '../types/solar';

// ── Input ────────────────────────────────────────────────────

export interface CleaningAssessmentInput {
  lastCleanedDate?: string;           // YYYY-MM-DD
  recentRainfallMm?: number;          // last 7–14 days
  cloudCoverPct?: number;             // 0–100
  sunshineHoursPerDay?: number;
  isMonsoonSeason?: boolean;          // June–September in Goa
  currentMonthAvgKwhPerDay?: number;  // from current bill
  previousMonthAvgKwhPerDay?: number; // from prior bill
  expectedKwhPerDay?: number;         // based on capacity × benchmark
  monthsOfHistory?: number;           // for trend guard (PRD §8.1)
}

// ── PRD §8.3 Scoring Weights ─────────────────────────────────
const W_RECENCY    = 0.20;
const W_RAIN_FREE  = 0.25;
const W_GEN_DEV    = 0.40;
const W_WEATHER    = 0.15;

// ── State Thresholds  (PRD §8.3) ────────────────────────────
const THRESHOLDS: { max: number; state: CleaningState }[] = [
  { max: 39,  state: 'Good' },
  { max: 64,  state: 'Watch' },
  { max: 79,  state: 'Cleaning check recommended' },
  { max: 100, state: 'Cleaning recommended' },
];

// ── Main Assessment Function ─────────────────────────────────

/**
 * Computes a transparent V1 cleaning score using 4 weighted signals.
 * PRD §8.3: "Use a transparent scoring model rather than a black-box ML model in V1."
 * PRD §8.1: "Never use a single month's low generation as proof of panel dirtiness."
 */
export function calculateCleaningScore(
  input: CleaningAssessmentInput
): CareAssessment {
  const now = new Date();

  // ── Signal 1: Recency (20%) ──────────────────────────────
  let daysSinceLastClean = 45; // conservative default if unknown
  if (input.lastCleanedDate) {
    const cleaned = new Date(input.lastCleanedDate);
    const diffMs = Math.abs(now.getTime() - cleaned.getTime());
    daysSinceLastClean = Math.max(0, Math.floor(diffMs / 86_400_000));
  }
  // 0 days = 0 signal, 60+ days = 100 signal
  const cleanlinessRecencySignal = clamp((daysSinceLastClean / 60) * 100, 0, 100);

  // ── Signal 2: Rain-free / Natural Washing (25%) ──────────
  const rainfall = input.recentRainfallMm ?? 0;
  let rainFreeSignal = 70; // moderate dry default

  if (input.isMonsoonSeason) {
    // Goa monsoon June–Sept: heavy natural washing expected
    rainFreeSignal = rainfall > 20 ? 5 : 20;
  } else if (rainfall > 30) {
    rainFreeSignal = 8;    // heavy rain — panels likely clean
  } else if (rainfall > 10) {
    rainFreeSignal = 30;   // moderate wash
  } else if (rainfall > 2) {
    rainFreeSignal = 55;   // light sprinkle — minimal cleaning
  } else {
    rainFreeSignal = 85;   // dry / coastal dust season
  }

  // ── Signal 3: Generation Deviation (40%) ─────────────────
  let generationDeviationSignal = 30; // neutral default
  let weatherExplained = false;

  if (
    input.currentMonthAvgKwhPerDay !== undefined &&
    input.expectedKwhPerDay !== undefined &&
    input.expectedKwhPerDay > 0
  ) {
    const ratio = input.currentMonthAvgKwhPerDay / input.expectedKwhPerDay;

    if (ratio < 0.65) {
      generationDeviationSignal = 90; // severe underperformance
    } else if (ratio < 0.80) {
      generationDeviationSignal = 60; // notable underperformance
    } else if (ratio < 0.92) {
      generationDeviationSignal = 35; // slight underperformance
    } else {
      generationDeviationSignal = 10; // at or above expectation
    }

    // PRD §8.3 — if weather explains the drop, reduce the score
    const cloudCover = input.cloudCoverPct ?? 0;
    if (cloudCover > 60 || input.isMonsoonSeason) {
      weatherExplained = true;
      generationDeviationSignal = Math.max(10, generationDeviationSignal - 35);
    }
  }

  // Guard: PRD §8.1 — don't show trend if < 3 months of history
  const hasEnoughHistory =
    input.monthsOfHistory === undefined || input.monthsOfHistory >= 3;
  if (!hasEnoughHistory) {
    generationDeviationSignal = Math.min(generationDeviationSignal, 35);
  }

  // ── Signal 4: Weather Confidence (15%) ───────────────────
  const sunshineHours = input.sunshineHoursPerDay ?? 5;
  let weatherConfidenceSignal = 40; // neutral
  if (sunshineHours > 7) weatherConfidenceSignal = 20;  // high sun = expect good output
  else if (sunshineHours < 3) weatherConfidenceSignal = 70; // low sun — hard to evaluate

  // ── Composite Score ───────────────────────────────────────
  let rawScore =
    W_RECENCY   * cleanlinessRecencySignal +
    W_RAIN_FREE * rainFreeSignal +
    W_GEN_DEV   * generationDeviationSignal +
    W_WEATHER   * weatherConfidenceSignal;

  // PRD §8.3 Suppression rules
  if (daysSinceLastClean <= 5) {
    // Cleaned within last 5 days — always suppress alert
    rawScore = Math.min(rawScore, 15);
  } else if (rainfall > 25 || (input.isMonsoonSeason && rainfall > 5)) {
    // Recent heavy rain — natural cleaning likely
    rawScore = Math.min(rawScore, 32);
  }

  const score = Math.round(clamp(rawScore, 0, 100));
  const state = getStateForScore(score);

  const { rationale, recommendation } = buildCopy(
    state,
    daysSinceLastClean,
    weatherExplained,
    rainfall,
    input.isMonsoonSeason ?? false,
    hasEnoughHistory
  );

  return {
    score,
    state,
    daysSinceLastClean,
    rationale,
    recommendation,
    signals: {
      cleanlinessRecencySignal,
      rainFreeSignal,
      generationDeviationSignal,
      weatherConfidenceSignal,
    },
    weatherExplained,
    assessedAt: Date.now(),
  };
}

// ── Copy Generator ────────────────────────────────────────────

function buildCopy(
  state: CleaningState,
  daysSince: number,
  weatherExplained: boolean,
  rainfall: number,
  isMonsoon: boolean,
  hasHistory: boolean
): { rationale: string; recommendation: string } {
  const cleanedRecently = daysSince <= 7;

  if (state === 'Good') {
    const rationale = cleanedRecently
      ? `Panels were cleaned ${daysSince === 0 ? 'today' : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`}. Performance is optimal.`
      : isMonsoon
      ? 'Goa monsoon rainfall is providing regular natural panel washing.'
      : rainfall > 15
      ? `Recent rainfall of ~${rainfall} mm is likely rinsing surface dust.`
      : 'Panels are generating within expected thresholds. No cleaning needed.';
    return { rationale, recommendation: 'No cleaning required at this time. Continue monitoring.' };
  }

  if (state === 'Watch') {
    const rationale = weatherExplained
      ? 'Generation is slightly below benchmark, but current cloud cover may explain the difference.'
      : `Panels have not been washed in ${daysSince} days. Minor dust accumulation possible.`;
    return {
      rationale,
      recommendation: 'Inspect panels visually during the week. Look for dust, bird droppings or leaf debris.',
    };
  }

  if (state === 'Cleaning check recommended') {
    const rationale = !hasHistory
      ? 'Limited generation history available. A visual check is recommended as a baseline.'
      : `Generation deviation and ${daysSince} dry days suggest panels may need attention.`;
    return {
      rationale,
      recommendation: 'Consider a gentle water rinse early morning before 8 AM or after 5 PM to avoid thermal shock.',
    };
  }

  // Cleaning recommended
  const rationale = weatherExplained
    ? `Significant generation gap persists even accounting for cloud cover. ${daysSince} days without wash.`
    : `Substantial generation underperformance detected after ${daysSince} days without cleaning.`;
  return {
    rationale,
    recommendation: 'Clean panels as soon as practical. Use soft water and a gentle squeegee. Avoid midday in peak summer.',
  };
}

// ── Helpers ──────────────────────────────────────────────────

function getStateForScore(score: number): CleaningState {
  for (const t of THRESHOLDS) {
    if (score <= t.max) return t.state;
  }
  return 'Cleaning recommended';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
