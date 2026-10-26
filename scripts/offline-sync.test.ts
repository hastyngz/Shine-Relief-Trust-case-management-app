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
export async function updateDoc(ref, data) { const key = ref.collection + '/' + ref.id; const current = serverRecords.get(key); if (current === undefined) throw new Error('No document to update'); serverRecords.set(key, { ...current, ...data }); }
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

const { setActiveWorkspaceUid } = await import('../src/services/accountWorkspace');
setActiveWorkspaceUid('uid-a');
const { computeChangeEntries, migrateLegacySnapshots, recordOfflineChanges, flushPendingOfflineSnapshots, getPendingOfflineSnapshotCount, readSyncConflicts, resolveSyncConflict, setLastSyncedSnapshot, getLastSyncedSnapshot, loadQueue, isConfirmedServerSnapshot, persistQueue, queueOfflineRecordsForSync, clearOfflineChangesAfterDatabaseReset, markDatabaseResetRecoveryRequired, isDatabaseResetRecoveryRequired, inspectPendingOfflineChanges, writePendingOfflineSnapshot } = await import('../src/services/offlineSync');
const { __server } = await import('firebase/firestore') as unknown as { __server: any };
const server: any = __server;
const { syncChangeEntriesToFirestore, persistImportAuditToFirestore } = await import('../src/services/firestoreSync');

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-01T11:00:00.000Z';
const T3 = '2026-01-01T12:00:00.000Z';

function girl(id: string, updatedAt: string, name = 'Girl ' + id) {
  return { id, fullName: name, updatedAt, createdAt: T1 } as any;
}
function db(partial: Record<string, any> = {}): any {
  return { girls: [], households: [], educationalFollowUps: [], healthFollowUps: [], familyFollowUps: [], rentPayments: [], expenses: [], householdActivities: [], ...partial };
}

// A queue read can yield while IndexedDB is loading. If auth changes during
// that await, the old queue must not be returned to the newly active account.
setActiveWorkspaceUid('uid-b');
await persistQueue([{
  ownerUid: 'uid-b',
  collection: 'girls',
  recordId: 'SG-LOAD-RACE',
  operation: 'set',
  data: girl('SG-LOAD-RACE', T1),
  baseUpdatedAt: null,
  queuedAt: T1,
}], 'uid-b');
setActiveWorkspaceUid('uid-a');
const staleWorkspaceQueueRead = loadQueue();
setActiveWorkspaceUid('uid-b');
await assert.rejects(
  () => staleWorkspaceQueueRead,
  /workspace changed while loading offline edits/,
  'a queue read started for one UID must not complete into a different active session',
);
await persistQueue([], 'uid-b');
setActiveWorkspaceUid('uid-a');

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

// Restricted import source rows must never be written into the staff-readable audit collection.
server.reset();
const restrictedAudit = {
  id: 'AUD-SECURE-001',
  fileName: 'synthetic-import.xlsx',
  importedAt: T2,
  status: 'completed',
  sourceData: { rows: [{ syntheticLabel: 'restricted-source-row' }] },
};
const restrictedAuditQueue = computeChangeEntries(
  db({ importAudits: [restrictedAudit] }),
  db({ importAudits: [] }),
);
assert.equal(restrictedAuditQueue.length, 1);
const restrictedAuditFlush = await syncChangeEntriesToFirestore(restrictedAuditQueue);
assert.equal(restrictedAuditFlush.applied, 1);
assert.equal(server.get('importAudits', 'AUD-SECURE-001').sourceData, undefined,
  'sourceData must not be written to the staff-readable importAudits collection');
assert.deepEqual(
  server.get('restrictedImportSources', 'AUD-SECURE-001').sourceData,
  restrictedAudit.sourceData,
  'sourceData must be stored in the separately permissioned restrictedImportSources collection',
);
// Retrying after a later queue failure must be idempotent and must not overwrite the restricted source.
const restrictedAuditRetry = await syncChangeEntriesToFirestore(restrictedAuditQueue);
assert.equal(restrictedAuditRetry.conflicts.length, 0);
assert.equal(server.get('importAudits', 'AUD-SECURE-001').sourceData, undefined);

// The direct import-audit helper must also be retry-safe and preserve a source
// document if an audit ID is accidentally reused with different input.
server.reset();
const directAudit = {
  id: 'AUD-DIRECT-001',
  fileName: 'synthetic-direct.xlsx',
  fileType: 'xlsx' as const,
  importedByUid: 'synthetic-test',
  importedByName: 'Synthetic test',
  totalExamined: 1,
  newRecordsCount: 1,
  profileUpdatesCount: 0,
  historicalRecordsCount: 0,
  unchangedCount: 0,
  duplicatesCount: 0,
  conflictsCount: 0,
  errorsCount: 0,
  importedAt: T2,
  status: 'completed' as const,
  sourceData: { rows: [{ syntheticLabel: 'direct-source-row' }] },
};
await persistImportAuditToFirestore(directAudit);
assert.equal(server.get('importAudits', directAudit.id).sourceData, undefined);
assert.deepEqual(server.get('restrictedImportSources', directAudit.id).sourceData, directAudit.sourceData);
await persistImportAuditToFirestore(directAudit);
assert.deepEqual(server.get('restrictedImportSources', directAudit.id).sourceData, directAudit.sourceData,
  'retrying the same audit must preserve its restricted source');

server.reset();
const preservedSource = {
  id: 'AUD-DIRECT-COLLISION',
  auditId: 'AUD-DIRECT-COLLISION',
  fileName: 'previous-source.xlsx',
  importedAt: T1,
  sourceData: { rows: [{ syntheticLabel: 'do-not-overwrite' }] },
};
server.seed('restrictedImportSources', preservedSource.id, preservedSource);
await assert.rejects(
  persistImportAuditToFirestore({
    id: preservedSource.id,
    fileName: 'different-source.xlsx',
    fileType: 'xlsx' as const,
  importedByUid: 'synthetic-test',
  importedByName: 'Synthetic test',
  totalExamined: 1,
  newRecordsCount: 1,
  profileUpdatesCount: 0,
  historicalRecordsCount: 0,
  unchangedCount: 0,
  duplicatesCount: 0,
  conflictsCount: 0,
  errorsCount: 0,
    importedAt: T2,
    status: 'completed' as const,
    sourceData: { rows: [{ syntheticLabel: 'new-source' }] },
  }, true, true),
  /Import audit\/source persistence failed/,
);
assert.deepEqual(
  server.get('restrictedImportSources', preservedSource.id).sourceData,
  preservedSource.sourceData,
  'a rejected collision retry must preserve the original restricted source payload',
);
assert.deepEqual(server.get('restrictedImportSources', preservedSource.id), preservedSource,
  'a collision must preserve the previously stored source');
