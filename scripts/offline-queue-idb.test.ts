import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Regression test for the offline queue's IndexedDB store.
//
// The store used to be keyed by `collection` alone, so two changed records in
// the same collection overwrote each other and an edit was silently lost. The
// queue must keep every (collection, recordId) pair.
// ---------------------------------------------------------------------------

const values = new Map<string, string>();
const fakeWindow: any = {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fakeWindow.localStorage });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, storage: undefined } });

const { setActiveWorkspaceUid } = await import('../src/services/accountWorkspace');
setActiveWorkspaceUid('synthetic-manager-uid');
const { saveQueueEntries, loadQueueEntries, inspectUnownedLegacyIndexedDbState } = await import('../src/services/offlineSyncDb');

const entry = (collection: string, recordId: string, fullName: string) => ({
  ownerUid: 'synthetic-manager-uid',
  collection,
  recordId,
  operation: 'set' as const,
  data: { id: recordId, fullName, updatedAt: '2026-01-01T00:00:00.000Z' },
  baseUpdatedAt: '2025-12-31T00:00:00.000Z',
  queuedAt: '2026-01-01T00:00:00.000Z',
});

// Two different girls, plus another collection — all must survive a save/load.
const entries = [
  entry('girls', 'SG-001', 'First girl'),
  entry('girls', 'SG-002', 'Second girl'),
  entry('households', 'SH-01', 'Household'),
];
await saveQueueEntries(entries);

const reloaded = await loadQueueEntries();
assert.equal(reloaded.length, 3, 'every queued entry must be persisted, none overwritten');

const byKey = new Map(reloaded.map((item) => [`${item.collection}/${item.recordId}`, item]));
assert.equal(byKey.get('girls/SG-001')?.data?.fullName, 'First girl');
assert.equal(byKey.get('girls/SG-002')?.data?.fullName, 'Second girl');
assert.equal(byKey.get('households/SH-01')?.data?.fullName, 'Household');

// Every entry read back carries its composite storage key.
for (const item of reloaded) {
  assert.equal(item.queueKey, `${item.collection}/${item.recordId}`);
}

setActiveWorkspaceUid('synthetic-staff-uid');
assert.equal((await loadQueueEntries()).length, 0, 'a second UID must not read the manager queue');
await saveQueueEntries([{
  ownerUid: 'synthetic-staff-uid',
  collection: 'girls',
  recordId: 'SG-003',
  operation: 'set',
  data: { id: 'SG-003', fullName: 'Staff-only synthetic edit', updatedAt: '2026-01-01T00:00:00.000Z' },
  baseUpdatedAt: null,
  queuedAt: '2026-01-01T00:00:00.000Z',
}]);
setActiveWorkspaceUid('synthetic-manager-uid');
assert.equal((await loadQueueEntries()).length, 3, 'switching back must preserve the manager queue');
assert.equal(await inspectUnownedLegacyIndexedDbState(), 'clear', 'the old device-wide DB is clear only when absent');

// Simulate the previous v1 schema for a UID-scoped database. Opening v2 must
// migrate the surviving row, not drop the queue during a key-path upgrade.
const upgradeUid = 'synthetic-upgrade-uid';
const upgradeDbName = `shine_relief_trust_offline_v3::uid:${encodeURIComponent(upgradeUid)}`;
const oldDbRequest = indexedDB.open(upgradeDbName, 1);
const oldDb = await new Promise<IDBDatabase>((resolve, reject) => {
  oldDbRequest.onupgradeneeded = () => oldDbRequest.result.createObjectStore('queue', { keyPath: 'collection' });
  oldDbRequest.onsuccess = () => resolve(oldDbRequest.result);
  oldDbRequest.onerror = () => reject(oldDbRequest.error);
});
await new Promise<void>((resolve, reject) => {
  const tx = oldDb.transaction('queue', 'readwrite');
  tx.objectStore('queue').put({
    collection: 'girls', recordId: 'SG-UPGRADE-01', operation: 'set',
    data: { id: 'SG-UPGRADE-01', fullName: 'Legacy queued edit' },
    baseUpdatedAt: '2026-01-01T00:00:00.000Z', queuedAt: '2026-01-02T00:00:00.000Z',
  });
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});
oldDb.close();
setActiveWorkspaceUid(upgradeUid);
const migratedLegacyQueue = await loadQueueEntries();
assert.equal(migratedLegacyQueue.length, 1, 'v1 queue rows survive the composite-key schema upgrade');
assert.equal(migratedLegacyQueue[0].recordId, 'SG-UPGRADE-01');
assert.equal(migratedLegacyQueue[0].ownerUid, upgradeUid, 'legacy rows inherit only their UID-scoped database owner');
assert.equal(migratedLegacyQueue[0].queueKey, 'girls/SG-UPGRADE-01');

// A foreign owner must abort migration and leave the original v1 row readable.
const badUpgradeUid = 'synthetic-bad-upgrade-uid';
const badUpgradeName = `shine_relief_trust_offline_v3::uid:${encodeURIComponent(badUpgradeUid)}`;
const badRequest = indexedDB.open(badUpgradeName, 1);
const badDb = await new Promise<IDBDatabase>((resolve, reject) => {
  badRequest.onupgradeneeded = () => badRequest.result.createObjectStore('queue', { keyPath: 'collection' });
  badRequest.onsuccess = () => resolve(badRequest.result);
  badRequest.onerror = () => reject(badRequest.error);
});
await new Promise<void>((resolve, reject) => {
  const tx = badDb.transaction('queue', 'readwrite');
  tx.objectStore('queue').put({ ownerUid: 'synthetic-foreign-owner', collection: 'girls', recordId: 'SG-FOREIGN', operation: 'set', data: { id: 'SG-FOREIGN' } });
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});
badDb.close();
setActiveWorkspaceUid(badUpgradeUid);
await assert.rejects(loadQueueEntries(), /schema upgrade was blocked/i, 'unsafe migration must fail closed instead of returning an empty fallback');
const preservedBadDb = await new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(badUpgradeName);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
await new Promise<void>((resolve, reject) => {
  const req = preservedBadDb.transaction('queue', 'readonly').objectStore('queue').get('girls');
  req.onsuccess = () => { assert.equal(req.result.recordId, 'SG-FOREIGN'); resolve(); };
  req.onerror = () => reject(req.error);
});
preservedBadDb.close();
setActiveWorkspaceUid('synthetic-manager-uid');

const legacyName = 'shine_relief_trust_offline';
const legacyRequest = indexedDB.open(legacyName, 1);
const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
  legacyRequest.onupgradeneeded = () => legacyRequest.result.createObjectStore('queue', { keyPath: 'queueKey' });
  legacyRequest.onsuccess = () => resolve(legacyRequest.result);
  legacyRequest.onerror = () => reject(legacyRequest.error);
});
await new Promise<void>((resolve, reject) => {
  const tx = legacyDb.transaction('queue', 'readwrite');
  tx.objectStore('queue').put({ queueKey: 'girls/SG-LEGACY', collection: 'girls', recordId: 'SG-LEGACY', operation: 'set', data: { id: 'SG-LEGACY' } });
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});
legacyDb.close();
assert.equal(await inspectUnownedLegacyIndexedDbState(), 'pending', 'unowned legacy IndexedDB edits block destructive restore inspection');
await new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase(legacyName);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});
assert.equal(await inspectUnownedLegacyIndexedDbState(), 'clear', 'the test fixture is clear after its explicit deletion');
console.log('Offline queue IndexedDB tests passed: account isolation, composite keys, and legacy queue quarantine.');
