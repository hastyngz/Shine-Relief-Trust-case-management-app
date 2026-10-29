import assert from 'node:assert/strict';
import type { InventoryItem, ProcurementList } from '../src/types';
import { postProcurementDeliveryMovements, readProcurementDeliveryIntent, type ProcurementDeliveryStorage } from '../src/services/procurementDelivery';

class MemoryStorage implements ProcurementDeliveryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const list: ProcurementList = {
  id: 'PRC-SYNTHETIC', title: 'Synthetic stationery', purpose: 'Test fixture',
  items: [{ description: 'Exercise books', quantity: 12, unit: 'packs', priceStatus: 'quoted' }, { description: 'Soap', quantity: 5, unit: 'bars', priceStatus: 'quoted' }],
  totalMWK: 9000, status: 'purchased', createdAt: '2026-10-01', updatedAt: '2026-10-01', createdBy: 'synthetic', updatedBy: 'synthetic',
};
const inventory: InventoryItem[] = [{ id: 'stock-books', stockCode: 'SYN-1', name: 'Books', category: 'Stationery', unit: 'packs', quantityOnHand: 0, minimumStockLevel: 0, location: 'Synthetic', movements: [], createdAt: '2026-10-01', updatedAt: '2026-10-01', createdBy: 'synthetic', updatedBy: 'synthetic' }];
const choices = [{ itemIndex: 0, inventoryItemId: 'stock-books' }, { itemIndex: 1, inventoryItemId: null }];
const id = 'delivery_12345678';
function poster(payload: Record<string, unknown>, duplicate = false) {
  return { ok: true as const, duplicate, movement: { id: payload.id, inventoryItemId: payload.itemId, quantity: payload.quantity, sourceType: payload.sourceType, sourceId: payload.sourceId, sourceLineIndex: payload.sourceLineIndex } };
}
async function main() {
  const storage = new MemoryStorage();
  const calls: Record<string, unknown>[] = [];
  let interrupt = true;
  await assert.rejects(postProcurementDeliveryMovements({
    uid: 'synthetic-staff', list, deliveryId: id, date: '2026-10-29', reference: 'DN-SYNTHETIC',
    quantities: [4, 0], choices, inventoryItems: inventory, storage,
    postMovement: async (payload) => { calls.push(payload); if (interrupt) { interrupt = false; throw new Error('synthetic offline'); } return poster(payload, true); },
  }), /Retry this exact delivery/);
  const pending = readProcurementDeliveryIntent(storage, 'synthetic-staff', list.id);
  assert.equal(pending?.deliveryId, id, 'retry identity must survive a failed network request');
  assert.equal(calls[0].quantity, 4);
  const retry = await postProcurementDeliveryMovements({
    uid: 'synthetic-staff', list, deliveryId: id, date: '2026-10-29', reference: 'DN-SYNTHETIC',
    quantities: [4, 0], choices, inventoryItems: inventory, storage,
    postMovement: async (payload) => { calls.push(payload); return poster(payload, true); },
  });
  assert.deepEqual(retry.movementIds, [`prcd_${id.slice(9)}_0`]);
  assert.equal(retry.duplicateCount, 1);
  assert.equal(calls[1].id, calls[0].id, 'retry must use the same server id');
  await assert.rejects(postProcurementDeliveryMovements({
    uid: 'synthetic-staff', list, deliveryId: 'delivery_87654321', date: '2026-10-29', reference: 'DN-CHANGED',
    quantities: [2, 0], choices, inventoryItems: inventory, storage,
    postMovement: async () => { throw new Error('must not send a changed attempt'); },
  }), /previous delivery attempt is pending/);
  await assert.rejects(postProcurementDeliveryMovements({
    uid: 'synthetic-staff', list, deliveryId: 'delivery_87654322', date: '2026-10-29', reference: 'DN-OVER',
    quantities: [13, 0], choices, inventoryItems: inventory, storage: new MemoryStorage(),
    postMovement: async () => { throw new Error('must not send invalid quantity'); },
  }), /exceeds the outstanding quantity/);
  console.log('Procurement partial delivery retry tests passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
