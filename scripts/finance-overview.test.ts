import assert from 'node:assert/strict';
import { getFinancePeriodSummary } from '../src/utils/financeOverview';
import type { AppDatabase } from '../src/types';

const expense = (id: string, date: string, totalCost: number, extra: Record<string, unknown> = {}) => ({
  id, householdId: 'synthetic-house', date, category: 'Repairs' as const,
  itemDescription: id, quantity: '1', unitCost: totalCost, totalCost,
  createdAt: date, ...extra,
});

const db = {
  girls: [], households: [], educationalFollowUps: [], healthFollowUps: [],
  familyFollowUps: [], rentPayments: [], expenses: [
    expense('oct-paid', '2026-10-10', 100, { paymentStatus: 'Paid' }),
    expense('nov-maintenance', '2026-11-02', 250, { sourceType: 'asset_maintenance' }),
    expense('nov-unpaid', '2026-11-03', 400, { paymentStatus: 'Payment Outstanding', amountDue: 300 }),
    expense('old-unpaid', '2026-09-12', 80, { paymentStatus: 'Payment Outstanding' }),
  ],
  householdActivities: [], budgets: [
    { id: 'nov-budget', period: '2026-11', periodType: 'monthly', programme: 'Admin', category: 'Other', itemDescription: 'Synthetic', unit: 'item', quantity: 1, unitCost: 1000, budgetAmount: 1000, actualExpenditure: 700, createdAt: '2026-11-01' },
    { id: 'oct-budget', period: '2026-10', periodType: 'monthly', programme: 'Admin', category: 'Other', itemDescription: 'Synthetic', unit: 'item', quantity: 1, unitCost: 500, budgetAmount: 500, actualExpenditure: 200, createdAt: '2026-10-01' },
  ],
  procurementLists: [], schedules: [],
} as unknown as AppDatabase;

const november = getFinancePeriodSummary(db, '2026-11');
assert.equal(november.budget, 1000);
assert.equal(november.budgetActual, 700);
assert.equal(november.expenseActual, 650);
assert.equal(november.assetMaintenanceTotal, 250);
assert.equal(november.unpaidTotal, 380);
assert.deepEqual(november.financeRegister.map((item) => item.id), ['old-unpaid', 'nov-unpaid', 'nov-maintenance']);
assert.equal(november.assetMaintenanceExpenses.length, 1);

const october = getFinancePeriodSummary(db, '2026-10');
assert.equal(october.budget, 500);
assert.equal(october.expenseActual, 100);
assert.deepEqual(october.financeRegister.map((item) => item.id), ['oct-paid', 'old-unpaid', 'nov-unpaid']);
assert.equal(getFinancePeriodSummary(db, '2026-13').expenses.length, 0);
assert.equal(getFinancePeriodSummary(db, '').budget, 0);
console.log('Finance period summary tests passed.');
