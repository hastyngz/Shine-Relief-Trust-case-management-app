import assert from 'node:assert/strict';
import { register } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Firestore is replaced with an in-memory fake so the transactional flush can
// be exercised without a real Firebase project. The fake records every write
// and models updatedAt-based conflict detection exactly like production code.
// ---------------------------------------------------------------------------
const firestoreFakeSource = `
const serverRecords = new Map();
export const __server = {
  seed(collection, id, data) { serverRecords.set(collection + '/' + id, { ...data }); },
  get(collection, id) { return serverRecords.get(collection + '/' + id); },
  all() { return [...serverRecords.entries()]; },
  reset() { serverRecords.clear(); },
};
export function doc(_db, collection, id) {
  if (arguments.length === 2) return { collection: _db.__name, id: collection };
  return { collection, id };
}
export function collection(_db, name) { return { __name: name }; }
export async function getDocs() { return { docs: [], empty: true }; }
export async function getDoc(ref) {
  const value = serverRecords.get(ref.collection + '/' + ref.id);
  return { exists: () => value !== undefined, data: () => (value ? { ...value } : undefined) };
}
export async function setDoc(ref, data) { serverRecords.set(ref.collection + '/' + ref.id, { ...data }); }
export async function deleteDoc(ref) { serverRecords.delete(ref.collection + '/' + ref.id); }
export function writeBatch() {
  return { set: (ref, data) => setDoc(ref, data), delete: (ref) => deleteDoc(ref), commit: async () => {} };
}
export async function runTransaction(_db, updater) {
  const transaction = {
    get: (ref) => getDoc(ref),
    set: (ref, data) => setDoc(ref, data),
    delete: (ref) => deleteDoc(ref),
  };
  return updater(transaction);
}
export function onSnapshot() { return () => {}; }
export function query(...args) { return args; }
export function where(...args) { return args; }
export function orderBy(...args) { return args; }
export function limit(...args) { return args; }
export function getFirestore() { return {}; }
export function initializeFirestore() { return {}; }
`;

const tmpRoot = os.tmpdir();
const fakeFirestorePath = path.join(tmpRoot, 'shine-offline-test-firestore-fake.mjs');
writeFileSync(fakeFirestorePath, firestoreFakeSource);
const fakeFirebasePath = path.join(tmpRoot, 'shine-offline-test-firebase-fake.mjs');
writeFileSync(fakeFirebasePath, [
  'export const app = {};',
  'export const firestore = {};',
  'export const auth = {};',
  'export function initializeApp() { return app; }',
  'export function getApps() { return []; }',
  'export function getApp() { return app; }',
  'export function getFirestore() { return firestore; }',
  'export function getAuth() { return auth; }',
  'export default firestore;',
  '',
].join('\n'));
const fakeFirebaseAuthPath = path.join(tmpRoot, 'shine-offline-test-firebase-auth-fake.mjs');
writeFileSync(fakeFirebaseAuthPath, [
  'export const auth = {};',
  'export function getAuth() { return auth; }',
  'export function onAuthStateChanged() { return () => {}; }',
  'export default auth;',
  '',
].join('\n'));

const loaderSource = `
export async function resolve(specifier, context, next) {
  if (specifier === 'firebase/firestore') {
    return { url: ${JSON.stringify('file://' + fakeFirestorePath)}, shortCircuit: true };
  }
  if (specifier === 'firebase/app') {
    return { url: ${JSON.stringify('file://' + fakeFirebasePath)}, shortCircuit: true };
  }
  if (specifier === 'firebase/auth') {
    return { url: ${JSON.stringify('file://' + fakeFirebaseAuthPath)}, shortCircuit: true };
  }
  return next(specifier, context);
}
`;
const loaderPath = path.join(tmpRoot, 'shine-offline-test-loader.mjs');
writeFileSync(loaderPath, loaderSource);
register(new URL(`file://${loaderPath}`).href, import.meta.url);

// Browser globals used by the queue persistence and the IndexedDB fallback.
const values = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const fakeWindow: any = {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  },
  dispatchEvent: (event: any) => {
    listeners.get(event?.type)?.forEach((listener) => listener());
    return true;
  },
  addEventListener: (type: string, listener: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener);
  },
  removeEventListener: (type: string, listener: () => void) => {
    listeners.get(type)?.delete(listener);
  },
};
class FakeEvent { constructor(public type: string) {} }
Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fakeWindow.localStorage });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, storage: undefined } });
Object.defineProperty(globalThis, 'Event', { configurable: true, value: FakeEvent });

