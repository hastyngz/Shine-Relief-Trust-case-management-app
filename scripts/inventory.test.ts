import assert from 'node:assert/strict';
import type { InventoryItem } from '../src/types';
import { filterInventoryItems, createInventoryId, getInventoryExpiryStatus, getInventoryStocktakeAdjustment, getLocalDateInputValue, resolveInventoryLocationForSave, summarizeInventoryExpiry } from '../src/utils/inventory';

assert.equal(getLocalDateInputValue(new Date(2026, 9, 15, 12)), '2026-10-15');

const generatedInventoryIds = new Set(Array.from({ length: 1000 }, () => createInventoryId('inv')));
assert.equal(generatedInventoryIds.size, 1000, 'inventory IDs should be unique across a batch');
assert.ok([...generatedInventoryIds].every((id) => id.startsWith('inv_')), 'inventory IDs should retain their type prefix');
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

assert.equal(resolveInventoryLocationForSave('Main Office', 'Farm', true), 'Main Office', 'editing details must not silently move stock');
assert.equal(resolveInventoryLocationForSave(undefined, 'Farm', true), 'Farm', 'legacy records without a location can be repaired');
assert.equal(resolveInventoryLocationForSave(undefined, 'Farm', false), 'Farm', 'new stock items retain their requested opening location');


const inventoryFixture = (overrides: Partial<InventoryItem>): InventoryItem => ({
  id: 'item', stockCode: 'CODE', name: 'Item', category: 'Food & Groceries', unit: 'bags',
  quantityOnHand: 5, minimumStockLevel: 2, location: 'Main Office', movements: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'Test User', updatedBy: 'Test User',
  ...overrides,
});
const filterItems = [
  inventoryFixture({ id: 'rice', name: 'Rice', stockCode: 'FOOD-01', category: 'Food & Groceries', location: 'Main Office', quantityOnHand: 1, minimumStockLevel: 3, expiryDate: '2026-10-20' }),
  inventoryFixture({ id: 'soap', name: 'Soap', stockCode: 'CLEAN-01', category: 'Cleaning Supplies', location: 'Shine House', quantityOnHand: 20, minimumStockLevel: 4, expiryDate: '2026-12-30' }),
  inventoryFixture({ id: 'beans', name: 'Beans', stockCode: 'FOOD-02', category: 'Food & Groceries', location: 'Shine House', quantityOnHand: 8, minimumStockLevel: 2, expiryDate: '2026-11-10' }),
];
assert.deepEqual(filterInventoryItems(filterItems, { category: 'Food & Groceries', today: '2026-10-15' }).map((item) => item.id), ['beans', 'rice']);
assert.deepEqual(filterInventoryItems(filterItems, { location: 'Shine House', today: '2026-10-15' }).map((item) => item.id), ['beans', 'soap']);
assert.deepEqual(filterInventoryItems(filterItems, { stock: 'low', today: '2026-10-15' }).map((item) => item.id), ['rice']);
assert.deepEqual(filterInventoryItems(filterItems, { stock: 'expiry', today: '2026-10-15' }).map((item) => item.id), ['beans', 'rice']);
assert.deepEqual(filterInventoryItems(filterItems, { query: 'clean-01', today: '2026-10-15' }).map((item) => item.id), ['soap']);
assert.deepEqual(filterInventoryItems(filterItems, { category: 'Stationery', today: '2026-10-15' }), []);
console.log('Inventory register filter tests passed.');

const expirySummary = summarizeInventoryExpiry([
  inventoryFixture({ id: 'expired', expiryDate: '2026-10-14' }),
  inventoryFixture({ id: 'soon', expiryDate: '2026-11-14' }),
  inventoryFixture({ id: 'safe', expiryDate: '2026-11-15' }),
  inventoryFixture({ id: 'missing', expiryDate: undefined }),
  inventoryFixture({ id: 'invalid', expiryDate: '2026-02-31' }),
], '2026-10-15');
assert.deepEqual(expirySummary, { expired: 1, expiringSoon: 1, notTracked: 2 });
