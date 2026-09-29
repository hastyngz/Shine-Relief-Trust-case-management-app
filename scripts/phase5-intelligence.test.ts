import assert from 'node:assert/strict';
import {
  calculateBudgetForecast,
  calculateFeedingCostInsight,
  calculateMarketPriceInsight,
  calculateWhatIfScenario,
  searchOperationalRecords,
} from '../src/services/intelligenceService';

const db: any = {
  girls: [{ id: 'SG-001', fullName: 'Amina Banda', school: 'Zomba Primary', classLevel: 'Standard 5', status: 'Active' }],
  households: [{ id: 'SH-01', name: 'Shine House One', location: 'Zomba', houseMum: 'Grace', status: 'Active' }],
  meetings: [{ id: 'MTG-1', title: 'Feeding committee', dateTime: '2026-09-20T10:00:00.000Z', status: 'Completed', minutesText: 'Maize prices reviewed', summaryAndOutcomes: 'Approved review' }],
  schedules: [],
  workplans: [],
  marketPrices: [
    { id: 'p1', itemName: 'Maize flour', category: 'Food', price: 40000, currency: 'MWK', dateRecorded: '2026-08-01', sourceType: 'manual', locationOrShop: 'Zomba Market', createdBy: 'staff', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'p2', itemName: 'Maize flour', category: 'Food', price: 44000, currency: 'MWK', dateRecorded: '2026-09-01', sourceType: 'manual', locationOrShop: 'Zomba Market', createdBy: 'staff', createdAt: '2026-09-01T00:00:00.000Z' },
  ],
  feedingProgramLogs: [
    { id: 'f1', date: '2026-09-01', studentsPresent: 10, mealsServed: 10, foodItems: ['Maize'], quantities: { Maize: 1 }, estimatedCost: 1000, actualCost: 1200, createdBy: 'staff', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'f2', date: '2026-09-02', studentsPresent: 8, mealsServed: 8, foodItems: ['Maize'], quantities: { Maize: 1 }, estimatedCost: 800, createdBy: 'staff', createdAt: '2026-09-02T00:00:00.000Z' },
  ],
};

assert.equal(searchOperationalRecords(db, 'Amina Zomba').length, 1);
assert.equal(searchOperationalRecords(db, 'maize committee')[0].recordType, 'meeting');

const priceInsight = calculateMarketPriceInsight(db.marketPrices, 'maize flour', 'Zomba Market');
assert.equal(priceInsight?.currentPrice, 44000);
assert.equal(priceInsight?.previousPrice, 40000);
assert.equal(priceInsight?.trend, 'increasing');
assert.equal(Math.round(priceInsight?.percentageChange || 0), 10);

const feedingInsight = calculateFeedingCostInsight(db.feedingProgramLogs, '2026-09-01', '2026-09-02');
assert.equal(feedingInsight.actualCost, 2000);
assert.equal(feedingInsight.mealsServed, 18);
assert.equal(Math.round(feedingInsight.costPerMeal * 100) / 100, 111.11);

const forecast = calculateBudgetForecast([
  { budgetAmount: 100000, actualExpenditure: 40000 },
  { budgetAmount: 50000, actualExpenditure: 30000 },
] as any, 1.1);
assert.equal(forecast.approved, 150000);
assert.equal(forecast.actual, 70000);
assert.equal(forecast.forecast, 165000);
assert.equal(forecast.status, 'at_risk');

const scenario = calculateWhatIfScenario(100000, {
  id: 'scenario-1', name: 'Food increase', foodPricePercent: 10, fuelPricePercent: 0,
  transportPercent: 0, studentPopulationPercent: 0, feedingDaysChange: 0,
  increasedEnrollmentPercent: 0, createdBy: 'manager', createdAt: '2026-09-01T00:00:00.000Z',
});
assert.equal(scenario.scenarioForecast, 110000);
assert.equal(scenario.difference, 10000);

console.log('Phase 5 intelligence tests passed.');