const { computeChangeEntries, migrateLegacySnapshots, recordOfflineChanges, flushPendingOfflineSnapshots, getPendingOfflineSnapshotCount, readSyncConflicts, resolveSyncConflict, setLastSyncedSnapshot, loadQueue, isConfirmedServerSnapshot, persistQueue, clearOfflineChangesAfterDatabaseReset, markDatabaseResetRecoveryRequired, isDatabaseResetRecoveryRequired, inspectPendingOfflineChanges } = await import('../src/services/offlineSync');
const { __server } = await import('firebase/firestore') as unknown as { __server: any };
const server: any = __server;
const { syncChangeEntriesToFirestore } = await import('../src/services/firestoreSync');

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-01T11:00:00.000Z';
const T3 = '2026-01-01T12:00:00.000Z';

function girl(id: string, updatedAt: string, name = 'Girl ' + id) {
  return { id, fullName: name, updatedAt, createdAt: T1 } as any;
}
function db(partial: Record<string, any> = {}): any {
  return { girls: [], households: [], educationalFollowUps: [], healthFollowUps: [], familyFollowUps: [], rentPayments: [], expenses: [], householdActivities: [], ...partial };
}

// --- 1. Diffing only queues changed records ---------------------------------
const baseline = db({ girls: [girl('SG-001', T1), girl('SG-002', T1)] });
const edited = db({ girls: [girl('SG-001', T1, 'Renamed girl'), girl('SG-002', T1)] });
const entries = computeChangeEntries(edited, baseline);
assert.equal(entries.length, 1, 'only the edited record should be queued');
assert.equal(entries[0].recordId, 'SG-001');
assert.equal(entries[0].operation, 'set');
assert.equal(entries[0].baseUpdatedAt, T1, 'baseUpdatedAt records the version this device last saw');

// Untouched records are never queued, so they cannot overwrite newer edits.
const untouched = computeChangeEntries(baseline, baseline);
assert.equal(untouched.length, 0);

// Contact creation and edits must use the same per-record queue as other
// operational records, including their baseline for concurrent-edit detection.
const contactBase = { id: 'CONTACT-001', name: 'Test School', type: 'organisation', updatedAt: T1 };
const contactEdit = { ...contactBase, name: 'Updated Test School', updatedAt: T2 };
const contactEntries = computeChangeEntries(
  db({ contacts: [contactEdit] }),
  db({ contacts: [contactBase] }),
);
assert.equal(contactEntries.length, 1);
assert.equal(contactEntries[0].collection, 'contacts');
assert.equal(contactEntries[0].recordId, 'CONTACT-001');
assert.equal(contactEntries[0].operation, 'set');
assert.equal(contactEntries[0].baseUpdatedAt, T1);

const newContactEntries = computeChangeEntries(
  db({ contacts: [{ id: 'CONTACT-002', name: 'Offline School', type: 'organisation', updatedAt: T2 }] }),
  db({ contacts: [] }),
);
assert.equal(newContactEntries.length, 1);
assert.equal(newContactEntries[0].collection, 'contacts');
assert.equal(newContactEntries[0].recordId, 'CONTACT-002');
assert.equal(newContactEntries[0].operation, 'set');

// --- 2. Two devices editing the same record ---------------------------------
server.reset();
server.seed('girls', 'SG-001', girl('SG-001', T3, 'Edited on phone B'));
// This phone edited SG-001 offline while it had seen version T1.
const localEdit = computeChangeEntries(db({ girls: [girl('SG-001', T2, 'Edited on phone A')] }), db({ girls: [girl('SG-001', T1)] }));
assert.equal(localEdit.length, 1);
const flushResult = await syncChangeEntriesToFirestore(localEdit);
assert.equal(flushResult.applied, 0, 'a newer server edit must not be overwritten');
assert.equal(flushResult.conflicts.length, 1);
assert.equal(server.get('girls', 'SG-001').fullName, 'Edited on phone B', 'the newer server value is preserved');

