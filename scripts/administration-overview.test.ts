import assert from 'node:assert/strict';
import type { AppDatabase } from '../src/types';
import { getAdministrationAttention } from '../src/utils/administrationOverview';

const empty = {} as AppDatabase;
assert.deepEqual(getAdministrationAttention(empty, '2026-10-15'), {
  lowStockItems: 0, stockExpiryAlerts: 0, assetsNeedingAttention: 0, overdueCompliance: 0, openProcurementLists: 0,
});
const db = {
  inventoryItems: [
    { id: 'i1', quantityOnHand: 2, minimumStockLevel: 2, expiryDate: '2026-10-15' },
    { id: 'i2', quantityOnHand: 10, minimumStockLevel: 2, expiryDate: '2026-11-14' },
    { id: 'i3', quantityOnHand: 0, minimumStockLevel: 0, expiryDate: 'invalid' },
  ],
  assets: [
    { id: 'a1', status: 'Missing', condition: 'Good' },
    { id: 'a2', status: 'In Use', condition: 'Good', nextServiceDate: '2026-11-14' },
    { id: 'a3', status: 'Disposed', condition: 'Needs Repair', warrantyExpiryDate: '2026-10-20' },
    { id: 'a4', status: 'In Use', condition: 'Damaged' },
  ],
  schedules: [
    { id: 's1', complianceCategory: 'Procurement', status: 'Scheduled', scheduledDate: '2026-10-14' },
    { id: 's2', complianceCategory: 'Procurement', status: 'Completed', scheduledDate: '2026-10-10' },
    { id: 's3', status: 'Scheduled', scheduledDate: '2026-10-01' },
  ],
  procurementLists: [
    { id: 'p1', status: 'draft' }, { id: 'p2', status: 'approved' }, { id: 'p3', status: 'purchased' },
  ],
} as unknown as AppDatabase;
assert.deepEqual(getAdministrationAttention(db, '2026-10-15'), {
  lowStockItems: 1, stockExpiryAlerts: 2, assetsNeedingAttention: 3, overdueCompliance: 1, openProcurementLists: 2,
});
assert.deepEqual(getAdministrationAttention(db, 'invalid'), {
  lowStockItems: 1, stockExpiryAlerts: 0, assetsNeedingAttention: 1, overdueCompliance: 0, openProcurementLists: 2,
});
console.log('Administration operational attention summary tests passed.');
