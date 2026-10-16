import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal browser globals so src/utils/storage.ts can run under tsx.
// ---------------------------------------------------------------------------
const values = new Map<string, string>();
const events: string[] = [];
class FakeEvent { constructor(public type: string, public detail?: unknown) {} }
const fakeLocalStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const fakeWindow: any = {
  localStorage: fakeLocalStorage,
  dispatchEvent: (event: any) => { events.push(event?.type); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
  CustomEvent: FakeEvent,
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fakeLocalStorage });
Object.defineProperty(globalThis, 'Event', { configurable: true, value: FakeEvent });
Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: FakeEvent });

const {
  getDatabase,
  saveDatabase,
  addScheduleItemWithSaveResult,
  updateScheduleItemWithSaveResult,
  normalizeImportedDatabase,
  restoreDatabaseWithPersistence,
  STORAGE_WARNING_EVENT,
  STORAGE_RECOVERED_EVENT,
} = await import('../src/utils/storage');

// --- Normal save returns success -------------------------------------------
events.length = 0;
const ok = saveDatabase(getDatabase());
assert.equal(ok.ok, true, 'a normal save reports success');
assert.equal(ok.quotaExceeded, false);
assert.ok(events.includes('shine_db_updated'), 'a successful save still dispatches the update event');
assert.ok(events.includes(STORAGE_RECOVERED_EVENT), 'a successful save clears a previous warning');

// --- Backup restore preserves every current database collection ------------
const restoredShape = normalizeImportedDatabase({
  girls: [],
  households: [],
  caseGoals: [{ id: 'goal-restore-test' } as never],
  assets: [{ id: 'asset-restore-test' } as never],
});
assert.deepEqual(restoredShape.caseGoals, [{ id: 'goal-restore-test' }], 'case goals survive backup normalization');
assert.deepEqual(restoredShape.assets, [{ id: 'asset-restore-test' }], 'asset records survive backup normalization');
assert.deepEqual(normalizeImportedDatabase({ girls: [], households: [] }).assets, [], 'older backups without assets remain compatible');

// --- Quota exceeded is detected and reported -------------------------------
let failNext = true;
const originalSetItem = fakeLocalStorage.setItem;
fakeLocalStorage.setItem = (key: string, value: string) => {
  if (failNext) {
    const error = new Error('The quota has been exceeded.');
    (error as any).name = 'QuotaExceededError';
    throw error;
  }
  originalSetItem(key, value);
};

events.length = 0;
const before = values.get('shine_relief_trust_prod_v1');
const failed = saveDatabase(getDatabase());
assert.equal(failed.ok, false, 'a failed save reports failure');
assert.equal(failed.quotaExceeded, true, 'QuotaExceededError is detected specifically');
assert.ok(events.includes(STORAGE_WARNING_EVENT), 'a failed save dispatches the warning event');


assert.equal(values.get('shine_relief_trust_prod_v1'), before, 'the previously stored data is left intact');

// dispatchEvent=false suppresses only shine_db_updated, never storage health signals.
events.length = 0;
failNext = true;
const quietFailed = saveDatabase(getDatabase(), false);
assert.equal(quietFailed.ok, false);
assert.ok(events.includes(STORAGE_WARNING_EVENT), 'warning is dispatched even when database-updated events are suppressed');
assert.ok(!events.includes('shine_db_updated'), 'dispatchEvent=false suppresses only shine_db_updated');
failNext = false;
events.length = 0;
const quietRecovered = saveDatabase(getDatabase(), false);
assert.equal(quietRecovered.ok, true);
assert.ok(events.includes(STORAGE_RECOVERED_EVENT), 'recovery is dispatched even when database-updated events are suppressed');

// The in-memory database is never discarded: callers still hold their object.
const db = getDatabase();
const dbGirlsBefore = db.girls.length;
assert.equal(db.girls.length, dbGirlsBefore, 'the in-memory database is preserved after a failure');

// --- A later successful save clears the warning ----------------------------
failNext = false;
events.length = 0;
const recovered = saveDatabase(db);
assert.equal(recovered.ok, true, 'the save succeeds once space is available');
assert.ok(events.includes(STORAGE_RECOVERED_EVENT), 'recovery is announced');