// --- 2b. Records without updatedAt still detect two-device conflicts -------
server.reset();
const noTimestampBase = { id: 'SG-NO-TIME', fullName: 'Baseline name', notes: 'baseline' };
server.seed('girls', 'SG-NO-TIME', noTimestampBase);
const noTimestampQueue = computeChangeEntries(
  db({ girls: [{ ...noTimestampBase, fullName: 'Edited on phone A' }] }),
  db({ girls: [noTimestampBase] }),
);
assert.equal(noTimestampQueue.length, 1);
assert.ok(noTimestampQueue[0].baseHash, 'records without updatedAt receive a baseline content hash');
// Another device changes the server copy without an updatedAt field.
server.seed('girls', 'SG-NO-TIME', { ...noTimestampBase, fullName: 'Edited on phone B' });
const noTimestampResult = await syncChangeEntriesToFirestore(noTimestampQueue);
assert.equal(noTimestampResult.applied, 0, 'a timestamp-less server change is not overwritten');
assert.equal(noTimestampResult.conflicts.length, 1, 'a timestamp-less server change becomes a conflict');
assert.equal(server.get('girls', 'SG-NO-TIME').fullName, 'Edited on phone B');

// --- 3. An untouched record is not overwritten by a stale snapshot ----------
server.reset();
server.seed('girls', 'SG-002', girl('SG-002', T3, 'Edited elsewhere'));
const staleSnapshot = db({ girls: [girl('SG-001', T2), girl('SG-002', T1)] });
const changedOnly = computeChangeEntries(staleSnapshot, db({ girls: [girl('SG-001', T1), girl('SG-002', T1)] }));
assert.equal(changedOnly.length, 1, 'the untouched SG-002 must not be queued');
assert.equal(changedOnly[0].recordId, 'SG-001');
await syncChangeEntriesToFirestore(changedOnly);
assert.equal(server.get('girls', 'SG-002').fullName, 'Edited elsewhere', 'the untouched record keeps the newer server value');

// --- 4. Deletes are queued and applied --------------------------------------
server.reset();
server.seed('households', 'SH-01', { id: 'SH-01', name: 'House', updatedAt: T1 });
const deleteEntries = computeChangeEntries(db({ households: [] }), db({ households: [{ id: 'SH-01', name: 'House', updatedAt: T1 }] }));
assert.equal(deleteEntries.length, 1);
assert.equal(deleteEntries[0].operation, 'delete');
assert.equal(deleteEntries[0].baseUpdatedAt, T1);
await syncChangeEntriesToFirestore(deleteEntries);
assert.equal(server.get('households', 'SH-01'), undefined, 'the queued delete removes the server record');

// A delete is not applied when the server record changed since we saw it.
server.reset();
server.seed('households', 'SH-01', { id: 'SH-01', name: 'House', updatedAt: T3 });
const staleDelete = computeChangeEntries(db({ households: [] }), db({ households: [{ id: 'SH-01', name: 'House', updatedAt: T1 }] }));
const deleteConflict = await syncChangeEntriesToFirestore(staleDelete);
assert.equal(deleteConflict.applied, 0);
assert.equal(deleteConflict.conflicts.length, 1);
assert.ok(server.get('households', 'SH-01'), 'a newer server record is not deleted');

// --- 4b. This device's own online write is not treated as a conflict -------
server.reset();
server.seed('girls', 'SG-050', girl('SG-050', T2, 'My own online edit'));
const ownWrite = computeChangeEntries(db({ girls: [girl('SG-050', T2, 'My own online edit')] }), db({ girls: [girl('SG-050', T1)] }));
assert.equal(ownWrite.length, 1);
const ownResult = await syncChangeEntriesToFirestore(ownWrite);
assert.equal(ownResult.conflicts.length, 0, 'the device must not conflict with its own write');
assert.equal(ownResult.applied, 1);

// --- 5. Legacy snapshot migration -------------------------------------------
values.clear();
values.set('shine_relief_trust_pending_sync_v1', JSON.stringify([db({ girls: [girl('SG-009', T1)] })]));
const migrated = await migrateLegacySnapshots();
assert.equal(migrated, true, 'the legacy snapshot queue is migrated');
assert.equal(values.has('shine_relief_trust_pending_sync_v1'), false, 'the legacy key is cleared after migration');
const queue = await loadQueue();
assert.equal(queue.length, 1, 'the migrated record becomes a per-record change');
assert.equal(queue[0].recordId, 'SG-009');
assert.equal(getPendingOfflineSnapshotCount(), 1);

