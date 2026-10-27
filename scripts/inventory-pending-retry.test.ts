import assert from 'node:assert/strict';
import { clearPendingInventoryMovement, flushPendingInventoryMovements, loadPendingInventoryMovement, loadPendingInventoryMovements, markPendingInventoryMovementRejected, savePendingInventoryMovement, type PendingInventoryMovementRequest } from '../src/utils/inventory';
const values = new Map<string, string>(); let failWrites = false;
const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrites) throw new Error('synthetic quota exceeded'); values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
const makePending = (id: string, quantity: number): PendingInventoryMovementRequest => ({ id, itemId: 'item_synthetic', signature: JSON.stringify({ itemId: 'item_synthetic', type: 'Received', quantity }), mode: 'movement', payload: { type: 'Received', quantity, date: '2026-10-26', reason: 'Synthetic retry test' } });
const first=makePending('mov_synthetic_first',2), second=makePending('mov_synthetic_second',3), third=makePending('mov_synthetic_third',4);
assert.equal(savePendingInventoryMovement('uid-a',first),true);
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[first]);
assert.deepEqual(loadPendingInventoryMovement('uid-a'),first);
assert.equal(loadPendingInventoryMovements('uid-b')?.length,0);
assert.equal(savePendingInventoryMovement('uid-a',second),true);
assert.equal(savePendingInventoryMovement('uid-a',third),true);
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[first,second,third],'FIFO order is preserved');
// A rejected request remains persisted unless staff explicitly removes the FIFO head.
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[first,second,third],'rejected request remains persisted until explicit removal');
assert.equal(savePendingInventoryMovement('uid-a',first),true,'identical ID retry is idempotent');
assert.equal(savePendingInventoryMovement('uid-a',{...first,payload:{type:'Received',quantity:99}}),false,'same ID cannot overwrite payload');
assert.equal(savePendingInventoryMovement('uid-a',{...second,id:first.id}),false,'duplicate IDs cannot collapse entries');
assert.equal(clearPendingInventoryMovement('uid-a',second.id),false,'cannot remove out of order');
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[first,second,third]);
assert.equal(clearPendingInventoryMovement('uid-a',first.id),true);
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[second,third]);
assert.equal(clearPendingInventoryMovement('uid-a'),true);
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[third]);
assert.equal(clearPendingInventoryMovement('uid-a'),true);
assert.deepEqual(loadPendingInventoryMovements('uid-a'),[]);
const rejectedUid = 'uid-rejected';
assert.equal(savePendingInventoryMovement(rejectedUid, first), true);
assert.equal(savePendingInventoryMovement(rejectedUid, second), true);
assert.equal(markPendingInventoryMovementRejected(rejectedUid, second.id), false, 'a later entry cannot be marked rejected ahead of the head');
assert.equal(markPendingInventoryMovementRejected(rejectedUid, first.id), true, 'the FIFO head can be marked for review');
assert.deepEqual(loadPendingInventoryMovements(rejectedUid), [{ ...first, status: 'needs-review' }, second], 'rejection review state persists in storage');
assert.equal(markPendingInventoryMovementRejected(rejectedUid, first.id), true, 'marking the same rejection is idempotent');
assert.equal(clearPendingInventoryMovement(rejectedUid, first.id), true, 'staff-confirmed discard removes the rejected head');
assert.deepEqual(loadPendingInventoryMovements(rejectedUid), [second], 'discard does not remove later queued entries');

const legacyKey='shine_inventory_pending_movement_uid-legacy'; values.set(legacyKey,JSON.stringify(first));
assert.deepEqual(loadPendingInventoryMovements('uid-legacy'),[first],'legacy object remains readable');
assert.equal(savePendingInventoryMovement('uid-legacy',second),true);
assert.deepEqual(loadPendingInventoryMovements('uid-legacy'),[first,second],'legacy object safely upgrades on append');
values.set('shine_inventory_pending_movement_uid-corrupt','{broken json');
assert.equal(loadPendingInventoryMovements('uid-corrupt'),null);
assert.equal(savePendingInventoryMovement('uid-corrupt',first),false);
values.set('shine_inventory_pending_movement_uid-duplicate',JSON.stringify([first,first]));
assert.equal(loadPendingInventoryMovements('uid-duplicate'),null);
values.set('shine_inventory_pending_movement_uid-unsupported',JSON.stringify([{...first,mode:'unknown'}]));
assert.equal(loadPendingInventoryMovements('uid-unsupported'),null);
failWrites=true; assert.equal(savePendingInventoryMovement('uid-write-failure',first),false); assert.deepEqual(loadPendingInventoryMovements('uid-write-failure'),[]); failWrites=false;
console.log('Inventory pending FIFO queue tests passed.');


// Reconnect flushing must preserve FIFO order, stop on uncertain failures, and never auto-submit a rejected head.
const flushUid = 'uid-flush';
assert.equal(savePendingInventoryMovement(flushUid, first), true);
assert.equal(savePendingInventoryMovement(flushUid, second), true);
assert.equal(savePendingInventoryMovement(flushUid, third), true);
const sent: string[] = [];
const flushed = await flushPendingInventoryMovements(flushUid, async (entry) => { sent.push(entry.id); });
assert.deepEqual(sent, [first.id, second.id, third.id], 'reconnect flush submits transactions in FIFO order');
assert.deepEqual(flushed, { status: 'empty', processed: 3 });
assert.deepEqual(loadPendingInventoryMovements(flushUid), [], 'confirmed entries are removed one by one');

const interruptedUid = 'uid-flush-interrupted';
assert.equal(savePendingInventoryMovement(interruptedUid, first), true);
assert.equal(savePendingInventoryMovement(interruptedUid, second), true);
assert.equal(savePendingInventoryMovement(interruptedUid, third), true);
const interruptedSent: string[] = [];
const interrupted = await flushPendingInventoryMovements(interruptedUid, async (entry) => {
  interruptedSent.push(entry.id);
  if (entry.id === second.id) throw new Error('synthetic network interruption');
});
assert.deepEqual(interruptedSent, [first.id, second.id]);
assert.deepEqual(interrupted, { status: 'failed', processed: 1, failedId: second.id });
assert.deepEqual(loadPendingInventoryMovements(interruptedUid)?.map((entry) => entry.id), [second.id, third.id], 'failed head and later entries remain queued');

const rejectedUidForFlush = 'uid-flush-rejected';
assert.equal(savePendingInventoryMovement(rejectedUidForFlush, first), true);
assert.equal(savePendingInventoryMovement(rejectedUidForFlush, second), true);
const rejectedSent: string[] = [];
const rejected = await flushPendingInventoryMovements(rejectedUidForFlush, async (entry) => {
  rejectedSent.push(entry.id);
  const error = new Error('synthetic definitive rejection') as Error & { status?: number };
  error.status = 422;
  throw error;
});
assert.deepEqual(rejectedSent, [first.id]);
assert.deepEqual(rejected, { status: 'needs-review', processed: 0, failedId: first.id });
assert.equal(loadPendingInventoryMovements(rejectedUidForFlush)?.[0]?.status, 'needs-review');
const retryRejected = await flushPendingInventoryMovements(rejectedUidForFlush, async () => { throw new Error('must not be called'); });
assert.deepEqual(retryRejected, { status: 'needs-review', processed: 0, failedId: first.id }, 'needs-review head blocks automatic retry and later entries');
console.log('Inventory reconnect flush tests passed.');