// --- Schedule operations report failed local persistence honestly -----------
failNext = true;
const unsavedSchedule = addScheduleItemWithSaveResult({
  type: 'other',
  title: 'Synthetic storage failure obligation',
  scheduledDate: '2026-10-16',
  targetType: 'general',
  assignedStaffId: 'staff-test',
  assignedStaffName: 'Test Staff',
  status: 'Scheduled',
}, 'Test Staff');
assert.equal(unsavedSchedule.savedLocally, false, 'schedule create reports a failed local save');
failNext = false;
const recoveredSchedule = addScheduleItemWithSaveResult({
  type: 'other',
  title: 'Synthetic recovered obligation',
  scheduledDate: '2026-10-16',
  targetType: 'general',
  assignedStaffId: 'staff-test',
  assignedStaffName: 'Test Staff',
  status: 'Scheduled',
}, 'Test Staff');
assert.equal(recoveredSchedule.savedLocally, true, 'schedule create reports successful persistence after recovery');
const savedScheduleUpdate = updateScheduleItemWithSaveResult(
  recoveredSchedule.item.id,
  { status: 'In Progress' },
  'Test Staff',
);
assert.equal(savedScheduleUpdate.savedLocally, true, 'schedule update reports successful local persistence');
assert.equal(savedScheduleUpdate.item?.status, 'In Progress');

// --- Non-quota errors are reported but not mislabelled ---------------------
fakeLocalStorage.setItem = () => { throw new Error('SecurityError'); };
events.length = 0;
const otherFailure = saveDatabase(db);
assert.equal(otherFailure.ok, false);
assert.equal(otherFailure.quotaExceeded, false, 'a non-quota error is not labelled as a quota error');
assert.ok(events.includes(STORAGE_WARNING_EVENT), 'any save failure is surfaced to the UI');

// --- Backup restore reports local/cloud partial outcomes honestly ----------
const validBackup = JSON.stringify({ girls: [{ id: 'SG-RESTORE-1' }], households: [] });
let cloudCalls = 0;
let localCalls = 0;
const cloudFailure = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { cloudCalls += 1; throw new Error('synthetic cloud failure'); },
  () => { localCalls += 1; return { ok: true, quotaExceeded: false }; },
);
assert.equal(cloudFailure.status, 'cloud_sync_failed');
assert.equal(localCalls, 0, 'local database is not replaced when cloud restore fails');
assert.equal(cloudCalls, 1);

const localFailure = await restoreDatabaseWithPersistence(
  validBackup,
  async (restored) => { cloudCalls += 1; assert.equal(restored.girls[0].id, 'SG-RESTORE-1'); },
  () => { localCalls += 1; return { ok: false, quotaExceeded: true }; },
);
assert.equal(localFailure.status, 'cloud_updated_local_save_failed', 'partial cloud success is distinguished from total failure');

const restoreSuccess = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { cloudCalls += 1; },
  () => { localCalls += 1; return { ok: true, quotaExceeded: false }; },
);
assert.equal(restoreSuccess.status, 'success');
let cleanupAttempted = false;
const queueCleanupFailure = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { cloudCalls += 1; },
  () => { localCalls += 1; return { ok: true, quotaExceeded: false }; },
  async () => { cleanupAttempted = true; throw new Error('synthetic queue cleanup failure'); },
);
assert.equal(queueCleanupFailure.status, 'queue_cleanup_failed', 'stale offline queue cleanup failure is visible');
assert.equal(cleanupAttempted, true);

// A restore must stop before cloud or local writes when offline edits are pending.
let pendingCloudCalls = 0;
let pendingLocalCalls = 0;
const pendingRestore = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { pendingCloudCalls += 1; },
  () => { pendingLocalCalls += 1; return { ok: true, quotaExceeded: false }; },
  async () => {},
  async () => 'pending',
);
assert.equal(pendingRestore.status, 'pending_offline_changes');
assert.equal(pendingCloudCalls, 0, 'pending offline edits block cloud restore');
assert.equal(pendingLocalCalls, 0, 'pending offline edits block local replacement');

const unavailableRestore = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { pendingCloudCalls += 1; },
  () => { pendingLocalCalls += 1; return { ok: true, quotaExceeded: false }; },
  async () => {},
  async () => 'unavailable',
);
assert.equal(unavailableRestore.status, 'offline_state_unavailable');
assert.equal(pendingCloudCalls, 0, 'an unreadable offline queue blocks cloud restore');
assert.equal(pendingLocalCalls, 0, 'an unreadable offline queue blocks local replacement');

const invalidRestore = await restoreDatabaseWithPersistence(
  JSON.stringify({ girls: 'not-an-array', households: [] }),
  async () => { cloudCalls += 1; },
  () => { localCalls += 1; return { ok: true, quotaExceeded: false }; },
);
assert.equal(invalidRestore.status, 'invalid_backup');
assert.equal(localCalls, 3, 'invalid backups do not invoke local persistence');
assert.equal(cloudCalls, 4, 'invalid backups do not invoke cloud persistence');

console.log('Local storage failure handling tests passed.');