// --- 6. End-to-end offline edit + flush through the queue -------------------
values.clear();
server.reset();
const confirmed = db({ girls: [girl('SG-100', T1), girl('SG-101', T1)] });
setLastSyncedSnapshot(confirmed);
await recordOfflineChanges(db({ girls: [girl('SG-100', T2, 'Offline edit'), girl('SG-101', T1)] }));
assert.equal(getPendingOfflineSnapshotCount(), 1, 'only the offline-edited record is queued');
const flushed = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(flushed.flushed, true);
assert.equal(flushed.applied, 1);
assert.equal(server.get('girls', 'SG-100').fullName, 'Offline edit');
assert.equal(getPendingOfflineSnapshotCount(), 0, 'applied entries leave the queue');

// --- 7. Conflicts surface in the conflict list and can be resolved ----------
values.clear();
server.reset();
setLastSyncedSnapshot(db({ girls: [girl('SG-200', T1)] }));
await recordOfflineChanges(db({ girls: [girl('SG-200', T2, 'Mine')] }));
server.seed('girls', 'SG-200', girl('SG-200', T3, 'Theirs'));
const conflictFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(conflictFlush.conflicts.length, 1);
const conflicts = await readSyncConflicts();
assert.equal(conflicts.length, 1);
assert.equal(conflicts[0].recordId, 'SG-200');
assert.equal(conflicts[0].serverData?.fullName, 'Theirs');
assert.equal(conflicts[0].serverUpdatedBy, null);
assert.equal(getPendingOfflineSnapshotCount(), 1, 'the conflicted change stays queued until resolved');

// Keep theirs: the local edit is dropped.
await resolveSyncConflict(conflicts[0].id, 'keep-theirs', { uid: 'uid-a', name: 'Staff A' });
assert.equal((await readSyncConflicts()).length, 0);
assert.equal(getPendingOfflineSnapshotCount(), 0);
assert.equal(server.get('girls', 'SG-200').fullName, 'Theirs');

// Keep mine: the local edit is re-based and applied.
values.clear();
server.reset();
setLastSyncedSnapshot(db({ girls: [girl('SG-300', T1)] }));
await recordOfflineChanges(db({ girls: [girl('SG-300', T2, 'Mine again')] }));
server.seed('girls', 'SG-300', girl('SG-300', T3, 'Theirs again'));
await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
const mineConflicts = await readSyncConflicts();
assert.equal(mineConflicts.length, 1);
await resolveSyncConflict(mineConflicts[0].id, 'keep-mine', { uid: 'uid-a', name: 'Staff A' });
await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(server.get('girls', 'SG-300').fullName, 'Mine again', 'keep-mine applies the local edit');
assert.equal((await readSyncConflicts()).length, 0);

// --- 8. Local-write echoes must not advance the sync baseline ---------------
// A snapshot that came from the cache, or that carries this device's own pending
// writes, is an optimistic echo rather than a confirmed server copy. Adopting it
// as the baseline makes the next diff see "no change" and silently loses the
// edit (the offline data-loss bug this guards against).
assert.equal(isConfirmedServerSnapshot(undefined), true, 'missing metadata is treated as confirmed');
assert.equal(isConfirmedServerSnapshot({ fromCache: false, hasPendingWrites: false }), true);
assert.equal(isConfirmedServerSnapshot({ fromCache: true, hasPendingWrites: false }), false, 'cache reads are not confirmed');
assert.equal(isConfirmedServerSnapshot({ fromCache: false, hasPendingWrites: true }), false, 'pending local writes are not confirmed');

values.clear();
server.reset();
setLastSyncedSnapshot(db({ girls: [girl('SG-400', T1)] }));
const echoedEdit = db({ girls: [girl('SG-400', T2, 'Offline edit')] });
// The listener sees a pending-write echo and (correctly) does not set the baseline.
await recordOfflineChanges(echoedEdit);
assert.equal(getPendingOfflineSnapshotCount(), 1, 'an edit echoed back as a pending local write is still queued');
assert.equal((await loadQueue())[0].recordId, 'SG-400');

