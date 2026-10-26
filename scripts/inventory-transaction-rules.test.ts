import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const projectId = 'demo-shine-inventory-transaction-rules';
let env: RulesTestEnvironment;
const staff = (uid: string, role: string) => ({
  id: uid, uid, email: `${uid}@example.test`, fullName: `Synthetic ${uid}`, role, status: 'Active',
});
const itemFixture = () => ({
  id: 'item-synthetic', stockCode: 'SYN-1', name: 'Synthetic stock item', unit: 'packs',
  location: 'Main Office', quantityOnHand: 10, minimumStockLevel: 0, movements: [],
  createdAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T10:00:00.000Z',
  createdBy: 'manager', updatedBy: 'manager',
});
async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'staffUsers/manager'), staff('manager', 'Manager'));
    await setDoc(doc(db, 'staffUsers/staff'), staff('staff', 'Staff'));
    await setDoc(doc(db, 'staffUsers/viewer'), staff('viewer', 'View Only'));
    await setDoc(doc(db, 'inventoryItems/item-synthetic'), itemFixture());
  });
}
async function applyMovement(uid: string, options: { id?: string; type?: 'Received' | 'Issued' | 'Adjustment'; quantity?: number; previous?: number; next?: number } = {}) {
  const id = options.id || 'mov-synthetic';
  const type = options.type || 'Received';
  const previous = options.previous ?? 10;
  const quantity = options.quantity ?? 3;
  const next = options.next ?? (type === 'Received' ? previous + quantity : type === 'Issued' ? previous - quantity : 7);
  const db = env.authenticatedContext(uid).firestore();
  const itemRef = doc(db, 'inventoryItems/item-synthetic');
  const movementRef = doc(db, `inventoryMovements/${id}`);
  const movement = {
    id, inventoryItemId: 'item-synthetic', type, quantity, date: '2026-10-26',
    location: 'Main Office', reason: 'Synthetic rules fixture', recordedBy: `Synthetic ${uid}`,
    recordedByUid: uid, createdAt: '2026-10-26T10:01:00.000Z', previousQuantity: previous, newQuantity: next,
  };
  const embedded = {
    id, type, quantity, date: movement.date, location: movement.location, reason: movement.reason,
    recordedBy: movement.recordedBy, recordedByUid: uid, createdAt: movement.createdAt,
    previousQuantity: previous, newQuantity: next,
  };
  const batch = writeBatch(db);
  batch.update(itemRef, {
    quantityOnHand: next,
    movements: [embedded],
    lastMovementId: id,
    updatedAt: movement.createdAt,
    updatedBy: movement.recordedBy,
    updatedByUid: uid,
  });
  batch.set(movementRef, movement);
  await batch.commit();
}

async function main() {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
  try {
    await seed();

    const staffDb = env.authenticatedContext('staff').firestore();
    await assertFails(updateDoc(doc(staffDb, 'inventoryItems/item-synthetic'), { quantityOnHand: 999 }));
    await assertSucceeds(applyMovement('staff'));

    await assertFails(updateDoc(doc(staffDb, 'inventoryItems/item-synthetic'), { quantityOnHand: 999 }));
    await assertFails(updateDoc(doc(staffDb, 'inventoryMovements/mov-synthetic'), { quantity: 99 }));
    await assertFails(applyMovement('viewer', { id: 'mov-viewer', previous: 13, next: 14, quantity: 1 }));

    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'inventoryItems/item-synthetic'), {
        ...itemFixture(), quantityOnHand: 2, movements: [],
      });
    });
    await assertFails(applyMovement('staff', { id: 'mov-too-much', type: 'Issued', quantity: 3, previous: 2, next: -1 }));

    console.log('Inventory transaction Firestore rules tests passed.');
  } finally {
    await env.cleanup();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
