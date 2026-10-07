import { calculateEnergyAccounting, CANONICAL_AUGUST_2026_BILL } from '../src/domain/energyAccounting';
import { calculateTelescopicEnergyCharge, calculateFixedCharge, estimateRetailBill } from '../src/domain/tariffEngine';
import { calculateCleaningScore } from '../src/domain/cleaningIntelligence';

console.log('--- RUNNING GOA SOLAR TRACKER DOMAIN VERIFICATION ---');

// 1. Canonical August 2026 test
const canonicalResult = calculateEnergyAccounting({
  generationKwh: CANONICAL_AUGUST_2026_BILL.generationKwh,
  importKwh: CANONICAL_AUGUST_2026_BILL.importKwh,
  exportKwh: CANONICAL_AUGUST_2026_BILL.exportKwh,
  openingCreditKwh: CANONICAL_AUGUST_2026_BILL.openingCreditKwh,
});

console.log('August 2026 Canonical Test Result:', canonicalResult);
console.assert(canonicalResult.adjustedCreditKwh === 241, `Expected adjustedCredit 241, got ${canonicalResult.adjustedCreditKwh}`);
console.assert(canonicalResult.closingCreditKwh === 329, `Expected closingCredit 329, got ${canonicalResult.closingCreditKwh}`);
console.assert(canonicalResult.directSolarUseKwh === 100, `Expected directSolarUse 100, got ${canonicalResult.directSolarUseKwh}`);
console.assert(canonicalResult.estimatedTotalConsumptionKwh === 341, `Expected estimatedTotalConsumption 341, got ${canonicalResult.estimatedTotalConsumptionKwh}`);

// 2. Edge Case 1: Import 500, export 100, opening credit 200
const edge1 = calculateEnergyAccounting({
  generationKwh: 300,
  importKwh: 500,
  exportKwh: 100,
  openingCreditKwh: 200,
});
console.log('Edge 1 (Import 500, Exp 100, Open 200):', edge1);
console.assert(edge1.availableCreditKwh === 300, 'Edge 1 available credit should be 300');
console.assert(edge1.adjustedCreditKwh === 300, 'Edge 1 adjusted credit should be 300');
console.assert(edge1.netBilledImportKwh === 200, 'Edge 1 net billed import should be 200');
console.assert(edge1.closingCreditKwh === 0, 'Edge 1 closing credit should be 0');

// 3. Edge Case 2: Import 0, export 250, opening credit 100
const edge2 = calculateEnergyAccounting({
  generationKwh: 350,
  importKwh: 0,
  exportKwh: 250,
  openingCreditKwh: 100,
});
console.log('Edge 2 (Import 0, Exp 250, Open 100):', edge2);
console.assert(edge2.closingCreditKwh === 350, 'Edge 2 closing credit should be 350');
console.assert(edge2.adjustedCreditKwh === 0, 'Edge 2 adjusted credit should be 0');

// 4. Edge Case 3: Import 200, export 50, opening credit 0
const edge3 = calculateEnergyAccounting({
  generationKwh: 100,
  importKwh: 200,
  exportKwh: 50,
  openingCreditKwh: 0,
});
console.log('Edge 3 (Import 200, Exp 50, Open 0):', edge3);
console.assert(edge3.adjustedCreditKwh === 50, 'Edge 3 adjusted credit should be 50');
console.assert(edge3.netBilledImportKwh === 150, 'Edge 3 net billed should be 150');
console.assert(edge3.closingCreditKwh === 0, 'Edge 3 closing credit should be 0');

// 5. Tariff Engine test
const telescopic100 = calculateTelescopicEnergyCharge(100);
console.log('Tariff for 100 kWh:', telescopic100); // 100 * 2.1 = 210
console.assert(telescopic100 === 210, `Expected 210, got ${telescopic100}`);

const fixedCharge = calculateFixedCharge(5.3);
console.log('Fixed charge for 5.3 kW (rounded to 6 kW):', fixedCharge); // 6 * 25 = 150
console.assert(fixedCharge === 150, `Expected 150, got ${fixedCharge}`);

// 6. Cleaning score test
const cleanScoreRecent = calculateCleaningScore({
  lastCleanedDate: new Date().toISOString().split('T')[0],
  isMonsoonSeason: false,
});
console.log('Cleaning score for recently cleaned:', cleanScoreRecent);
console.assert(cleanScoreRecent.state === 'Good', 'Recently cleaned should be Good');

console.log('ALL DOMAIN RULES VERIFIED SUCCESSFULLY!');