// --- 9. Compliance obligations use the same conflict-aware schedule queue ----
const complianceItem = {
  id: 'CMP-001',
  type: 'other',
  title: 'Annual policy review',
  scheduledDate: '2026-12-31',
  targetType: 'general',
  assignedStaffId: 'uid-a',
  assignedStaffName: 'Staff A',
  status: 'Scheduled',
  createdAt: T1,
  updatedAt: T2,
  complianceCategory: 'Staff training & policies',
  compliancePriority: 'High',
  complianceRecurrence: 'Annually',
  complianceHistory: [{ id: 'H-1', action: 'Created', actor: 'Staff A', at: T2 }],
};
const scheduleEntry = computeChangeEntries(
  db({ schedules: [complianceItem] }),
  db({ schedules: [] }),
);
assert.equal(scheduleEntry.length, 1, 'new compliance obligations should be queued as individual schedule records');
assert.equal(scheduleEntry[0].collection, 'schedules');
assert.equal(scheduleEntry[0].recordId, 'CMP-001');
assert.equal(scheduleEntry[0].operation, 'set');
assert.equal(scheduleEntry[0].data?.complianceRecurrence, 'Annually');
assert.equal(scheduleEntry[0].data?.complianceHistory?.[0]?.action, 'Created');

const changedCompliance = { ...complianceItem, updatedAt: T3, status: 'Completed', completionNote: 'Reviewed and signed' };
const changedScheduleEntry = computeChangeEntries(
  db({ schedules: [changedCompliance] }),
  db({ schedules: [complianceItem] }),
);
assert.equal(changedScheduleEntry.length, 1, 'completion updates should be queued');
assert.equal(changedScheduleEntry[0].collection, 'schedules');
assert.equal(changedScheduleEntry[0].data?.completionNote, 'Reviewed and signed');

// --- 10. Procurement list writes use per-record offline queue semantics -----
const procurementItem = {
  id: 'PRC-E2E-001',
  title: 'Synthetic office supplies',
  purpose: 'Offline queue regression test',
  items: [{ description: 'Paper', quantity: 1, unit: 'ream', priceStatus: 'missing' }],
  totalMWK: 0,
  status: 'draft',
  quoteThresholdMWK: 500000,
  createdAt: T1,
  updatedAt: T2,
  createdBy: 'Test Staff',
  updatedBy: 'Test Staff',
};
const procurementCreate = computeChangeEntries(
  db({ procurementLists: [procurementItem] }),
  db({ procurementLists: [] }),
);
assert.equal(procurementCreate.length, 1, 'new procurement lists should be queued as individual records');
assert.equal(procurementCreate[0].collection, 'procurementLists');
assert.equal(procurementCreate[0].recordId, 'PRC-E2E-001');
assert.equal(procurementCreate[0].operation, 'set');
assert.equal(procurementCreate[0].data?.title, 'Synthetic office supplies');

const procurementUpdated = {
  ...procurementItem,
  updatedAt: T3,
  items: [{ ...procurementItem.items[0], quotes: [{ supplier: 'Synthetic Supplier', amountMWK: 12000 }] }],
};
const procurementUpdate = computeChangeEntries(
  db({ procurementLists: [procurementUpdated] }),
  db({ procurementLists: [procurementItem] }),
);
assert.equal(procurementUpdate.length, 1, 'procurement quote updates should be queued');
assert.equal(procurementUpdate[0].collection, 'procurementLists');
assert.equal(procurementUpdate[0].recordId, 'PRC-E2E-001');
assert.equal(procurementUpdate[0].data?.items?.[0]?.quotes?.[0]?.amountMWK, 12000);

// --- 11. A successful database reset must not replay pre-reset edits --------
await persistQueue(procurementCreate);
values.set('shine_relief_trust_pending_sync_v1', JSON.stringify([db({ girls: [girl('SG-OLD', T1)] })]));
markDatabaseResetRecoveryRequired();
assert.equal(isDatabaseResetRecoveryRequired(), true, 'a destructive reset sets a local recovery lock');
const pausedFlush = await flushPendingOfflineSnapshots();
assert.equal(pausedFlush.flushed, false, 'pending changes are not replayed while reset recovery is required');
assert.equal((await loadQueue()).length, 1, 'paused sync preserves queued edits for recovery');
assert.equal(values.has('shine_relief_trust_pending_sync_v1'), true, 'paused sync does not migrate/delete the legacy snapshot');
const resetDb = db();
await clearOfflineChangesAfterDatabaseReset(resetDb);
assert.equal(isDatabaseResetRecoveryRequired(), false, 'successful reset cleanup removes the recovery lock');
assert.equal(getPendingOfflineSnapshotCount(), 0, 'a successful reset clears the in-memory queue');
assert.deepEqual(await loadQueue(), [], 'a successful reset clears persisted per-record edits');
assert.equal(values.has('shine_relief_trust_pending_sync_v1'), false, 'a successful reset removes legacy whole-database snapshots');
assert.deepEqual(JSON.parse(values.get('shine_relief_trust_last_synced_v1') || 'null'), resetDb,
  'the reset database becomes the new sync baseline');

