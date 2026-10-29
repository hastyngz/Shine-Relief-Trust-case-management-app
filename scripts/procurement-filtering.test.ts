import assert from 'node:assert/strict';
import type { ProcurementList } from '../src/types';
import { filterProcurementLists } from '../src/utils/procurementFiltering';

const lists: ProcurementList[] = [
  { id: 'a', title: 'School supplies', purpose: 'Term 1', items: [{ description: 'Exercise books', quantity: 10, unit: 'packs', priceStatus: 'quoted', quotes: [{ supplier: 'Mango Trading', amountMWK: 50000 }] }], totalMWK: 50000, status: 'draft', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'b', title: 'Farm repairs', purpose: 'Pump repair', items: [{ description: 'Pipe fittings', quantity: 4, unit: 'pieces', priceStatus: 'quoted' }], totalMWK: 80000, status: 'approved', purchaseOrderReference: 'PO-FARM-22', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'c', title: 'Office furniture', purpose: 'Desk replacement', items: [{ description: 'Desk', quantity: 1, unit: 'each', priceStatus: 'quoted' }], totalMWK: 120000, status: 'purchased', financeReference: 'INV-7788', createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
];
assert.deepEqual(filterProcurementLists(lists, { search: '', status: 'All' }).map((list) => list.id), ['a', 'b', 'c']);
assert.deepEqual(filterProcurementLists(lists, { search: ' MANGO ', status: 'All' }).map((list) => list.id), ['a']);
assert.deepEqual(filterProcurementLists(lists, { search: 'PO-FARM', status: 'All' }).map((list) => list.id), ['b']);
assert.deepEqual(filterProcurementLists(lists, { search: 'desk', status: 'All' }).map((list) => list.id), ['c']);
assert.deepEqual(filterProcurementLists(lists, { search: '', status: 'approved' }).map((list) => list.id), ['b']);
assert.deepEqual(filterProcurementLists(lists, { search: 'pipe', status: 'draft' }), []);
assert.deepEqual(lists.map((list) => list.id), ['a', 'b', 'c'], 'filtering must not mutate source order');
console.log('Procurement list filter tests passed.');