assert.equal(server.get('importAudits', preservedSource.id), undefined,
  'audit metadata must not be written when source collision validation fails');


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
setLastSyncedSnapshot(db());
writePendingOfflineSnapshot(db({ girls: [girl('SG-009', T1)] }));
const scopedSnapshotKey = 'shine_relief_trust_pending_sync_v2::uid:uid-a';
const migrated = await migrateLegacySnapshots();
assert.equal(migrated, true, 'the current workspace snapshot queue is migrated');
assert.equal(values.has(scopedSnapshotKey), false, 'the scoped snapshot is cleared only after migration succeeds');
const queue = await loadQueue();
assert.equal(queue.length, 1, 'the migrated record becomes a per-record change');
assert.equal(queue[0].recordId, 'SG-009');
assert.equal(queue[0].ownerUid, 'uid-a', 'migrated queue entries keep the known workspace owner');
assert.equal(getPendingOfflineSnapshotCount(), 1);

// A snapshot with no confirmed baseline must remain preserved, not become a full-database queue.
values.clear();
await persistQueue([], 'uid-a');
writePendingOfflineSnapshot(db({ girls: [girl('SG-LEGACY-NO-BASELINE', T1)] }));
assert.equal(await migrateLegacySnapshots(), false, 'migration pauses without a confirmed baseline');
assert.equal(values.has(scopedSnapshotKey), true, 'the legacy snapshot remains preserved without a baseline');
assert.equal((await loadQueue()).length, 0, 'no full-database queue is generated without a baseline');
assert.equal(getLastSyncedSnapshot(), null, 'local edits cannot invent a confirmed baseline');
await recordOfflineChanges(db({ girls: [girl('SG-BASELINE-MISSING', T1)] }));
assert.equal(getLastSyncedSnapshot(), null, 'recording edits does not mark an unconfirmed cache as synced');
assert.equal((await loadQueue()).length, 0, 'edits are not converted into unsafe full-database writes');

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

// Account switches must isolate both the queue and confirmed sync baseline.
const managerBaseline = getLastSyncedSnapshot();
assert.ok(managerBaseline, 'the manager workspace has its own confirmed baseline');
setActiveWorkspaceUid('uid-b');
assert.equal(getLastSyncedSnapshot(), null, 'a different UID cannot read the manager baseline');
const wrongAccountFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(wrongAccountFlush.flushed, false, 'a mismatched actor cannot flush another workspace');
assert.equal((await loadQueue()).length, 0, 'a second UID cannot read the manager queue');
setActiveWorkspaceUid('uid-a');
assert.ok(getLastSyncedSnapshot(), 'switching back restores the manager baseline');


// --- 7. Conflicts surface in the conflict list and can be resolved ----------
values.clear();
server.reset();
setLastSyncedSnapshot(db({ girls: [girl('SG-200', T1)] }));
await recordOfflineChanges(db({ girls: [girl('SG-200', T2, 'Mine')] }));
server.seed('girls', 'SG-200', girl('SG-200', T3, 'Theirs'));
const conflictFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(conflictFlush.conflicts.length, 1);
// If conflict metadata becomes unreadable during a retry, the flush must return
// an incomplete result and preserve the conflicted queue entry for recovery.
const originalConflictStorageGetItem = fakeWindow.localStorage.getItem;
fakeWindow.localStorage.getItem = (key: string) => {
  if (key.includes('shine_relief_trust_sync_conflicts_v2')) throw new Error('synthetic conflict list read failure during flush');
  return originalConflictStorageGetItem(key);
};
const conflictMetadataUnavailable = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(conflictMetadataUnavailable.flushed, false, 'flush reports incomplete when conflict metadata cannot be verified');
assert.equal(getPendingOfflineSnapshotCount(), 1, 'conflicted edits remain queued if conflict metadata cannot be read');
fakeWindow.localStorage.getItem = originalConflictStorageGetItem;
const conflicts = await readSyncConflicts();
assert.equal(conflicts.length, 1);
assert.equal(conflicts[0].recordId, 'SG-200');
assert.equal(conflicts[0].serverData?.fullName, 'Theirs');
assert.equal(conflicts[0].serverUpdatedBy, null);
assert.equal(getPendingOfflineSnapshotCount(), 1, 'the conflicted change stays queued until resolved');
assert.equal(conflicts[0].ownerUid, 'uid-a', 'conflicts record their owning UID');
// If saving the updated conflict list fails, resolution must not claim success
// or destroy the only recovery record. The queue decision is durable first.
const originalConflictStorageSetItem = fakeWindow.localStorage.setItem;
fakeWindow.localStorage.setItem = (key: string, value: string) => {
  if (key.includes('shine_relief_trust_sync_conflicts_v2')) throw new Error('synthetic conflict storage failure');
  originalConflictStorageSetItem(key, value);
};
await assert.rejects(
  () => resolveSyncConflict(conflicts[0].id, 'keep-theirs', { uid: 'uid-a', name: 'Staff A' }),
  /synthetic conflict storage failure/,
  'conflict persistence failures must reach the caller instead of faking success',
);
fakeWindow.localStorage.setItem = originalConflictStorageSetItem;
assert.equal((await readSyncConflicts()).length, 1, 'failed conflict persistence preserves the conflict for retry');
assert.equal(getPendingOfflineSnapshotCount(), 0, 'the selected Keep theirs queue decision is durably applied before retry');
setActiveWorkspaceUid('uid-b');
assert.equal(await resolveSyncConflict(conflicts[0].id, 'keep-theirs', { uid: 'uid-b', name: 'Staff B' }), false,
  'a second account cannot resolve the first account conflict');
