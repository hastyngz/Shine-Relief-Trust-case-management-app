import assert from 'node:assert/strict';
import type { InventoryItem, ProcurementList } from '../src/types';
import {
  buildProcurementReceiptMovementId,
  postProcurementReceiptMovements,
  readProcurementReceiptIntent,
  type ProcurementReceiptMovementResult,
  type ProcurementReceiptStorage,
} from '../src/services/procurementInventoryReceipt';

class MemoryStorage implements ProcurementReceiptStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('synthetic quota failure');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

const baseList = (): ProcurementList => ({
  id: 'PRC-1234567',
  title: 'Synthetic school supplies',
  purpose: 'Synthetic regression fixture',
  items: [
    { description: 'Exercise books', quantity: 12, unit: 'packs', priceStatus: 'quoted' },
    { description: 'Cleaning service', quantity: 1, unit: 'service', priceStatus: 'quoted' },
  ],
  totalMWK: 5000,
  status: 'purchased',
  purchaseOrderReference: 'PO-SYNTHETIC',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  createdBy: 'synthetic',
  updatedBy: 'synthetic',
});
const inventoryItems = (): InventoryItem[] => [{
  id: 'stock-books', stockCode: 'SYN-BOOKS', name: 'Exercise books', category: 'Stationery', unit: 'packs',
  quantityOnHand: 4, minimumStockLevel: 1, location: 'Synthetic store', movements: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  createdBy: 'synthetic', updatedBy: 'synthetic',
}, {
  id: 'stock-service', stockCode: 'SYN-SERVICE', name: 'Cleaning service', category: 'Services', unit: 'service',
  quantityOnHand: 0, minimumStockLevel: 0, location: 'Synthetic store', movements: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  createdBy: 'synthetic', updatedBy: 'synthetic',
}];
const choices = [
  { itemIndex: 0, inventoryItemId: 'stock-books' },
  { itemIndex: 1, inventoryItemId: null },
];
function okResult(payload: Record<string, unknown>, date = String(payload.date), duplicate = false): ProcurementReceiptMovementResult {
  return {
    ok: true,
    duplicate,
    movement: {
      id: payload.id,
      inventoryItemId: payload.itemId,
      quantity: payload.quantity,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      sourceLineIndex: payload.sourceLineIndex,
      date,
    },
  };
}

