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
assert.ok(getDatabase().schedules.some((item) => item.id === unsavedSchedule.item.id), 'in-memory record remains available after storage failure');
failNext = false;
const savedScheduleUpdate = updateScheduleItemWithSaveResult(
  unsavedSchedule.item.id,
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

console.log('Local storage failure handling tests passed.');
