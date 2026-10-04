import assert from 'node:assert/strict';
import type { BudgetItem, WorkplanItem } from '../src/types';
import { calculateBudgetForecast } from '../src/services/intelligenceService';
import { expandWorkplanOccurrences, findOverloadedStaff } from '../src/services/workplanRecurrence';

const plan = (overrides: Partial<WorkplanItem> = {}): WorkplanItem => ({
  id: 'workplan-1',
  period: 'Annual 2026',
  periodType: 'annual',
  activity: 'School visit',
  objective: 'Monitor attendance',
  description: 'Monitor attendance',
  responsibleStaffId: 'staff-1',
  responsibleStaffName: 'Amina',
  startDate: '2026-01-05',
  endDate: '2026-01-31',
  targetCount: 1,
  unit: 'visit',
  location: 'Zomba',
  status: 'Planned',
  progress: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const weekly = plan({
  recurrence: { every: 'week', until: '2026-02-21' },
  completionDates: ['2026-02-07'],
});
const weeklyOccurrences = expandWorkplanOccurrences([weekly], '2026-02-01', '2026-02-28');
assert.deepEqual(weeklyOccurrences.map((item) => item.date), ['2026-02-07', '2026-02-14', '2026-02-21']);
assert.equal(weeklyOccurrences[0].completed, true);
assert.equal(weeklyOccurrences[1].completed, false);

const monthly = expandWorkplanOccurrences(
  [plan({ endDate: '2024-01-31', recurrence: { every: 'month', until: '2024-04-30' } })],
  '2024-01-01',
  '2024-12-31'
);
assert.deepEqual(monthly.map((item) => item.date), ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
assert.deepEqual(
  expandWorkplanOccurrences([plan({ recurrence: { every: 'term', until: '2026-10-31' } })], '2026-01-01', '2026-12-31')
    .map((item) => item.date),
  ['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']
);

const busyPlans = Array.from({ length: 7 }, (_, index) => plan({
  id: `busy-${index}`,
  endDate: '2026-02-04',
}));
assert.deepEqual(Array.from(findOverloadedStaff(busyPlans, '2026-02-01', '2026-02-28')), ['staff-1']);
assert.deepEqual(Array.from(findOverloadedStaff(busyPlans.slice(0, 6), '2026-02-01', '2026-02-28')), []);

const budgetItem = (overrides: Partial<BudgetItem> = {}): BudgetItem => ({
  id: 'budget-1',
  period: 'Annual 2026',
  periodType: 'annual',
  programme: 'Farming',
  category: 'Food',
  itemDescription: 'Seasonal input',
  unit: 'lot',
  quantity: 1,
  unitCost: 1200,
  budgetAmount: 1200,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});
const forecast = calculateBudgetForecast([
  budgetItem({ seasonalMonths: [2, 4, 2, 13] }),
  budgetItem({ id: 'monthly', budgetAmount: 1200, month: 6 }),
  budgetItem({ id: 'flat', budgetAmount: 1200 }),
], 1.1);
assert.equal(forecast.forecast, 3960);
assert.equal(forecast.monthlyForecast?.[1], 770);
assert.equal(forecast.monthlyForecast?.[3], 770);
assert.equal(forecast.monthlyForecast?.[5], 1430);
assert.equal(forecast.monthlyForecast?.[0], 110);
assert.equal(forecast.monthlyForecast?.reduce((sum, value) => sum + value, 0), 3960);

console.log('Workplan recurrence and seasonal forecast tests passed.');
