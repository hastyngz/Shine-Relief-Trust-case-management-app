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

const { saveQueueEntries, loadQueueEntries } = await import('../src/services/offlineSyncDb');

const entry = (collection: string, recordId: string, fullName: string) => ({
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

console.log('Offline queue IndexedDB tests passed: same-collection records are not overwritten.');
