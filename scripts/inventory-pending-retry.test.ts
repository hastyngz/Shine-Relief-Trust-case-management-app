import assert from 'node:assert/strict';
import {
  clearPendingInventoryMovement,
  loadPendingInventoryMovement,
  savePendingInventoryMovement,
  type PendingInventoryMovementRequest,
} from '../src/utils/inventory';

const values = new Map<string, string>();
let failWrites = false;
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failWrites) throw new Error('synthetic quota exceeded'); values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });

const pending: PendingInventoryMovementRequest = {
  id: 'mov_synthetic_retry',
  itemId: 'item_synthetic',
  signature: '{"itemId":"item_synthetic","type":"Received","quantity":2}',
  mode: 'movement',
  payload: { type: 'Received', quantity: 2, date: '2026-10-26', reason: 'Synthetic retry test' },
};

assert.equal(savePendingInventoryMovement('uid-a', pending), true);
assert.deepEqual(loadPendingInventoryMovement('uid-a'), pending);
assert.equal(loadPendingInventoryMovement('uid-b'), null, 'one staff workspace must not read another workspace retry');
assert.equal(clearPendingInventoryMovement('uid-a'), true);
assert.equal(loadPendingInventoryMovement('uid-a'), null);

values.set('shine_inventory_pending_movement_uid-a', '{broken json');
assert.equal(loadPendingInventoryMovement('uid-a'), null, 'malformed pending state must fail closed');
values.set('shine_inventory_pending_movement_uid-a', JSON.stringify({ ...pending, mode: 'unknown' }));
assert.equal(loadPendingInventoryMovement('uid-a'), null, 'unsupported pending state must fail closed');

failWrites = true;
assert.equal(savePendingInventoryMovement('uid-a', pending), false, 'quota/write failures must be visible to the caller');
assert.equal(loadPendingInventoryMovement('uid-a'), null, 'failed writes must not create a phantom pending transaction');

console.log('Inventory pending retry persistence tests passed.');
