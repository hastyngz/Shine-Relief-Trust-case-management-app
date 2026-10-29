import assert from 'node:assert/strict';
import { assetExportRows, ASSET_EXPORT_COLUMNS } from '../src/utils/assetExport';
import type { AssetRecord } from '../src/types';

const asset: AssetRecord = {
  id: 'asset-1', assetTag: 'SHINE-001', name: 'Laptop, office', category: 'IT & Electronics',
  location: 'Main Office', condition: 'Good', status: 'In Use', history: [],
  createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
  createdBy: 'Admin', updatedBy: 'Admin',
};
const rows = assetExportRows([asset]);
assert.equal(rows.length, 2);
assert.equal(rows[0][0], 'Asset tag');
assert.equal(rows[0][10], 'Acquisition cost (MWK)');
assert.equal(rows[1][0], 'SHINE-001');
assert.equal(rows[1][1], 'Laptop, office');
assert.equal(rows[1][5], 'Main Office');
assert.equal(ASSET_EXPORT_COLUMNS.length, rows[0].length);
assert.equal(assetExportRows([]).length, 1);
console.log('Asset Word/Excel/PDF export mapping tests passed.');
