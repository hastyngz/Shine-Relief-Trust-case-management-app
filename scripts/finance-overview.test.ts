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
  procurementLists: [
    { id: 'approved-order', title: 'Approved synthetic order', purpose: 'Test commitment', items: [], totalMWK: 2000, status: 'approved', createdAt: '2026-11-01', updatedAt: '2026-11-01', createdBy: 'test', updatedBy: 'test' },
    { id: 'purchased-order', title: 'Purchased synthetic order', purpose: 'Test payments', items: [], totalMWK: 5000, status: 'purchased', receivedAt: '2026-11-05', payments: [
      { id: 'nov-payment', date: '2026-11-04', amountMWK: 1000, reference: 'TEST-NOV', recordedAt: '2026-11-04T10:00:00Z', recordedBy: 'Synthetic tester' },
      { id: 'oct-payment', date: '2026-10-20', amountMWK: 500, reference: 'TEST-OCT', recordedAt: '2026-10-20T10:00:00Z', recordedBy: 'Synthetic tester' },
    ], createdAt: '2026-11-01', updatedAt: '2026-11-05', createdBy: 'test', updatedBy: 'test' },
    { id: 'not-received-order', title: 'Not received synthetic order', purpose: 'Test handover filter', items: [], totalMWK: 1000, status: 'purchased', createdAt: '2026-11-01', updatedAt: '2026-11-01', createdBy: 'test', updatedBy: 'test' },
    { id: 'draft-order', title: 'Draft synthetic order', purpose: 'Must not count', items: [], totalMWK: 10000, status: 'draft', createdAt: '2026-11-01', updatedAt: '2026-11-01', createdBy: 'test', updatedBy: 'test' },
  ], schedules: [],
  pettyCashTransactions: [
    { id: 'nov-petty-expense', date: '2026-11-06', type: 'expense', amountMWK: 1200, description: 'Synthetic petty cash expense', reference: 'PC-VOUCHER-NOV', recordedAt: '2026-11-06T10:00:00Z', recordedBy: 'Synthetic manager', recordedByUid: 'test', createdAt: '2026-11-06T10:00:00Z' },
    { id: 'oct-petty-expense', date: '2026-10-05', type: 'expense', amountMWK: 700, description: 'Synthetic petty cash expense', reference: 'PC-VOUCHER-OCT', recordedAt: '2026-10-05T10:00:00Z', recordedBy: 'Synthetic manager', recordedByUid: 'test', createdAt: '2026-10-05T10:00:00Z' },
  ],
} as unknown as AppDatabase;

const november = getFinancePeriodSummary(db, '2026-11');
assert.equal(november.budget, 1000);
assert.equal(november.budgetActual, 700);
assert.equal(november.expenseActual, 650);
assert.equal(november.assetMaintenanceTotal, 250);
assert.equal(november.unpaidTotal, 380);
assert.deepEqual(november.financeRegister.map((item) => item.id), ['nov-unpaid', 'nov-maintenance', 'old-unpaid']);
assert.equal(november.assetMaintenanceExpenses.length, 1);
assert.equal(november.procurementCommitments.length, 3);
assert.equal(november.procurementCommittedTotal, 8000);
assert.equal(november.procurementPaidTotal, 1500);
assert.equal(november.procurementOutstandingTotal, 6500);
assert.equal(november.procurementPaymentsThisMonth, 1000);
assert.equal(november.pettyCashExpensesThisMonth, 1200);
assert.deepEqual(november.handover.map((item) => item.id), ['purchased-order']);

const october = getFinancePeriodSummary(db, '2026-10');
assert.equal(october.budget, 500);
assert.equal(october.expenseActual, 100);
assert.equal(october.procurementPaymentsThisMonth, 500);
assert.equal(october.pettyCashExpensesThisMonth, 700);
assert.deepEqual(october.financeRegister.map((item) => item.id), ['nov-unpaid', 'oct-paid', 'old-unpaid']);
assert.equal(getFinancePeriodSummary(db, '2026-13').expenses.length, 0);
assert.equal(getFinancePeriodSummary(db, '').budget, 0);
console.log('Finance period summary tests passed.');
