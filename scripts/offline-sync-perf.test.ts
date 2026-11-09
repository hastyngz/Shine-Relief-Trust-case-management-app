import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Reuse the offline-sync test harness to install its isolated Firestore mock
// and browser globals; no real Firebase project is contacted.
await import('./offline-sync.test');
const { computeChangeEntries, SYNC_COLLECTION_FIELDS } = await import('../src/services/offlineSync');

const count = 5_000;
const followUpCount = 20_000;
const baselineGirls = Array.from({ length: count }, (_, i) => ({
  id: `PERF-GIRL-${i}`, fullName: `Fixture Girl ${i}`, updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z', status: 'Active',
}));
const followUps = Array.from({ length: followUpCount }, (_, i) => ({
  id: `PERF-FOLLOWUP-${i}`, girlId: `PERF-GIRL-${i % count}`, date: '2026-01-01',
  notes: `Generated fixture follow-up ${i}`, updatedAt: '2026-01-01T00:00:00.000Z',
}));
const sharedCollections: Record<string, unknown[]> = {};
for (const [field] of SYNC_COLLECTION_FIELDS) sharedCollections[field] = [];
sharedCollections.girls = baselineGirls;
sharedCollections.educationalFollowUps = followUps;
const baseline = { ...sharedCollections } as any;
const currentGirls = baselineGirls.slice();
currentGirls[2] = { ...currentGirls[2], fullName: 'Edited single record' };
const current = { ...baseline, girls: currentGirls } as any;

const start = performance.now();
const entries = computeChangeEntries(current, baseline);
const elapsedMs = performance.now() - start;
assert.equal(entries.length, 1, 'one edited record yields exactly one queued entry');
assert.equal(entries[0].recordId, 'PERF-GIRL-2');
assert.ok(elapsedMs < 200, `single-record diff should fit within the 200ms budget (measured ${elapsedMs.toFixed(2)}ms)`);
console.log(`Offline diff performance: ${elapsedMs.toFixed(2)}ms for ${count} girls and ${followUpCount} follow-ups; exactly one changed entry.`);
