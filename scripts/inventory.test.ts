import assert from 'node:assert/strict';
import { getInventoryExpiryStatus, getInventoryStocktakeAdjustment, getLocalDateInputValue } from '../src/utils/inventory';

assert.equal(getLocalDateInputValue(new Date(2026, 9, 15, 12)), '2026-10-15');
assert.deepEqual(getInventoryExpiryStatus(undefined, '2026-10-15'), { status: 'not-tracked', daysRemaining: null });
assert.deepEqual(getInventoryExpiryStatus('not-a-date', '2026-10-15'), { status: 'not-tracked', daysRemaining: null });
assert.deepEqual(getInventoryExpiryStatus('2026-02-31', '2026-10-15'), { status: 'not-tracked', daysRemaining: null });
assert.deepEqual(getInventoryExpiryStatus('2026-10-14', '2026-10-15'), { status: 'expired', daysRemaining: -1 });
assert.deepEqual(getInventoryExpiryStatus('2026-10-15', '2026-10-15'), { status: 'expiring-soon', daysRemaining: 0 });
assert.deepEqual(getInventoryExpiryStatus('2026-11-14', '2026-10-15'), { status: 'expiring-soon', daysRemaining: 30 });
assert.deepEqual(getInventoryExpiryStatus('2026-11-15', '2026-10-15'), { status: 'ok', daysRemaining: 31 });

assert.deepEqual(getInventoryStocktakeAdjustment(10, 13), { previousQuantity: 10, countedQuantity: 13, variance: 3, quantity: 3 });
assert.deepEqual(getInventoryStocktakeAdjustment(10, 7), { previousQuantity: 10, countedQuantity: 7, variance: -3, quantity: 3 });
assert.deepEqual(getInventoryStocktakeAdjustment(10, 10), { previousQuantity: 10, countedQuantity: 10, variance: 0, quantity: 0 });
assert.throws(() => getInventoryStocktakeAdjustment(10, -1), RangeError);
assert.throws(() => getInventoryStocktakeAdjustment(Number.NaN, 1), RangeError);

console.log('Inventory helper tests passed.');
