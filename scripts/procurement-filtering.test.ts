import assert from 'node:assert/strict';
import type { ProcurementList } from '../src/types';
import { filterProcurementLists } from '../src/utils/procurementFiltering';

const lists: ProcurementList[] = [
  { id: 'a', title: 'School supplies', purpose: 'Term 1', items: [{ description: 'Exercise books', quantity: 10, unit: 'packs', priceStatus: 'quoted', quotes: [{ supplier: 'Mango Trading', amountMWK: 50000 }] }], totalMWK: 50000, status: 'draft', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'b', title: 'Farm repairs', purpose: 'Pump repair', items: [{ description: 'Pipe fittings', quantity: 4, unit: 'pieces', priceStatus: 'quoted' }], totalMWK: 80000, status: 'approved', purchaseOrderReference: 'PO-FARM-22', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'c', title: 'Office furniture', purpose: 'Desk replacement', items: [{ description: 'Desk', quantity: 1, unit: 'each', priceStatus: 'quoted' }], totalMWK: 120000, status: 'purchased', financeReference: 'INV-7788', receivedAt: '2026-10-20', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'd', title: 'Kitchen stock', purpose: 'Monthly supplies', items: [{ description: 'Cooking oil', quantity: 5, unit: 'bottles', priceStatus: 'quoted' }], totalMWK: 30000, status: 'purchased', receivedAt: '2026-10-21', financeHandedOverAt: '2026-10-22', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'e', title: 'Pump parts', purpose: 'Urgent replacement', items: [{ description: 'Valve', quantity: 2, unit: 'pieces', priceStatus: 'quoted' }], totalMWK: 45000, status: 'purchased', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
];
const filter = (search = '', status: 'All' | ProcurementList['status'] = 'All', stage: 'All' | 'Awaiting receipt' | 'Received - finance pending' | 'Handed to finance' = 'All') =>
  filterProcurementLists(lists, { search, status, stage });

assert.deepEqual(filter().map((list) => list.id), ['a', 'b', 'c', 'd', 'e']);
assert.deepEqual(filter(' MANGO ').map((list) => list.id), ['a']);
assert.deepEqual(filter('PO-FARM').map((list) => list.id), ['b']);
assert.deepEqual(filter('desk').map((list) => list.id), ['c']);
assert.deepEqual(filter('', 'approved').map((list) => list.id), ['b']);
assert.deepEqual(filter('pipe', 'draft'), []);
assert.deepEqual(filter('', 'All', 'Awaiting receipt').map((list) => list.id), ['e']);
assert.deepEqual(filter('', 'All', 'Received - finance pending').map((list) => list.id), ['c']);
assert.deepEqual(filter('', 'All', 'Handed to finance').map((list) => list.id), ['d']);
assert.deepEqual(filter('oil', 'All', 'Handed to finance').map((list) => list.id), ['d']);
assert.deepEqual(lists.map((list) => list.id), ['a', 'b', 'c', 'd', 'e'], 'filtering must not mutate source order');
console.log('Procurement list filter tests passed.');
