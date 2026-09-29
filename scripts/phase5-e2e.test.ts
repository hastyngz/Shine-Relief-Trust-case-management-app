import assert from 'node:assert/strict';
import { buildIntelligentCaseSummary, detectIntelligenceSuggestions } from '../src/services/caseIntelligenceService';
import { calculateBudgetForecast, calculateFeedingCostInsight, calculateMarketPriceInsight, calculateWhatIfScenario, searchOperationalRecords } from '../src/services/intelligenceService';

const database: any = {
  girls: [{ id: 'g1', fullName: 'Margaret Banda', dateOfBirth: '2012-01-01', householdId: 'h1', school: 'Zomba Primary', classLevel: 'Standard 5', guardianInfo: { name: 'Grace', phone: '0999', relationship: 'Aunt' } }],
  households: [{ id: 'h1', name: 'Shine House', location: 'Zomba', houseMum: 'Grace', status: 'Active' }],
  meetings: [{ id: 'meeting-1', title: 'Shine House Committee', dateTime: '2026-09-29T10:00:00.000Z', status: 'Completed', minutesText: 'Action: review maize price', summaryAndOutcomes: 'Price review agreed' }],
  feedingProgramLogs: [{ id: 'feed-1', date: '2026-09-29', studentsPresent: 20, mealsServed: 20, foodItems: ['Maize'], quantities: { Maize: 2 }, estimatedCost: 5000, actualCost: 5200 }],
  marketPrices: [{ id: 'price-1', itemName: 'Maize', category: 'Food', price: 40000, currency: 'MWK', dateRecorded: '2026-09-01', locationOrShop: 'Zomba' }, { id: 'price-2', itemName: 'Maize', category: 'Food', price: 44000, currency: 'MWK', dateRecorded: '2026-09-29', locationOrShop: 'Zomba' }],
  budgets: [{ id: 'budget-1', category: 'Food', budgetAmount: 100000, actualExpenditure: 40000 }],
  educationalFollowUps: [{ id: 'edu-1', girlId: 'g1', date: '2026-09-01', school: 'Zomba Primary', classLevel: 'Standard 5', academicIssue: 'Attendance', furtherActionRequired: true, nextFollowUpDate: '2026-09-01', recommendations: 'School visit' }],
  healthFollowUps: [], familyFollowUps: [], caseActions: [], caseReviews: [], householdActivities: [], attachments: [], schedules: [], workplans: [], people: [],
};

assert.equal(searchOperationalRecords(database, 'Shine House committee')[0].recordType, 'meeting');
assert.equal(buildIntelligentCaseSummary(database, 'g1')?.outstandingFollowUps.length, 1);
assert.ok(detectIntelligenceSuggestions(database, '2026-09-29').some((item) => item.type === 'follow_up'));
assert.equal(calculateMarketPriceInsight(database.marketPrices, 'Maize', 'Zomba')?.percentageChange, 10);
assert.equal(calculateFeedingCostInsight(database.feedingProgramLogs).costPerMeal, 260);
const forecast = calculateBudgetForecast(database.budgets, 1.1);
assert.equal(forecast.forecast, 110000);
assert.equal(calculateWhatIfScenario(forecast.forecast, { id: 's', name: 'Food +10', foodPricePercent: 10, fuelPricePercent: 0, transportPercent: 0, studentPopulationPercent: 0, feedingDaysChange: 0, increasedEnrollmentPercent: 0, createdBy: 'manager', createdAt: '' }).scenarioForecast, 121000);
console.log('Phase 5 end-to-end intelligence chain tests passed.');
