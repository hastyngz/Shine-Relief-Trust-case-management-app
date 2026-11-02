import assert from 'node:assert/strict';
import type { PettyCashTransaction } from '../src/types';
import {
  createPettyCashTransaction,
  getPettyCashLedgerSummary,
  PETTY_CASH_OPENING_BALANCE_ID,
  validatePettyCashTransaction,
} from '../src/services/pettyCashLedger';

const actor = { uid: 'synthetic-manager', name: 'Synthetic Manager' };
const today = '2026-11-02';
const opening = {
  id: PETTY_CASH_OPENING_BALANCE_ID, date: '2026-11-01', type: 'opening_balance' as const,
  amountMWK: 50000, description: 'Opening petty cash float', reference: 'OPEN-TEST-001',
};
assert.deepEqual(validatePettyCashTransaction([], opening, today), []);
const openingRecord = createPettyCashTransaction(opening, actor, '2026-11-01T08:00:00.000Z');
const transactions: PettyCashTransaction[] = [openingRecord];

const receipt = {
  id: 'PCASH_RECEIPT_001', date: '2026-11-02', type: 'cash_received' as const,
  amountMWK: 10000, description: 'Float replenishment', reference: 'TRANSFER-TEST-001',
};
assert.deepEqual(validatePettyCashTransaction(transactions, receipt, today), []);
transactions.push(createPettyCashTransaction(receipt, actor, '2026-11-02T08:00:00.000Z'));

const expense = {
  id: 'PCASH_EXPENSE_001', date: '2026-11-02', type: 'expense' as const,
  amountMWK: 12000, description: 'Stationery purchase', reference: 'VOUCHER-TEST-001',
};
assert.deepEqual(validatePettyCashTransaction(transactions, expense, today), []);
transactions.push(createPettyCashTransaction(expense, actor, '2026-11-02T09:00:00.000Z'));

const returned = {
  id: 'PCASH_RETURN_001', date: '2026-11-02', type: 'cash_returned' as const,
  amountMWK: 2000, description: 'Unused purchase cash returned', reference: 'RETURN-TEST-001',
};
assert.deepEqual(validatePettyCashTransaction(transactions, returned, today), []);
transactions.push(createPettyCashTransaction(returned, actor, '2026-11-02T10:00:00.000Z'));

const summary = getPettyCashLedgerSummary(transactions);
assert.equal(summary.openingBalanceMWK, 50000);
assert.equal(summary.cashReceivedMWK, 10000);
assert.equal(summary.expensesMWK, 12000);
assert.equal(summary.cashReturnedMWK, 2000);
assert.equal(summary.currentBalanceMWK, 50000);
assert.deepEqual(summary.entries.map((entry) => entry.balanceAfterMWK), [50000, 60000, 48000, 50000]);

assert.ok(validatePettyCashTransaction(transactions, {
  id: 'PCASH_OVERSPEND_001', date: today, type: 'expense', amountMWK: 50001,
  description: 'Overspend test', reference: 'VOUCHER-OVER',
}, today).some((error) => error.includes('exceeds the available')));
assert.ok(validatePettyCashTransaction(transactions, {
  id: PETTY_CASH_OPENING_BALANCE_ID, date: today, type: 'opening_balance', amountMWK: 1,
  description: 'Duplicate opening', reference: 'OPEN-TEST-002',
}, today).some((error) => error.includes('already exists') || error.includes('only be recorded once')));
assert.ok(validatePettyCashTransaction([], {
  id: 'PCASH_WITHOUT_OPENING', date: today, type: 'expense', amountMWK: 1,
  description: 'Missing float', reference: 'VOUCHER-001',
}, today).some((error) => error.includes('opening cash float')));
assert.ok(validatePettyCashTransaction(transactions, {
  id: 'PCASH_BACKDATED_001', date: '2026-10-31', type: 'cash_received', amountMWK: 1,
  description: 'Backdated entry', reference: 'TRANSFER-001',
}, today).some((error) => error.includes('Backdated')));
assert.ok(validatePettyCashTransaction(transactions, {
  id: 'PCASH_NO_REFERENCE', date: today, type: 'cash_received', amountMWK: 1,
  description: 'Missing reference', reference: ' ',
}, today).some((error) => error.includes('reference')));
assert.ok(validatePettyCashTransaction(transactions, {
  id: 'PCASH_FUTURE_001', date: '2026-11-03', type: 'cash_received', amountMWK: 1,
  description: 'Future entry', reference: 'TRANSFER-002',
}, today).some((error) => error.includes('not in the future')));

console.log('Petty-cash ledger tests passed.');
