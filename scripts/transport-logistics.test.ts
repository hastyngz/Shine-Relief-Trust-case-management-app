import assert from 'node:assert/strict';
import { buildVehicleServiceOverview, getVehicleServiceDateState } from '../src/utils/transportLogistics';
import type { AssetRecord } from '../src/types';

const base = {
  id: 'asset-1', assetTag: 'VEH-001', name: 'Trust vehicle', category: 'Vehicle',
  location: 'Office', condition: 'Good', status: 'In Use', history: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'Test', updatedBy: 'Test',
} as AssetRecord;

assert.deepEqual(getVehicleServiceDateState('2026-10-31', '2026-11-02'), { state: 'overdue', daysUntilService: -2 });
assert.deepEqual(getVehicleServiceDateState('2026-11-02', '2026-11-02'), { state: 'due_today', daysUntilService: 0 });
assert.deepEqual(getVehicleServiceDateState('2026-11-20', '2026-11-02'), { state: 'due_soon', daysUntilService: 18 });
assert.deepEqual(getVehicleServiceDateState('2026-12-20', '2026-11-02'), { state: 'scheduled', daysUntilService: 48 });
assert.equal(getVehicleServiceDateState(undefined, '2026-11-02').state, 'missing');
assert.equal(getVehicleServiceDateState('2026-02-30', '2026-11-02').state, 'invalid');
assert.equal(getVehicleServiceDateState('2026-12-01', 'not-a-date').state, 'invalid');

const overview = buildVehicleServiceOverview([
  { ...base, id: 'v1', nextServiceDate: '2026-10-31', history: [
    { id: 'm1', date: '2026-10-20', action: 'Maintenance', note: 'Oil and filter service', recordedBy: 'Test', recordedAt: '2026-10-20T10:00:00.000Z', costMWK: 45000, supplier: 'Test Garage', invoiceReference: 'INV-001', linkedExpenseId: 'EXP-001' },
  ] },
  { ...base, id: 'v2', name: 'Motorcycle', category: 'Motorcycle', nextServiceDate: '2026-11-20' },
  { ...base, id: 'v3', name: 'Office printer', category: 'Equipment', nextServiceDate: '2026-11-03' },
  { ...base, id: 'v4', name: 'Disposed van', category: 'Van', status: 'Disposed' },
] as AssetRecord[], '2026-11-02');
assert.equal(overview.vehicleCount, 2);
assert.equal(overview.overdueCount, 1);
assert.equal(overview.dueWithin30DaysCount, 1);
assert.equal(overview.maintenanceRecords.length, 1);
assert.equal(overview.maintenanceRecords[0].linkedExpenseId, 'EXP-001');
assert.equal(overview.maintenanceRecords[0].supplier, 'Test Garage');
console.log('Vehicle service overview tests passed.');