async function main() {
  assert.equal(buildProcurementReceiptMovementId('PRC-1234567', 0), 'prc_PRC-1234567_0');
  assert.throws(() => buildProcurementReceiptMovementId('bad/list', 0), /safe receipt retry ID/);

  {
    const storage = new MemoryStorage();
    const calls: Record<string, unknown>[] = [];
    const result = await postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: inventoryItems(), storage,
      date: '2026-10-27',
      postMovement: async (payload) => { calls.push(payload); return okResult(payload); },
    });
    assert.equal(calls.length, 1, 'explicitly non-inventory lines do not create stock movements');
    assert.equal(calls[0].quantity, 12);
    assert.equal(calls[0].type, 'Received');
    assert.equal(calls[0].reference, 'Procurement PRC-1234567 · line 1 · PO PO-SYNTHETIC');
    assert.equal(calls[0].sourceType, 'procurementReceipt');
    assert.equal(calls[0].sourceId, 'PRC-1234567');
    assert.equal(calls[0].sourceLineIndex, 0);
    assert.equal(calls[0].reason, 'Procurement receipt: Synthetic school supplies');
    assert.deepEqual(result.movementIds, ['prc_PRC-1234567_0']);
    assert.equal(readProcurementReceiptIntent(storage, 'staff-a', 'PRC-1234567')?.date, '2026-10-27');
  }

  {
    const storage = new MemoryStorage();
    let calls = 0;
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices: [{ itemIndex: 0, inventoryItemId: 'stock-books' }], inventoryItems: inventoryItems(), storage,
      postMovement: async () => { calls += 1; return okResult({}); },
    }), /every procurement line/);
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: [{ ...inventoryItems()[0], unit: 'boxes' }], storage,
      postMovement: async () => { calls += 1; return okResult({}); },
    }), /Unit mismatch/);
    assert.equal(calls, 0, 'invalid receipt choices fail before a network write');
    assert.equal(storage.values.size, 0);
  }

  {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    let calls = 0;
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: inventoryItems(), storage,
      postMovement: async () => { calls += 1; return okResult({}); },
    }), /No inventory movement was submitted/);
    assert.equal(calls, 0, 'the intent is durable before the first movement request');
  }

  {
    const storage = new MemoryStorage();
    storage.values.set('shine.procurement-receipt.v1:staff-a:PRC-1234567', '{malformed');
    let calls = 0;
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: inventoryItems(), storage,
      postMovement: async () => { calls += 1; return okResult({}); },
    }), /Saved receipt retry details are invalid/);
    assert.equal(calls, 0, 'corrupt persisted intent must never be silently replaced');
  }

  {
    const storage = new MemoryStorage();
    const calls: Record<string, unknown>[] = [];
    const trackedChoices = [
      { itemIndex: 0, inventoryItemId: 'stock-books' },
      { itemIndex: 1, inventoryItemId: 'stock-service' },
    ];
    let firstAttempt = true;
    const postMovement = async (payload: Record<string, unknown>) => {
      calls.push(payload);
      if (firstAttempt) {
        firstAttempt = false;
        return okResult(payload, '2026-10-26', true);
      }
      if (payload.sourceLineIndex === 1) throw new Error('synthetic network interruption');
      return okResult(payload);
    };
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices: trackedChoices, inventoryItems: inventoryItems(), storage, date: '2026-10-27', postMovement,
    }), /Retry this same receipt/);
    const saved = readProcurementReceiptIntent(storage, 'staff-a', 'PRC-1234567');
    assert.equal(saved?.date, '2026-10-26', 'a prior server movement date is retained across a partial retry');
    assert.equal(calls[0].id, 'prc_PRC-1234567_0');
    assert.equal(calls[1].date, '2026-10-26');
    const retryCalls: Record<string, unknown>[] = [];
    const retried = await postProcurementReceiptMovements({
      uid: 'staff-a', list: { ...baseList(), title: 'Renamed after partial receipt', purchaseOrderReference: 'PO-CHANGED' }, choices: trackedChoices, inventoryItems: inventoryItems(), storage,
      date: '2026-10-28', postMovement: async (payload) => {
        retryCalls.push(payload);
        return payload.sourceLineIndex === 0 ? okResult(payload, '2026-10-26', true) : okResult(payload);
      },
    });
    assert.deepEqual(retryCalls.map((call) => call.id), ['prc_PRC-1234567_0', 'prc_PRC-1234567_1']);
    assert.ok(retryCalls.every((call) => call.date === '2026-10-26'), 'all lines retry with the original server receipt date');
    assert.ok(retryCalls.every((call) => call.reason === 'Procurement receipt: Synthetic school supplies'));
    assert.equal(retryCalls[0].reference, 'Procurement PRC-1234567 · line 1 · PO PO-SYNTHETIC');
    assert.equal(retried.duplicateCount, 1);
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: inventoryItems(), storage,
      postMovement: async () => { throw new Error('must not post a changed mapping'); },
    }), /previous receipt attempt is still pending/);
    assert.equal(readProcurementReceiptIntent(storage, 'staff-b', 'PRC-1234567'), null, 'another account cannot read the saved intent');
  }

  {
    const storage = new MemoryStorage();
    let calls = 0;
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: inventoryItems(), storage, date: '2026-02-30',
      postMovement: async (payload) => { calls += 1; return okResult(payload); },
    }), /valid receipt date/);
    assert.equal(calls, 0, 'an impossible receipt date must fail before any movement is posted');
    assert.equal(storage.values.size, 0, 'an invalid date must not persist a retry intent');
  }

  {
    const storage = new MemoryStorage();
    storage.values.set('shine.procurement-receipt.v1:staff-a:PRC-1234567', JSON.stringify({
      version: 1, uid: 'staff-a', procurementListId: 'PRC-1234567', date: '2026-02-30',
      lines: [{ itemIndex: 0, inventoryItemId: 'stock-books', quantity: 12, unit: 'packs', reference: 'Synthetic reference', reason: 'Synthetic reason' }],
    }));
    assert.equal(readProcurementReceiptIntent(storage, 'staff-a', 'PRC-1234567'), null,
      'a persisted intent with an impossible calendar date must be rejected');
    let calls = 0;
    await assert.rejects(postProcurementReceiptMovements({
      uid: 'staff-a', list: baseList(), choices, inventoryItems: inventoryItems(), storage,
      postMovement: async (payload) => { calls += 1; return okResult(payload); },
    }), /Saved receipt retry details are invalid/);
    assert.equal(calls, 0, 'corrupt date intent must never be silently replaced or posted');
  }

  console.log('Procurement inventory receipt retry tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