setActiveWorkspaceUid('uid-a');
assert.equal((await readSyncConflicts()).length, 1, 'the original conflict remains after the other account is denied');

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
assert.equal(isConfirmedServerSnapshot(undefined), false, 'missing metadata is not treated as server-confirmed');
assert.equal(isConfirmedServerSnapshot({}), false, 'incomplete metadata fails closed');
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
).map((entry) => ({ ...entry, ownerUid: 'uid-a' }));
assert.equal(procurementCreate.length, 1, 'new procurement lists should be queued as individual records');
assert.equal(procurementCreate[0].collection, 'procurementLists');
assert.equal(procurementCreate[0].recordId, 'PRC-E2E-001');
assert.equal(procurementCreate[0].operation, 'set');
assert.equal(procurementCreate[0].data?.title, 'Synthetic office supplies');
setActiveWorkspaceUid('uid-b');
await assert.rejects(() => persistQueue([{ ...procurementCreate[0], ownerUid: 'uid-a' }], 'uid-b'), /missing or mismatched workspace ownership/,
  'a second account cannot re-attribute another account\'s queued entry');
setActiveWorkspaceUid('uid-a');

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
const unauthenticatedFlush = await flushPendingOfflineSnapshots();
assert.equal(unauthenticatedFlush.flushed, false, 'queued changes must not flush without a signed-in actor');
assert.equal((await loadQueue()).length, 1, 'an unauthenticated flush attempt preserves queued edits');
values.set('shine_relief_trust_pending_sync_v1', JSON.stringify([db({ girls: [girl('SG-OLD', T1)] })]));
markDatabaseResetRecoveryRequired();
assert.equal(isDatabaseResetRecoveryRequired(), true, 'a destructive reset sets a local recovery lock');
const pausedFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(pausedFlush.flushed, false, 'pending changes are not replayed while reset recovery is required');
assert.equal((await loadQueue()).length, 1, 'paused sync preserves queued edits for recovery');
assert.equal(values.has('shine_relief_trust_pending_sync_v1'), true, 'unowned legacy snapshot remains quarantined during paused sync');
const resetDb = db();
await clearOfflineChangesAfterDatabaseReset(resetDb);
assert.equal(isDatabaseResetRecoveryRequired(), false, 'successful reset cleanup removes the recovery lock');
assert.equal(getPendingOfflineSnapshotCount(), 0, 'a successful reset clears the in-memory queue');
assert.deepEqual(await loadQueue(), [], 'a successful reset clears persisted per-record edits');
assert.equal(values.has('shine_relief_trust_pending_sync_v1'), true, 'reset preserves unowned legacy snapshots for explicit recovery');
assert.deepEqual(JSON.parse(values.get('shine_relief_trust_last_synced_v2::uid:uid-a') || 'null'), resetDb,
  'the reset database becomes the new sync baseline');

// An interrupted destructive operation remains retryable by an administrator
// when both persisted queue formats are provably empty. A lock must never make
// an unreadable or non-empty queue look safe.
markDatabaseResetRecoveryRequired();
assert.equal(await inspectPendingOfflineChanges(), 'pending',
  'the unowned legacy snapshot must block restore even when the scoped queues are empty');
values.delete('shine_relief_trust_pending_sync_v1');
assert.equal(await inspectPendingOfflineChanges(), 'clear',
  'an admin can retry restore once all scoped queues and legacy quarantine fixtures are empty');
await persistQueue(procurementCreate);
assert.equal(await inspectPendingOfflineChanges(), 'pending',
  'the recovery lock does not make queued edits safe to discard silently');
await clearOfflineChangesAfterDatabaseReset(resetDb);

// Conflict storage read errors must not masquerade as an empty conflict list.
const originalGetItem = fakeWindow.localStorage.getItem;
fakeWindow.localStorage.getItem = (key: string) => {
  if (key === 'shine_relief_trust_sync_conflicts_v2::uid:uid-a') throw new Error('synthetic conflict read failure');
  return originalGetItem(key);
};
await assert.rejects(() => readSyncConflicts(), /synthetic conflict read failure/,
  'a failed conflict read must be visible to the caller rather than reported as no conflicts');
fakeWindow.localStorage.getItem = originalGetItem;

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
values.set('shine_relief_trust_prod_v1', JSON.stringify(db({ girls: [girl('SG-LEGACY-CACHE', T1)] })));
assert.equal(await inspectPendingOfflineChanges(), 'pending', 'the unowned legacy database cache blocks destructive restore');
values.delete('shine_relief_trust_prod_v1');
values.set('shine_relief_trust_pending_sync_v1', JSON.stringify([db({ girls: [girl('SG-LEGACY-RESET', T1)] })]));
assert.equal(await inspectPendingOfflineChanges(), 'pending', 'unowned legacy snapshots remain quarantined and block destructive restore');
values.delete('shine_relief_trust_pending_sync_v1');
assert.equal(await inspectPendingOfflineChanges(), 'clear', 'restore is allowed after the synthetic legacy quarantine fixture is removed');
setActiveWorkspaceUid('uid-b');
await assert.rejects(() => clearOfflineChangesAfterDatabaseReset(resetDb, 'uid-a'), /Account changed before reset recovery/,
  'a reset started under one UID cannot clear another UID workspace');
setActiveWorkspaceUid('uid-a');

values.set('shine_relief_trust_offline_queue_v3::uid:uid-a', JSON.stringify(procurementCreate));
assert.equal(await inspectPendingOfflineChanges(), 'pending', 'persisted localStorage edits block restore');
values.set('shine_relief_trust_offline_queue_v3::uid:uid-a', '{invalid-json');
assert.equal(await inspectPendingOfflineChanges(), 'unavailable', 'corrupt persisted queue blocks restore rather than appearing empty');
values.delete('shine_relief_trust_offline_queue_v3::uid:uid-a');

values.set('shine_relief_trust_pending_sync_v1', '{invalid-legacy-json');
assert.equal(await inspectPendingOfflineChanges(), 'unavailable', 'corrupt unowned legacy snapshots block restore');
values.set('shine_relief_trust_pending_sync_v1', JSON.stringify([db({ girls: [girl('SG-LEGACY', T1)] })]));
assert.equal(await inspectPendingOfflineChanges(), 'pending', 'unowned legacy whole-database snapshots stay quarantined and block destructive restore');
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
  if (key === 'shine_relief_trust_last_synced_v2::uid:uid-a') throw new Error('synthetic baseline write failure');
  originalStorageSetItem(key, value);
};
await assert.rejects(() => clearOfflineChangesAfterDatabaseReset(resetDb), /synthetic baseline write failure/);
assert.equal(isDatabaseResetRecoveryRequired(), true, 'failed baseline persistence keeps the reset recovery lock');
fakeWindow.localStorage.setItem = originalStorageSetItem;
await clearOfflineChangesAfterDatabaseReset(resetDb);
assert.equal(isDatabaseResetRecoveryRequired(), false, 'successful baseline persistence releases the reset recovery lock');


