import assert from 'node:assert/strict';
import { buildAssetsCsv, escapeAssetCsvCell } from '../src/utils/assetExport';
import type { AssetRecord } from '../src/types';

assert.equal(escapeAssetCsvCell('plain'), '"plain"');
assert.equal(escapeAssetCsvCell('quote " value'), '"quote "" value"');
assert.equal(escapeAssetCsvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
assert.equal(escapeAssetCsvCell('  @SUM(A1:A2)'), '"\'  @SUM(A1:A2)"');

const asset: AssetRecord = {
  id: 'asset-1', assetTag: 'SHINE-001', name: 'Laptop, office', category: 'IT & Electronics',
  location: 'Main Office', condition: 'Good', status: 'In Use', history: [],
  createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
  createdBy: 'Admin', updatedBy: 'Admin',
};
const csv = buildAssetsCsv([asset]);
assert.ok(csv.includes('"Laptop, office"'));
assert.ok(csv.startsWith('"Asset tag","Name"'));
assert.ok(csv.endsWith('\r\n'));
assert.equal(buildAssetsCsv([]).split('\r\n').length, 2);
console.log('Asset export tests passed.');
