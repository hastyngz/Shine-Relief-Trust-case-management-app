import assert from 'node:assert/strict';
import { clearPendingOfflineSnapshots, getPendingOfflineSnapshotCount, readPendingOfflineSnapshots, writePendingOfflineSnapshot } from '../src/services/offlineSync';
import { AppDatabase } from '../src/types';

const values = new Map<string, string>();
const fakeWindow = {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  },
  dispatchEvent: () => true,
};

Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });

const first = { girls: [], households: [], marker: 'first' } as unknown as AppDatabase;
const latest = { girls: [], households: [], marker: 'latest' } as unknown as AppDatabase;
writePendingOfflineSnapshot(first);
writePendingOfflineSnapshot(latest);

assert.equal(getPendingOfflineSnapshotCount(), 1);
assert.equal((readPendingOfflineSnapshots()[0] as any).marker, 'latest');

clearPendingOfflineSnapshots();
assert.equal(getPendingOfflineSnapshotCount(), 0);

console.log('Offline queue tests passed.');