// --- 13. Case records use the conflict-aware queue, never direct setDoc ------
const {
  getDatabase: getStorageDatabase,
  saveDatabase: saveLocalDatabase,
  normalizeImportedDatabase,
  updateGirl,
  deleteGirl,
  updateHousehold,
  deleteHousehold,
  addHealthFollowUp,
  deleteHealthFollowUp,
  addRentPayment,
  deleteExpense,
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  addAnnualBudgetPlan,
  addWorkplanItem,
  updateWorkplanItem,
  deleteWorkplanItem,
  addMeetingRecord,
  updateMeetingRecord,
  deleteMeetingRecord,
  addMarketPrice,
  deleteEarlyYearsRecord,
  addHistoricalCaseRecord,
  deleteHistoricalCaseRecord,
  addFeedingProgramLog,
  deleteFeedingProgramLog,
  saveForecastSettings,
  saveAISettings,
  addPerson,
  deletePerson,
  addPayrollRecord,
  updatePayrollRecord,
  deletePayrollRecord,
  updateEmployeeRecord,
} = await import('../src/utils/storage');

async function resetCaseSyncState(base: any) {
  values.clear();
  server.reset();
  await clearOfflineChangesAfterDatabaseReset(base);
  assert.equal(saveLocalDatabase(base).ok, true, 'synthetic case baseline is saved locally');
  setLastSyncedSnapshot(base);
}

const girlBaseline = normalizeImportedDatabase({
  girls: [{ id: 'SG-QUEUE-STALE', name: 'Baseline Girl', householdId: 'SH-QUEUE-STALE', createdAt: T1, updatedAt: T1 } as any],
  households: [{ id: 'SH-QUEUE-STALE', name: 'Baseline household', createdAt: T1, updatedAt: T1 } as any],
});
await resetCaseSyncState(girlBaseline);
server.seed('girls', 'SG-QUEUE-STALE', { ...girlBaseline.girls[0] });
server.seed('girls', 'SG-QUEUE-STALE', { ...girlBaseline.girls[0], name: 'Changed on another device', updatedAt: T3 });
updateGirl('SG-QUEUE-STALE', { name: 'Changed on this device' } as any);
assert.equal(server.get('girls', 'SG-QUEUE-STALE').name, 'Changed on another device',
  'editing a girl locally must not bypass the queue and overwrite a newer server record');
await recordOfflineChanges(getStorageDatabase());
const girlUpdateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(girlUpdateFlush.conflicts.length, 1, 'stale girl update is surfaced as a conflict');
assert.equal(server.get('girls', 'SG-QUEUE-STALE').name, 'Changed on another device',
  'conflict handling preserves the newer server girl record');

await resetCaseSyncState(girlBaseline);
server.seed('girls', 'SG-QUEUE-STALE', { ...girlBaseline.girls[0], name: 'Changed before delete elsewhere', updatedAt: T3 });
assert.equal(deleteGirl('SG-QUEUE-STALE'), true, 'local girl deletion is accepted after local persistence');
assert.ok(server.get('girls', 'SG-QUEUE-STALE'), 'local delete must not directly erase a newer server girl record');
await recordOfflineChanges(getStorageDatabase());
const girlDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(girlDeleteFlush.conflicts.length, 1, 'stale girl delete is surfaced as a conflict');
assert.equal(server.get('girls', 'SG-QUEUE-STALE').name, 'Changed before delete elsewhere',
  'conflict handling preserves the newer server girl record on delete');

await resetCaseSyncState(girlBaseline);
server.seed('girls', 'SG-QUEUE-STALE', { ...girlBaseline.girls[0] });
server.seed('households', 'SH-QUEUE-STALE', { ...girlBaseline.households[0], name: 'Changed on another device', updatedAt: T3 });
updateHousehold('SH-QUEUE-STALE', { name: 'Changed on this device' } as any);
assert.equal(server.get('households', 'SH-QUEUE-STALE').name, 'Changed on another device',
  'editing a household locally must not bypass the queue and overwrite a newer server record');
await recordOfflineChanges(getStorageDatabase());
const householdUpdateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(householdUpdateFlush.conflicts.length, 1, 'stale household update is surfaced as a conflict');
assert.equal(server.get('households', 'SH-QUEUE-STALE').name, 'Changed on another device',
  'conflict handling preserves the newer server household record');

