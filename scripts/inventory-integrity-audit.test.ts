import assert from 'node:assert/strict';
import { auditInventorySnapshot } from '../src/utils/inventoryIntegrityAudit';

const cleanMovement = {
  id: 'mov_synthetic_1',
  type: 'Received',
  quantity: 10,
  date: '2026-10-26',
  location: 'Main Office',
  reason: 'Synthetic opening balance',
  recordedBy: 'Synthetic Staff',
  recordedByUid: 'synthetic-uid-1',
  createdAt: '2026-10-26T12:00:00.000Z',
};
const cleanSnapshot = {
  inventoryItems: [
    { id: 'synthetic-item-1', stockCode: 'ST-001', quantityOnHand: 10, minimumStockLevel: 2, unitCostMWK: 1500, movements: [cleanMovement] },
    { id: 'synthetic-item-2', stockCode: 'ST-002', quantityOnHand: 0, minimumStockLevel: 0, movements: [{
      ...cleanMovement,
      id: 'mov_synthetic_2',
      type: 'Adjustment',
      quantity: 0,
      reason: 'Synthetic no-variance stocktake',
    }] },
  ],
};
const cleanSnapshotBefore = JSON.stringify(cleanSnapshot);
assert.deepEqual(auditInventorySnapshot(cleanSnapshot), {
  totalItems: 2,
  malformedItemRecords: 0,
  invalidBalanceItems: 0,
  invalidMinimumStockLevelItems: 0,
  invalidUnitCostItems: 0,
  missingStockCodeItems: 0,
  duplicateStockCodeGroups: 0,
  extraDuplicateStockCodeItems: 0,
  malformedMovementLists: 0,
  malformedMovementEntries: 0,
  movementsWithInvalidDates: 0,
  movementsMissingActorUid: 0,
  movementsMissingCreatedAt: 0,
  duplicateMovementIdGroups: 0,
  extraDuplicateMovementEntries: 0,
  hasFindings: false,
});
assert.equal(JSON.stringify(cleanSnapshot), cleanSnapshotBefore, 'auditing must not mutate the snapshot');

const findings = auditInventorySnapshot({
  inventoryItems: [
    {
      id: 'synthetic-item-a',
      stockCode: ' DUP-1 ',
      quantityOnHand: -1,
      minimumStockLevel: Number.POSITIVE_INFINITY,
      unitCostMWK: -0.5,
      movements: [{
        id: 'mov_duplicate',
        type: 'Received',
        quantity: Number.NaN,
        date: '',
        location: '',
        reason: '',
        recordedBy: '',
      }],
    },
    {
      id: 'synthetic-item-b',
      stockCode: 'dup-1',
      quantityOnHand: Number.POSITIVE_INFINITY,
      minimumStockLevel: -1,
      unitCostMWK: 'invalid',
      movements: null,
    },
    {
      id: 'synthetic-item-c',
      stockCode: 'ST-003',
      quantityOnHand: 0,
      minimumStockLevel: 0,
      movements: [{ ...cleanMovement, id: 'mov_duplicate', type: 'Unknown movement' }, { ...cleanMovement, id: 'mov_invalid_date', date: '2026-02-31' }],
    },
    null,
  ],
});
assert.equal(findings.totalItems, 4);
assert.equal(findings.malformedItemRecords, 1);
assert.equal(findings.invalidBalanceItems, 2);
assert.equal(findings.invalidMinimumStockLevelItems, 2);
assert.equal(findings.invalidUnitCostItems, 2);
assert.equal(findings.duplicateStockCodeGroups, 1);
assert.equal(findings.extraDuplicateStockCodeItems, 1);
assert.equal(findings.malformedMovementLists, 1);
assert.equal(findings.malformedMovementEntries, 3);
assert.equal(findings.movementsWithInvalidDates, 2, 'empty and impossible movement dates must be counted');
assert.equal(findings.movementsMissingActorUid, 1);
assert.equal(findings.movementsMissingCreatedAt, 1);
assert.equal(findings.duplicateMovementIdGroups, 1);
assert.equal(findings.extraDuplicateMovementEntries, 1);
assert.equal(findings.hasFindings, true);
assert.equal(JSON.stringify(findings).includes('synthetic-item'), false, 'summary must not emit item identifiers');
assert.equal(JSON.stringify(findings).includes('Synthetic Staff'), false, 'summary must not emit user data');

assert.throws(() => auditInventorySnapshot(null), /Snapshot must be a database export/);
assert.throws(() => auditInventorySnapshot({}), /inventoryItems array/);

console.log('Inventory integrity audit tests passed.');
