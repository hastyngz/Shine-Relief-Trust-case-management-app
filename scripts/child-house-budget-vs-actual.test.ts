import assert from 'node:assert/strict';
import type { HouseholdExpense } from '../src/types';
import { buildChildHouseBudgetExpense, buildHouseholdBudgetVsActual } from '../src/utils/householdBudget';

const makeExpense = (overrides: Partial<HouseholdExpense> & Pick<HouseholdExpense, 'id' | 'itemDescription' | 'totalCost'>): HouseholdExpense => ({
  householdId: 'SH-01',
  date: '2026-11-01',
  category: 'Groceries',
  quantity: '1',
  unitCost: overrides.totalCost,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const records: HouseholdExpense[] = [
  makeExpense({ id: 'budget-oil', itemDescription: 'Cooking oil', totalCost: 28000, recordType: 'budget', month: '2026-11', frequency: 'Monthly', unit: 'bottle' }),
  makeExpense({ id: 'budget-sugar', itemDescription: 'Sugar', totalCost: 9000, recordType: 'budget', month: '2026-11', frequency: 'Monthly', unit: 'kg' }),
  makeExpense({ id: 'actual-oil', itemDescription: ' cooking   oil ', totalCost: 32000, date: '2026-11-08', unit: 'bottle' }),
  makeExpense({ id: 'actual-extra', itemDescription: 'Charcoal', totalCost: 5000, date: '2026-11-09' }),
  makeExpense({ id: 'other-month', itemDescription: 'Cooking oil', totalCost: 7000, date: '2026-10-20' }),
  makeExpense({ id: 'other-house', householdId: 'SH-02', itemDescription: 'Cooking oil', totalCost: 9000, date: '2026-11-20' }),
];

const report = buildHouseholdBudgetVsActual(records, 'SH-01', '2026-11');
assert.equal(report.budgetTotal, 37000);
assert.equal(report.actualTotal, 37000);
assert.equal(report.variance, 0);
assert.equal(report.rows.length, 3);

const oil = report.rows.find((row) => row.itemDescription === 'Cooking oil');
assert.ok(oil);
assert.equal(oil.budgetAmount, 28000);
assert.equal(oil.actualAmount, 32000);
assert.equal(oil.variance, 4000);
assert.ok(Math.abs((oil.percentageUsed ?? 0) - (32000 / 28000) * 100) < 1e-10);
assert.equal(oil.overspent, true);

const sugar = report.rows.find((row) => row.itemDescription === 'Sugar');
assert.ok(sugar);
assert.equal(sugar.actualAmount, 0);
assert.equal(sugar.percentageUsed, 0);
assert.equal(sugar.overspent, false);

const charcoal = report.rows.find((row) => row.itemDescription === 'Charcoal');
assert.ok(charcoal);
assert.equal(charcoal.budgetAmount, 0);
assert.equal(charcoal.actualAmount, 5000);
assert.equal(charcoal.overspent, true);

console.log('Child House budget-versus-actual comparison tests passed.');


const importedBudget = buildChildHouseBudgetExpense({
  householdId: 'SH-01',
  period: '2026-11',
  quantity: 2,
  unitCost: 14000,
  budgetAmount: 28000,
  itemDescription: 'Cooking oil 2L',
  category: 'Groceries',
  unit: 'bottle',
  frequency: 1,
  itemNumber: '17',
  notes: 'Source amount needs review',
  sourceFileName: 'CHILD_HOUSE_BUDGET-NOVE-2026.xlsx',
  sheet: 'November',
  row: 17,
  createdBy: 'Test User',
});
assert.equal(importedBudget.recordType, 'budget');
assert.equal(importedBudget.householdId, 'SH-01');
assert.equal(importedBudget.month, '2026-11');
assert.equal(importedBudget.date, '2026-11-01');
assert.equal(importedBudget.totalCost, 28000);
assert.equal(importedBudget.category, 'Groceries');
assert.equal(importedBudget.budgetLineId, importedBudget.id);
assert.equal(importedBudget.id, buildChildHouseBudgetExpense({
  householdId: 'SH-01', period: '2026-11', quantity: 2, unitCost: 14000,
  budgetAmount: 28000, itemDescription: 'Cooking oil 2L', category: 'Groceries',
  unit: 'bottle', frequency: 1, itemNumber: '17', notes: 'Source amount needs review',
  sourceFileName: 'renamed-budget-file.xlsx', sheet: 'November', row: 17,
  createdBy: 'Test User',
}).id);
assert.throws(() => buildChildHouseBudgetExpense({
  householdId: 'SH-01', period: 'Annual 2026', quantity: 2, unitCost: 14000,
  budgetAmount: 28000, itemDescription: 'Cooking oil', sourceFileName: 'budget.xlsx',
  sheet: 'Annual', row: 2, createdBy: 'Test User',
}), /specific month/);