await resetCaseSyncState(girlBaseline);
server.seed('girls', 'SG-QUEUE-STALE', { ...girlBaseline.girls[0] });
server.seed('households', 'SH-QUEUE-STALE', { ...girlBaseline.households[0], name: 'Changed before delete elsewhere', updatedAt: T3 });
assert.equal(deleteHousehold('SH-QUEUE-STALE'), true, 'local household deletion is accepted after local persistence');
assert.ok(server.get('households', 'SH-QUEUE-STALE'), 'local household delete must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const householdDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(householdDeleteFlush.conflicts.length, 1, 'stale household delete is surfaced as a conflict');
assert.equal(server.get('households', 'SH-QUEUE-STALE').name, 'Changed before delete elsewhere',
  'conflict handling preserves the newer server household record on delete');


 // --- 14. Health follow-ups also use the queue and preserve stale server data --
const healthBaseline = normalizeImportedDatabase({
  healthFollowUps: [{ id: 'HLT-QUEUE-STALE', girlId: 'SYNTHETIC-GIRL', summary: 'Baseline synthetic record', createdAt: T1, updatedAt: T1 } as any],
});
await resetCaseSyncState(healthBaseline);
server.seed('healthFollowUps', 'HLT-QUEUE-STALE', { ...healthBaseline.healthFollowUps[0] });
server.seed('healthFollowUps', 'HLT-QUEUE-STALE', { ...healthBaseline.healthFollowUps[0], summary: 'Changed on another device', updatedAt: T3 });
assert.equal(deleteHealthFollowUp('HLT-QUEUE-STALE'), true, 'local health follow-up deletion succeeds after local persistence');
assert.equal(server.get('healthFollowUps', 'HLT-QUEUE-STALE').summary, 'Changed on another device',
  'health deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const healthDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(healthDeleteFlush.conflicts.length, 1, 'stale health follow-up deletion is surfaced as a conflict');
assert.equal(server.get('healthFollowUps', 'HLT-QUEUE-STALE').summary, 'Changed on another device',
  'health conflict handling preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ healthFollowUps: [] }));
const addedHealth = addHealthFollowUp({ girlId: 'SYNTHETIC-GIRL', summary: 'Synthetic health queue test' } as any);
assert.equal(server.get('healthFollowUps', addedHealth.id), undefined,
  'health follow-up creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const healthCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(healthCreateFlush.conflicts.length, 0, 'new health follow-up queues without a conflict');
assert.equal(server.get('healthFollowUps', addedHealth.id).summary, 'Synthetic health queue test',
  'queued health follow-up creation reaches Firestore');


 // --- 15. Household finance/activity writes use the conflict-aware queue ----
const expenseBaseline = normalizeImportedDatabase({
  expenses: [{ id: 'EXP-QUEUE-STALE', householdId: 'SYNTHETIC-HOUSEHOLD', totalCost: 100, paymentStatus: 'Paid', createdAt: T1, updatedAt: T1 } as any],
});
await resetCaseSyncState(expenseBaseline);
server.seed('expenses', 'EXP-QUEUE-STALE', { ...expenseBaseline.expenses[0], totalCost: 125, updatedAt: T3 });
assert.equal(deleteExpense('EXP-QUEUE-STALE'), true, 'local expense deletion succeeds after local persistence');
assert.equal(server.get('expenses', 'EXP-QUEUE-STALE').totalCost, 125,
  'expense deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const expenseDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(expenseDeleteFlush.conflicts.length, 1, 'stale expense deletion is surfaced as a conflict');
assert.equal(server.get('expenses', 'EXP-QUEUE-STALE').totalCost, 125,
  'expense conflict handling preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ rentPayments: [] }));
const addedRent = addRentPayment({ householdId: 'SYNTHETIC-HOUSEHOLD', amount: 100 } as any);
assert.equal(server.get('rentPayments', addedRent.id), undefined,
  'rent payment creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const rentCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(rentCreateFlush.conflicts.length, 0, 'new rent payment queues without a conflict');
assert.equal(server.get('rentPayments', addedRent.id).id, addedRent.id,
  'queued rent payment creation reaches Firestore');


 // --- 16. Budget and annual-plan writes use conflict-aware queue -------------
const budgetBaseline = normalizeImportedDatabase({
  budgets: [{ id: 'BDG-QUEUE-STALE', testValue: 'baseline', createdAt: T1, updatedAt: T1 } as any],
});
await resetCaseSyncState(budgetBaseline);
server.seed('budgets', 'BDG-QUEUE-STALE', { ...budgetBaseline.budgets![0], testValue: 'server-newer', updatedAt: T3 });
assert.equal((updateBudgetItem('BDG-QUEUE-STALE', { testValue: 'local-edit' } as any) as any)?.testValue, 'local-edit',
  'local budget update is saved before queued synchronization');
assert.equal(server.get('budgets', 'BDG-QUEUE-STALE').testValue, 'server-newer',
  'budget update must not directly overwrite a newer server record');
await recordOfflineChanges(getStorageDatabase());
const budgetUpdateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(budgetUpdateFlush.conflicts.length, 1, 'stale budget update is surfaced as a conflict');
assert.equal(server.get('budgets', 'BDG-QUEUE-STALE').testValue, 'server-newer',
  'budget conflict handling preserves the newer server record');

await resetCaseSyncState(budgetBaseline);
server.seed('budgets', 'BDG-QUEUE-STALE', { ...budgetBaseline.budgets![0], testValue: 'server-newer', updatedAt: T3 });
assert.equal(deleteBudgetItem('BDG-QUEUE-STALE'), true, 'local budget deletion succeeds after local persistence');
assert.equal(server.get('budgets', 'BDG-QUEUE-STALE').testValue, 'server-newer',
  'budget deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const budgetDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(budgetDeleteFlush.conflicts.length, 1, 'stale budget deletion is surfaced as a conflict');
assert.equal(server.get('budgets', 'BDG-QUEUE-STALE').testValue, 'server-newer',
  'budget delete conflict preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ annualBudgets: [] }));
const addedAnnualBudget = addAnnualBudgetPlan({ title: 'Synthetic annual budget plan' } as any);
assert.equal(server.get('annualBudgets', addedAnnualBudget.id), undefined,
  'annual budget plan creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const annualBudgetFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(annualBudgetFlush.conflicts.length, 0, 'new annual budget plan queues without a conflict');
assert.equal(server.get('annualBudgets', addedAnnualBudget.id).id, addedAnnualBudget.id,
  'queued annual budget plan creation reaches Firestore');


 // --- 17. Workplans and meetings use the conflict-aware queue ----------------
const planningBaseline = normalizeImportedDatabase({
  workplans: [{ id: 'WKP-QUEUE-STALE', title: 'Baseline workplan', createdAt: T1, updatedAt: T1 } as any],
  meetings: [{ id: 'MTG-QUEUE-STALE', title: 'Baseline meeting', dateTime: T1, attendees: [], status: 'Planned', minutesText: '', summaryAndOutcomes: '', createdBy: 'Synthetic tester', createdAt: T1, updatedAt: T1 } as any],
});
await resetCaseSyncState(planningBaseline);
server.seed('workplans', 'WKP-QUEUE-STALE', { ...planningBaseline.workplans![0], title: 'Server newer', updatedAt: T3 });
assert.equal((updateWorkplanItem('WKP-QUEUE-STALE', { title: 'Local edit' } as any) as any)?.title, 'Local edit',
  'local workplan update is saved before queued synchronization');
assert.equal(server.get('workplans', 'WKP-QUEUE-STALE').title, 'Server newer',
  'workplan update must not directly overwrite a newer server record');
await recordOfflineChanges(getStorageDatabase());
const workplanUpdateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(workplanUpdateFlush.conflicts.length, 1, 'stale workplan update is surfaced as a conflict');
assert.equal(server.get('workplans', 'WKP-QUEUE-STALE').title, 'Server newer',
  'workplan conflict handling preserves the newer server record');

await resetCaseSyncState(planningBaseline);
server.seed('meetings', 'MTG-QUEUE-STALE', { ...planningBaseline.meetings![0], title: 'Server newer', updatedAt: T3 });
assert.equal(deleteMeetingRecord('MTG-QUEUE-STALE'), true, 'local meeting deletion succeeds after local persistence');
assert.equal(server.get('meetings', 'MTG-QUEUE-STALE').title, 'Server newer',
  'meeting deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const meetingDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(meetingDeleteFlush.conflicts.length, 1, 'stale meeting deletion is surfaced as a conflict');
assert.equal(server.get('meetings', 'MTG-QUEUE-STALE').title, 'Server newer',
  'meeting conflict handling preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ workplans: [] }));
const addedWorkplan = addWorkplanItem({ title: 'Synthetic queue-only workplan' } as any);
assert.equal(server.get('workplans', addedWorkplan.id), undefined,
  'workplan creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const workplanCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(workplanCreateFlush.conflicts.length, 0, 'new workplan queues without a conflict');
assert.equal(server.get('workplans', addedWorkplan.id).title, 'Synthetic queue-only workplan',
  'queued workplan creation reaches Firestore');


 // --- 18. Programme and case-history records use conflict-aware queue --------
const earlyYearsBaseline = normalizeImportedDatabase({
  earlyYearsRecords: [{ id: 'ECD-QUEUE-STALE', childId: 'SYNTHETIC-CHILD', notes: 'Baseline synthetic record', createdAt: T1 } as any],
});
await resetCaseSyncState(earlyYearsBaseline);
server.seed('earlyYearsRecords', 'ECD-QUEUE-STALE', { ...earlyYearsBaseline.earlyYearsRecords![0] });
server.seed('earlyYearsRecords', 'ECD-QUEUE-STALE', { ...earlyYearsBaseline.earlyYearsRecords![0], notes: 'Changed elsewhere', updatedAt: T3 });
assert.equal(deleteEarlyYearsRecord('ECD-QUEUE-STALE'), true, 'local early-years deletion succeeds after local persistence');
assert.equal(server.get('earlyYearsRecords', 'ECD-QUEUE-STALE').notes, 'Changed elsewhere',
  'early-years deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const earlyYearsDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(earlyYearsDeleteFlush.conflicts.length, 1, 'stale early-years deletion is surfaced as a conflict');
assert.equal(server.get('earlyYearsRecords', 'ECD-QUEUE-STALE').notes, 'Changed elsewhere',
  'early-years conflict handling preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ marketPrices: [] }));
const addedMarketPrice = addMarketPrice({ item: 'Synthetic market item', price: 125 } as any);
assert.equal(server.get('marketPrices', addedMarketPrice.id), undefined,
  'market price creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const marketCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(marketCreateFlush.conflicts.length, 0, 'new market price queues without a conflict');
assert.equal(server.get('marketPrices', addedMarketPrice.id).id, addedMarketPrice.id,
  'queued market price creation reaches Firestore');


const feedingBaseline = normalizeImportedDatabase({
  feedingProgramLogs: [{ id: 'FEED-QUEUE-STALE', date: '2026-01-01', studentsPresent: 2, mealsServed: 2, foodItems: [], quantities: {}, estimatedCost: 100, createdAt: T1 } as any],
});
await resetCaseSyncState(feedingBaseline);
server.seed('feedingProgramLogs', 'FEED-QUEUE-STALE', { ...feedingBaseline.feedingProgramLogs![0] });
server.seed('feedingProgramLogs', 'FEED-QUEUE-STALE', { ...feedingBaseline.feedingProgramLogs![0], estimatedCost: 150, updatedAt: T3 });
assert.equal(deleteFeedingProgramLog('FEED-QUEUE-STALE'), true, 'local feeding-log deletion succeeds after local persistence');
assert.equal(server.get('feedingProgramLogs', 'FEED-QUEUE-STALE').estimatedCost, 150,
  'feeding-log deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const feedingDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(feedingDeleteFlush.conflicts.length, 1, 'stale feeding-log deletion is surfaced as a conflict');
assert.equal(server.get('feedingProgramLogs', 'FEED-QUEUE-STALE').estimatedCost, 150,
  'feeding-log conflict handling preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ feedingProgramLogs: [] }));
const addedFeedingLog = addFeedingProgramLog({ date: '2026-01-02', studentsPresent: 2, mealsServed: 2, foodItems: [], quantities: {}, estimatedCost: 0, createdBy: 'Synthetic tester' } as any);
assert.equal(server.get('feedingProgramLogs', addedFeedingLog.id), undefined,
  'feeding-log creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const feedingCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(feedingCreateFlush.conflicts.length, 0, 'new feeding log queues without a conflict');
assert.equal(server.get('feedingProgramLogs', addedFeedingLog.id).id, addedFeedingLog.id,
  'queued feeding-log creation reaches Firestore');

const historicalBaseline = normalizeImportedDatabase({
  historicalRecords: [{ id: 'HIST-QUEUE-STALE', girlId: 'SYNTHETIC-GIRL', summary: 'Baseline synthetic history', createdAt: T1 } as any],
});
await resetCaseSyncState(historicalBaseline);
server.seed('historicalCaseRecords', 'HIST-QUEUE-STALE', { ...historicalBaseline.historicalRecords![0] });
server.seed('historicalCaseRecords', 'HIST-QUEUE-STALE', { ...historicalBaseline.historicalRecords![0], summary: 'Changed elsewhere', updatedAt: T3 });
assert.equal(deleteHistoricalCaseRecord('HIST-QUEUE-STALE'), true, 'local historical-record deletion succeeds after local persistence');
assert.equal(server.get('historicalCaseRecords', 'HIST-QUEUE-STALE').summary, 'Changed elsewhere',
  'historical deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const historicalDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(historicalDeleteFlush.conflicts.length, 1, 'stale historical-record deletion is surfaced as a conflict');
assert.equal(server.get('historicalCaseRecords', 'HIST-QUEUE-STALE').summary, 'Changed elsewhere',
  'historical conflict handling preserves the newer server record');


 // --- 19. Forecast and AI settings use the conflict-aware queue --------------
const forecastBaseline = normalizeImportedDatabase({
  forecastSettings: [{ id: 'FCST-QUEUE-STALE', inflationPercent: 5, fuelPricePercent: 3, transportMultiplierPercent: 2, seasonalFoodPercent: 4, authorizedBy: 'Synthetic', updatedAt: T1 } as any],
});
await resetCaseSyncState(forecastBaseline);
server.seed('forecastSettings', 'FCST-QUEUE-STALE', { ...forecastBaseline.forecastSettings![0], inflationPercent: 9, updatedAt: T3 });
saveForecastSettings({ ...forecastBaseline.forecastSettings![0], inflationPercent: 6, updatedAt: T2 } as any);
assert.equal(server.get('forecastSettings', 'FCST-QUEUE-STALE').inflationPercent, 9,
  'forecast settings save must not directly overwrite a newer server value');
await recordOfflineChanges(getStorageDatabase());
const forecastFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(forecastFlush.conflicts.length, 1, 'stale forecast settings update is surfaced as a conflict');
assert.equal(server.get('forecastSettings', 'FCST-QUEUE-STALE').inflationPercent, 9,
  'forecast settings conflict preserves the newer server value');

await resetCaseSyncState(normalizeImportedDatabase({ aiSettings: [] }));
const aiSettings = { id: 'AI-SETTINGS-QUEUE', enabled: true, speechToText: true, textToSpeech: false, documentAnalysis: true, naturalLanguageSearch: false, dailyUsageLimit: 5, updatedByUid: 'synthetic-user', updatedAt: T1 };
saveAISettings(aiSettings as any);
assert.equal(server.get('aiSettings', aiSettings.id), undefined,
  'AI settings save must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const aiSettingsFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(aiSettingsFlush.conflicts.length, 0, 'new AI settings queue without a conflict');
assert.equal(server.get('aiSettings', aiSettings.id).enabled, true,
  'queued AI settings creation reaches Firestore');


 // --- 20. People directory changes use the conflict-aware queue -------------
const personBaseline = normalizeImportedDatabase({
  people: [{ id: 'PER-QUEUE-STALE', fullName: 'Baseline synthetic person', personType: 'guardian', linkedGirlIds: [], linkedHouseholdIds: [], sourceDocuments: [], dateFirstIdentified: T1, dateRegistered: T1, createdBy: 'Synthetic', createdDate: T1, updatedBy: 'Synthetic', updatedDate: T1, status: 'Active', isLoginUser: false } as any],
});
await resetCaseSyncState(personBaseline);
server.seed('people', 'PER-QUEUE-STALE', { ...personBaseline.people![0], fullName: 'Changed elsewhere', updatedDate: T3 });
assert.equal(deletePerson('PER-QUEUE-STALE'), true, 'local person deletion succeeds after local persistence');
assert.equal(server.get('people', 'PER-QUEUE-STALE').fullName, 'Changed elsewhere',
  'person deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const personDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(personDeleteFlush.conflicts.length, 1, 'stale person deletion is surfaced as a conflict');
assert.equal(server.get('people', 'PER-QUEUE-STALE').fullName, 'Changed elsewhere',
  'person conflict handling preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ people: [] }));
const addedPerson = addPerson({ id: 'PER-QUEUE-NEW', fullName: 'Synthetic new person', personType: 'guardian', linkedGirlIds: [], linkedHouseholdIds: [], sourceDocuments: [], dateFirstIdentified: T1, dateRegistered: T1, createdBy: 'Synthetic', createdDate: T1, updatedBy: 'Synthetic', updatedDate: T1, status: 'Active', isLoginUser: false } as any);
assert.equal(server.get('people', addedPerson.id), undefined,
  'person creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const personCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(personCreateFlush.conflicts.length, 0, 'new person queues without a conflict');
assert.equal(server.get('people', addedPerson.id).fullName, 'Synthetic new person',
  'queued person creation reaches Firestore');


 // --- 21. Payroll and employee writes retain role rules and queue conflicts --
const payrollBaseRecord = {
  id: 'PAY-QUEUE-STALE',
  employeeId: 'EMP-QUEUE-STALE',
  employeeName: 'Synthetic employee',
  payPeriod: '2026-10',
  payPeriodStartDate: '2026-10-01',
  payPeriodEndDate: '2026-10-31',
  applicableSalary: 100,
  salaryHistoryRecordIds: [],
  expectedAmount: 100,
  amountPaid: 0,
  paymentStatus: 'Pending',
  createdBy: 'Synthetic manager',
  createdByUid: 'uid-a',
  createdAt: T1,
  updatedBy: 'Synthetic manager',
  updatedByUid: 'uid-a',
  updatedAt: T1,
};
const payrollBaseline = normalizeImportedDatabase({ payrollRecords: [payrollBaseRecord as any] });
await resetCaseSyncState(payrollBaseline);
server.seed('payrollRecords', payrollBaseRecord.id, { ...payrollBaseRecord, expectedAmount: 125, updatedAt: T3 });
assert.equal(updatePayrollRecord(payrollBaseRecord.id, { expectedAmount: 200 } as any, 'Synthetic manager', 'uid-a')?.expectedAmount, 200,
  'local payroll update is saved before queued synchronization');
assert.equal(server.get('payrollRecords', payrollBaseRecord.id).expectedAmount, 125,
  'payroll update must not directly overwrite a newer server record');
await recordOfflineChanges(getStorageDatabase());
const payrollUpdateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(payrollUpdateFlush.conflicts.length, 1, 'stale payroll update is surfaced as a conflict');
assert.equal(server.get('payrollRecords', payrollBaseRecord.id).expectedAmount, 125,
  'payroll conflict preserves the newer server record');

await resetCaseSyncState(payrollBaseline);
server.seed('payrollRecords', payrollBaseRecord.id, { ...payrollBaseRecord, expectedAmount: 125, updatedAt: T3 });
assert.equal(deletePayrollRecord(payrollBaseRecord.id), true, 'local payroll deletion succeeds after local persistence');
assert.equal(server.get('payrollRecords', payrollBaseRecord.id).expectedAmount, 125,
  'payroll deletion must not directly erase a newer server record');
await recordOfflineChanges(getStorageDatabase());
const payrollDeleteFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(payrollDeleteFlush.conflicts.length, 1, 'stale payroll deletion is surfaced as a conflict');
assert.equal(server.get('payrollRecords', payrollBaseRecord.id).expectedAmount, 125,
  'payroll delete conflict preserves the newer server record');

await resetCaseSyncState(normalizeImportedDatabase({ payrollRecords: [] }));
const addedPayroll = addPayrollRecord({
  employeeId: 'EMP-QUEUE-NEW',
  employeeName: 'Synthetic employee',
  payPeriod: '2026-10',
  payPeriodStartDate: '2026-10-01',
  payPeriodEndDate: '2026-10-31',
  applicableSalary: 100,
  salaryHistoryRecordIds: [],
  expectedAmount: 100,
  amountPaid: 0,
  paymentStatus: 'Pending',
} as any, 'Synthetic manager', 'uid-a');
assert.equal(server.get('payrollRecords', addedPayroll.id), undefined,
  'payroll creation must not issue a parallel direct Firestore write');
await recordOfflineChanges(getStorageDatabase());
const payrollCreateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(payrollCreateFlush.conflicts.length, 0, 'new payroll record queues without a conflict');
assert.equal(server.get('payrollRecords', addedPayroll.id).id, addedPayroll.id,
  'queued payroll creation reaches Firestore');

const employeeBaseline = normalizeImportedDatabase({
  employees: [{ id: 'EMP-QUEUE-STALE', fullName: 'Synthetic employee', salaryMWK: 100, createdAt: T1, updatedAt: T1, createdBy: 'Synthetic manager', updatedBy: 'Synthetic manager' } as any],
});
await resetCaseSyncState(employeeBaseline);
server.seed('employees', 'EMP-QUEUE-STALE', { ...employeeBaseline.employees![0], salaryMWK: 150, updatedAt: T3 });
assert.equal((await updateEmployeeRecord('EMP-QUEUE-STALE', { salaryMWK: 200 } as any, 'Synthetic manager'))?.salaryMWK, 200,
  'local employee update is saved before queued synchronization');
assert.equal(server.get('employees', 'EMP-QUEUE-STALE').salaryMWK, 150,
  'employee update must not directly overwrite a newer server record');
await recordOfflineChanges(getStorageDatabase());
const employeeUpdateFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Staff A' } });
assert.equal(employeeUpdateFlush.conflicts.length, 1, 'stale employee update is surfaced as a conflict');
assert.equal(server.get('employees', 'EMP-QUEUE-STALE').salaryMWK, 150,
  'employee conflict preserves the newer server record');


 // --- 22. Confidential salary history uses durable, append-only queue writes --
await persistQueue([], 'uid-a');
await import('../src/services/offlineSync').then(({ persistSyncConflicts }) => persistSyncConflicts([]));
server.reset();
const salaryQueueRecord = {
  id: 'SALARY-SYNTHETIC-001',
  employeeId: 'EMP-SYNTHETIC-001',
  effectiveDate: '2026-10-01',
  salaryAmount: 123456,
  salaryFrequency: 'Monthly',
  reasonForChange: 'Synthetic test fixture',
  recordedBy: 'Synthetic manager',
  recordedDate: T1,
  auditMetadata: { createdAt: T1, createdByUid: 'uid-a' },
};
const salaryAuditRecord = {
  id: 'salary-audit-SALARY-SYNTHETIC-001',
  employeeId: salaryQueueRecord.employeeId,
  action: 'salary_creation',
  actorUid: 'uid-a',
  actorName: 'Synthetic manager',
  changedAt: T1,
  recordId: salaryQueueRecord.id,
};
await queueOfflineRecordsForSync([
  { collection: 'employeeSalaryHistory', record: salaryQueueRecord },
  { collection: 'employeeAuditLogs', record: salaryAuditRecord },
], 'uid-a');
assert.equal((await loadQueue()).length, 2, 'salary and audit rows are durably queued together');
const salaryFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Synthetic manager' } });
assert.equal(salaryFlush.conflicts.length, 0, 'new append-only salary and audit records sync without conflicts');
assert.equal(server.get('employeeSalaryHistory', salaryQueueRecord.id).salaryAmount, 123456, 'salary record reaches the restricted Firestore collection');
assert.equal(server.get('employeeAuditLogs', salaryAuditRecord.id).recordId, salaryQueueRecord.id, 'salary audit event reaches the restricted audit collection');
assert.equal((await loadQueue()).length, 0, 'successfully synced salary and audit records leave the queue');

// Retrying the same records after an interrupted acknowledgement is idempotent.
await queueOfflineRecordsForSync([
  { collection: 'employeeSalaryHistory', record: salaryQueueRecord },
  { collection: 'employeeAuditLogs', record: salaryAuditRecord },
], 'uid-a');
const salaryRetry = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Synthetic manager' } });
assert.equal(salaryRetry.conflicts.length, 0, 'identical append-only retries are treated as already synced');
assert.equal((await loadQueue()).length, 0, 'identical retries do not remain stuck in the queue');

// A different server salary with the same ID is never overwritten by a retry.
const conflictingSalary = { ...salaryQueueRecord, id: 'SALARY-SYNTHETIC-CONFLICT', salaryAmount: 222222 };
server.seed('employeeSalaryHistory', conflictingSalary.id, { ...conflictingSalary, salaryAmount: 999999 });
await queueOfflineRecordsForSync([
  { collection: 'employeeSalaryHistory', record: conflictingSalary },
], 'uid-a');
const salaryConflictFlush = await flushPendingOfflineSnapshots({ actor: { uid: 'uid-a', name: 'Synthetic manager' } });
assert.equal(salaryConflictFlush.conflicts.length, 1, 'different server salary with the same ID is surfaced as a conflict');
assert.equal(server.get('employeeSalaryHistory', conflictingSalary.id).salaryAmount, 999999, 'conflict handling never overwrites an existing salary record');
assert.equal((await loadQueue()).length, 1, 'conflicting salary record remains queued for review');
assert.equal(server.all().some(([key]: [string, unknown]) => key.startsWith('caseActionAuditLogs/')), false, 'salary conflicts must not leak employee identifiers into the general case-action audit collection');
await persistQueue([], 'uid-a');
await import('../src/services/offlineSync').then(({ persistSyncConflicts }) => persistSyncConflicts([]));

console.log('Offline per-record queue and conflict tests passed.');