// An interrupted destructive operation remains retryable by an administrator
// when both persisted queue formats are provably empty. A lock must never make
// an unreadable or non-empty queue look safe.
markDatabaseResetRecoveryRequired();
assert.equal(await inspectPendingOfflineChanges(), 'clear',
  'an admin can retry restore after interruption when all persisted queues are empty');
await persistQueue(procurementCreate);
assert.equal(await inspectPendingOfflineChanges(), 'pending',
  'the recovery lock does not make queued edits safe to discard silently');
await clearOfflineChangesAfterDatabaseReset(resetDb);

// A failed durable queue write must not publish the new queue in memory.
await persistQueue(procurementCreate);
const originalSetItem = fakeWindow.localStorage.setItem;
fakeWindow.localStorage.setItem = () => { throw new Error('synthetic queue storage failure'); };
await assert.rejects(() => persistQueue([]), /synthetic queue storage failure/);
assert.equal(getPendingOfflineSnapshotCount(), 1, 'failed persistence retains the last known queue in memory');
assert.equal((await loadQueue()).length, 1, 'failed persistence does not pretend the queue was cleared');
fakeWindow.localStorage.setItem = originalSetItem;
await clearOfflineChangesAfterDatabaseReset(resetDb);

// --- 12. Restore inspection must fail closed on unreadable queue state -----
await clearOfflineChangesAfterDatabaseReset(resetDb);
assert.equal(await inspectPendingOfflineChanges(), 'clear', 'empty persisted queue and no legacy snapshots permit restore');

values.set('shine_relief_trust_offline_queue_v2', JSON.stringify(procurementCreate));
assert.equal(await inspectPendingOfflineChanges(), 'pending', 'persisted localStorage edits block restore');
values.set('shine_relief_trust_offline_queue_v2', '{invalid-json');
assert.equal(await inspectPendingOfflineChanges(), 'unavailable', 'corrupt persisted queue blocks restore rather than appearing empty');
values.delete('shine_relief_trust_offline_queue_v2');

values.set('shine_relief_trust_pending_sync_v1', '{invalid-legacy-json');
assert.equal(await inspectPendingOfflineChanges(), 'unavailable', 'corrupt legacy snapshots block restore');
values.set('shine_relief_trust_pending_sync_v1', JSON.stringify([db({ girls: [girl('SG-LEGACY', T1)] })]));
assert.equal(await inspectPendingOfflineChanges(), 'pending', 'legacy whole-database snapshots block restore');
values.delete('shine_relief_trust_pending_sync_v1');

const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { throw new Error('synthetic IndexedDB failure'); } } });
assert.equal(await inspectPendingOfflineChanges(), 'unavailable', 'an unreadable IndexedDB queue with no fallback cannot be assumed empty');
if (originalIndexedDbDescriptor) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDbDescriptor);
else delete (globalThis as any).indexedDB;
assert.equal(await inspectPendingOfflineChanges(), 'clear', 'inspection recovers once the unavailable IndexedDB path is removed');

// A reset must remain locked if the new sync baseline cannot be persisted.
markDatabaseResetRecoveryRequired();
const originalStorageSetItem = fakeWindow.localStorage.setItem;
fakeWindow.localStorage.setItem = (key: string, value: string) => {
  if (key === 'shine_relief_trust_last_synced_v1') throw new Error('synthetic baseline write failure');
  originalStorageSetItem(key, value);
};
await assert.rejects(() => clearOfflineChangesAfterDatabaseReset(resetDb), /synthetic baseline write failure/);
assert.equal(isDatabaseResetRecoveryRequired(), true, 'failed baseline persistence keeps the reset recovery lock');
fakeWindow.localStorage.setItem = originalStorageSetItem;
await clearOfflineChangesAfterDatabaseReset(resetDb);
assert.equal(isDatabaseResetRecoveryRequired(), false, 'successful baseline persistence releases the reset recovery lock');

console.log('Offline per-record queue and conflict tests passed.');
