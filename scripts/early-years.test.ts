import assert from 'node:assert/strict';
import type { EarlyYearsRecord } from '../src/types';

const values = new Map<string, string>();
let failWrites = false;
const localStorageShim = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failWrites) throw new Error('Synthetic local storage failure');
    values.set(key, value);
  },
  removeItem: (key: string) => values.delete(key),
};
class FakeEvent { constructor(public type: string, public detail?: unknown) {} }
const fakeWindow = {
  localStorage: localStorageShim,
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  CustomEvent: FakeEvent,
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageShim });
Object.defineProperty(globalThis, 'Event', { configurable: true, value: FakeEvent });
Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: FakeEvent });

const { setActiveWorkspaceUid } = await import('../src/services/accountWorkspace');
setActiveWorkspaceUid('synthetic-early-years-test');
const { getDatabase, saveDatabase, addEarlyYearsRecord, saveEarlyYearsAttendance, deleteEarlyYearsRecord } =
  await import('../src/utils/storage');

const db = getDatabase();
db.earlyYearsRecords = [];
assert.equal(saveDatabase(db).ok, true);

const child = (overrides: Partial<EarlyYearsRecord> = {}) => ({
  reportingPeriod: '2026-11',
  sourceDocument: 'Early Years focused test',
  studentName: 'Test Child',
  dateOfBirth: '2022-03-14',
  guardianName: 'Test Guardian',
  enrollmentDate: '2026-11-01',
  studentStatus: 'Active' as const,
  ...overrides,
});

const first = addEarlyYearsRecord(child());
assert.throws(() => addEarlyYearsRecord(child({ guardianName: 'Different Guardian' })), /already registered/,
  'same name and DOB must be detected as a duplicate');
const second = addEarlyYearsRecord(child({ dateOfBirth: '2021-08-02' }));
assert.notEqual(first.id, second.id, 'same name with a different DOB is allowed');

addEarlyYearsRecord(child({ studentName: 'No DOB Child', dateOfBirth: '', guardianName: 'Same Guardian' }));
assert.throws(
  () => addEarlyYearsRecord(child({ studentName: ' no dob child ', dateOfBirth: '', guardianName: ' same guardian ' })),
  /already registered/,
  'name and guardian matching is case/whitespace insensitive when DOB is unavailable',
);
addEarlyYearsRecord(child({ studentName: 'No DOB Child', dateOfBirth: '', guardianName: 'Another Guardian' }));

saveEarlyYearsAttendance(first.id, '2026-11-04', 'Present', 'Test Staff');
saveEarlyYearsAttendance(first.id, '2026-11-05', 'Absent', 'Test Staff');
saveEarlyYearsAttendance(first.id, '2026-11-04', 'Late', 'Test Manager');
const saved = getDatabase().earlyYearsRecords.find((item) => item.id === first.id)!;
assert.equal(saved.attendanceEntries?.length, 2, 'one entry is retained per student per date');
assert.equal(saved.attendanceEntries?.[0]?.date, '2026-11-05', 'attendance is sorted newest first');
assert.equal(saved.attendanceEntries?.find((entry) => entry.date === '2026-11-04')?.status, 'Late',
  'same-day correction replaces the earlier status');
assert.equal(saved.attendanceEntries?.find((entry) => entry.date === '2026-11-04')?.recordedBy, 'Test Manager');

const beforeUnknown = JSON.stringify(getDatabase().earlyYearsRecords);
assert.equal(saveEarlyYearsAttendance('missing-student', '2026-11-06', 'Present', 'Test Staff'), null);
assert.equal(JSON.stringify(getDatabase().earlyYearsRecords), beforeUnknown, 'unknown child IDs do not mutate the register');

const countBeforeFailure = getDatabase().earlyYearsRecords.length;
failWrites = true;
assert.throws(() => addEarlyYearsRecord(child({ studentName: 'Unsaved Child' })));
assert.equal(getDatabase().earlyYearsRecords.length, countBeforeFailure, 'failed registration rolls back');

const previousEntries = [...(getDatabase().earlyYearsRecords.find((item) => item.id === first.id)?.attendanceEntries || [])];
assert.throws(() => saveEarlyYearsAttendance(first.id, '2026-11-07', 'Present', 'Test Staff'));
assert.deepEqual(getDatabase().earlyYearsRecords.find((item) => item.id === first.id)?.attendanceEntries, previousEntries,
  'failed attendance save restores the previous history');

assert.equal(deleteEarlyYearsRecord(second.id), false, 'delete reports failure if local persistence fails');
assert.ok(getDatabase().earlyYearsRecords.some((item) => item.id === second.id), 'failed delete restores the record');
failWrites = false;
assert.equal(deleteEarlyYearsRecord(second.id), true);
assert.ok(!getDatabase().earlyYearsRecords.some((item) => item.id === second.id));

console.log('Early Years registration, duplicate detection, attendance upsert and save rollback tests passed.');
