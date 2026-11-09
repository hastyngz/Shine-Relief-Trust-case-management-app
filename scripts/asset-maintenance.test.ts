import assert from 'node:assert/strict';
import type { AssetRecord, HouseholdExpense } from '../src/types';
import { addAssetMaintenanceExpense, buildAssetMaintenanceExpense } from '../src/utils/assetMaintenance';

const asset: AssetRecord = {
  id: 'asset-vehicle-1',
  assetTag: 'SHINE-VEH-001',
  name: 'Toyota Hilux',
  category: 'Vehicles',
  location: 'Main Office',
  condition: 'Good',
  status: 'In Use',
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'Admin',
  updatedBy: 'Admin',
};

const expense = buildAssetMaintenanceExpense({
  asset,
  historyEntryId: 'maint-001',
  expenseId: 'EXP-001',
  date: '2026-11-02',
  workDone: 'Oil and filter service',
  amountMWK: 85000,
  supplier: 'Zomba Auto Services',
  invoiceReference: 'INV-104',
  actor: 'Administration Officer',
  now: '2026-11-02T10:00:00.000Z',
});

assert.equal(expense.category, 'Repairs');
assert.equal(expense.householdId, 'ADMIN_OPERATIONS');
assert.equal(expense.costCentre, 'Administration & Operations');
assert.equal(expense.sourceType, 'asset_maintenance');
assert.equal(expense.sourceRecordId, 'maint-001');
assert.equal(expense.itemDescription, 'Vehicle maintenance — SHINE-VEH-001 Toyota Hilux: Oil and filter service');
assert.equal(expense.quantity, '1');
assert.equal(expense.unit, 'service');
assert.equal(expense.unitCost, 85000);
assert.equal(expense.totalCost, 85000);
assert.equal(expense.amountDue, 85000);
assert.equal(expense.paymentStatus, 'Payment Outstanding');
assert.equal(expense.supplier, 'Zomba Auto Services');
assert.equal(expense.invoiceReference, 'INV-104');
assert.equal(expense.createdBy, 'Administration Officer');
assert.equal(expense.date, '2026-11-02');

assert.throws(() => buildAssetMaintenanceExpense({
  asset, historyEntryId: 'maint-bad', expenseId: 'EXP-BAD', date: '2026-02-30',
  workDone: 'Service', amountMWK: 5000, actor: 'Admin', now: '2026-11-02T10:00:00.000Z',
}), /valid maintenance date/);
assert.throws(() => buildAssetMaintenanceExpense({
  asset, historyEntryId: 'maint-bad', expenseId: 'EXP-BAD', date: '2026-11-02',
  workDone: 'Service', amountMWK: -1, actor: 'Admin', now: '2026-11-02T10:00:00.000Z',
}), /positive maintenance cost/);

const existing = [expense] as HouseholdExpense[];
const duplicate = { ...expense, id: 'EXP-DUPLICATE' };
const duplicateResult = addAssetMaintenanceExpense(existing, duplicate);
assert.equal(duplicateResult.added, false);
assert.equal(duplicateResult.expenses.length, 1);
assert.equal(duplicateResult.expenses[0].id, 'EXP-001');

const distinct = { ...expense, id: 'EXP-002', sourceRecordId: 'maint-002' };
const addedResult = addAssetMaintenanceExpense(existing, distinct);
assert.equal(addedResult.added, true);
assert.equal(addedResult.expenses.length, 2);
assert.equal(addedResult.expenses[0].id, 'EXP-002');

console.log('Asset maintenance finance posting tests passed.');
