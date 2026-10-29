import assert from 'node:assert/strict';
import type { AssetRecord } from '../src/types';
import { filterAssetRegister } from '../src/utils/assetFiltering';

const assets: AssetRecord[] = [
  { id: 'a', assetTag: 'AST-02', name: 'Desk', category: 'Furniture', location: 'Office', condition: 'Fair', status: 'In Storage', history: [], createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'b', assetTag: 'AST-01', name: 'Laptop', category: 'IT & Electronics', location: 'Office', condition: 'Good', status: 'In Use', history: [], createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
  { id: 'c', assetTag: 'AST-03', name: 'Tablet', category: 'IT & Electronics', location: 'Farm', condition: 'Damaged', status: 'Under Repair', history: [], createdAt: '', updatedAt: '', createdBy: '', updatedBy: '' },
];
const base = { search: '', status: 'All' as const, condition: 'All' as const, category: 'All' as const };
assert.deepEqual(filterAssetRegister(assets, base).map((asset) => asset.id), ['a', 'b', 'c']);
assert.deepEqual(filterAssetRegister(assets, { ...base, category: 'IT & Electronics' }).map((asset) => asset.id), ['b', 'c']);
assert.deepEqual(filterAssetRegister(assets, { ...base, status: 'In Use' }).map((asset) => asset.id), ['b']);
assert.deepEqual(filterAssetRegister(assets, { ...base, condition: 'Damaged' }).map((asset) => asset.id), ['c']);
assert.deepEqual(filterAssetRegister(assets, { ...base, search: ' FARM ' }).map((asset) => asset.id), ['c']);
assert.deepEqual(filterAssetRegister(assets, { ...base, category: 'Furniture', status: 'In Use' }), []);
assert.deepEqual(assets.map((asset) => asset.id), ['a', 'b', 'c'], 'filtering must not mutate the input list');
console.log('Asset register filter tests passed.');
