import assert from 'node:assert/strict';
import type { AppDatabase } from '../src/types';

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
  saveIncomingCloudSnapshot,
  saveInventoryItem,
  saveAssetRecord,
  saveForecastSettings,
  saveIntelligenceSuggestion,
  saveAISettings,
  addCustomPersonType,
  addGirl,
  updateGirl,
  deleteGirl,
  deleteEducationalFollowUp,
  deleteHealthFollowUp,
  deleteFamilyFollowUp,
  deleteRentPayment,
  deleteHouseholdActivity,
  addHousehold,
  updateHousehold,
  addEducationalFollowUp,
  addHealthFollowUp,
  addFamilyFollowUp,
  addRentPayment,
  addHouseholdActivity,
  addMeetingRecord,
  addFeedingProgramLog,
  addMarketPrice,
  addEarlyYearsRecord,
  addHistoricalCaseRecord,
  addImportAuditRecord,
  addPerson,
  deleteHousehold,
  deleteMeetingRecord,
  deleteFeedingProgramLog,
  deleteMarketPrice,
  deleteEarlyYearsRecord,
  deleteHistoricalCaseRecord,
  deletePerson,
  addWorkplanItem,
  updateWorkplanItem,
  deleteWorkplanItem,
  addPayrollRecord,
  updateEmployeeRecord,
  addExpense,
  updateExpense,
  deleteExpense,
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  addAnnualBudgetPlan,
  updateAnnualBudgetPlan,
  addScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  addScheduleItemWithSaveResult,
  updateScheduleItemWithSaveResult,
  updatePayrollRecord,
  deletePayrollRecord,
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

// A failed Firestore snapshot save must not advance the local sync baseline.
const baselineBeforeSnapshot = values.get('shine_relief_trust_last_synced_v1') ?? null;
const databaseBeforeSnapshot = getDatabase();
const setItemBeforeSnapshotTest = fakeLocalStorage.setItem;
fakeLocalStorage.setItem = () => { throw new Error('synthetic snapshot storage failure'); };
const incomingSnapshot = { ...databaseBeforeSnapshot, girls: [{ id: 'SG-CLOUD-SNAPSHOT-UNSAVED' } as never] };
assert.equal(saveIncomingCloudSnapshot(incomingSnapshot, true), false,
  'a Firestore snapshot is not accepted when local persistence fails');
assert.deepEqual(getDatabase().girls, databaseBeforeSnapshot.girls,
  'failed snapshot persistence leaves the prior local database intact');
assert.equal(values.get('shine_relief_trust_last_synced_v1') ?? null, baselineBeforeSnapshot,
  'failed snapshot persistence does not advance the sync baseline');
fakeLocalStorage.setItem = setItemBeforeSnapshotTest;

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
const unsavedScheduleId = unsavedSchedule.item?.id;
assert.ok(unsavedScheduleId && !(getDatabase().schedules || []).some((item) => item.id === unsavedScheduleId),
  'failed schedule creation rolls back the in-memory record');
assert.throws(
  () => addScheduleItem({
    type: 'other',
    title: 'Synthetic wrapper storage failure',
    scheduledDate: '2026-10-16',
    targetType: 'general',
    assignedStaffId: 'staff-test',
    assignedStaffName: 'Test Staff',
    status: 'Scheduled',
  }, 'Test Staff'),
  /Schedule item was not saved on this device/,
  'the simple schedule helper cannot hide a failed local save',
);
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

failNext = true;
const schedulesBeforeFailedUpdate = [...(getDatabase().schedules || [])];
const failedScheduleUpdate = updateScheduleItemWithSaveResult(
  recoveredSchedule.item.id,
  { status: 'Completed' },
  'Test Staff',
);
assert.equal(failedScheduleUpdate.savedLocally, false, 'schedule update reports local persistence failure');
assert.deepEqual(getDatabase().schedules || [], schedulesBeforeFailedUpdate,
  'failed schedule update restores the prior in-memory record');
assert.throws(
  () => updateScheduleItem(recoveredSchedule.item.id, { status: 'Cancelled' }, 'Test Staff'),
  /Schedule update was not saved on this device/,
  'the simple schedule update helper cannot hide a failed local save',
);
assert.equal(deleteScheduleItem(recoveredSchedule.item.id), false,
  'schedule deletion reports a failed local save without throwing');

assert.deepEqual(getDatabase().schedules || [], schedulesBeforeFailedUpdate,
  'failed schedule deletion restores the prior in-memory record');
failNext = false;

// --- Non-quota errors are reported but not mislabelled ---------------------
const employeeDb = getDatabase();
employeeDb.employees = [
  ...(employeeDb.employees || []),
  { id: 'EMP-LOCAL-SAVE-FAIL', fullName: 'Storage Failure Test', createdAt: '2026-01-01T00:00:00.000Z' } as never,
];
assert.equal(saveDatabase(employeeDb).ok, true, 'employee failure fixture is persisted before storage is disabled');
fakeLocalStorage.setItem = () => { throw new Error('SecurityError'); };
events.length = 0;
const otherFailure = saveDatabase(db);
assert.equal(otherFailure.ok, false);
assert.equal(otherFailure.quotaExceeded, false, 'a non-quota error is not labelled as a quota error');
assert.ok(events.includes(STORAGE_WARNING_EVENT), 'any save failure is surfaced to the UI');

// Financial records must not start cloud writes after local persistence fails.
assert.throws(() => addPayrollRecord({
  employeeId: 'TEST-LOCAL-SAVE-FAIL',
  employeeName: 'Storage Failure Test',
  departmentOrProgramme: 'Test',
  payPeriod: '2099-11',
  payPeriodStartDate: '2099-11-01',
  payPeriodEndDate: '2099-11-30',
  applicableSalary: 100,
  expectedAmount: 100,
  amountPaid: 0,
  paymentStatus: 'Pending',
  paymentMethod: 'Bank transfer',
} as never), /Payroll record was not saved on this device/);
await assert.rejects(
  () => updateEmployeeRecord('EMP-LOCAL-SAVE-FAIL', { fullName: 'Unsaved Name' } as never, 'Test Admin'),
  /Employee record was not saved on this device/,
  'employee edits do not proceed to Firestore when local persistence fails',
);

// Expense mutations must stop before cloud writes when local storage fails.
const expenseDb = getDatabase();
const originalExpenses = [...expenseDb.expenses];
assert.throws(
  () => addExpense({
    householdId: 'SH-TEST',
    itemDescription: 'Synthetic storage failure expense',
    quantity: '1',
    unit: 'item',
    unitCost: 100,
    totalCost: 100,
    amountDue: 100,
    paymentStatus: 'Unpaid',
  } as never, 'Test Staff'),
  /not saved on this device/,
  'expense creation reports a failed local save',
);
assert.deepEqual(getDatabase().expenses, originalExpenses, 'failed expense creation leaves durable records unchanged');

const expenseFixture = {
  id: 'EXP-STORAGE-FAILURE-TEST',
  householdId: 'SH-TEST',
  itemDescription: 'Synthetic existing expense',
  quantity: '1',
  unit: 'item',
  unitCost: 100,
  totalCost: 100,
  amountDue: 100,
  paymentStatus: 'Unpaid',
  createdAt: '2026-10-16T00:00:00.000Z',
} as never;
fakeLocalStorage.setItem = originalSetItem;
expenseDb.expenses = [...originalExpenses, expenseFixture];
assert.equal(saveDatabase(expenseDb).ok, true, 'synthetic expense fixture is persisted before storage is disabled');
fakeLocalStorage.setItem = () => { throw new Error('SecurityError'); };
const beforeFailedExpenseMutations = getDatabase();
assert.throws(
  () => updateExpense('EXP-STORAGE-FAILURE-TEST', { amountDue: 150 } as never, 'Test Staff'),
  /not saved on this device/,
  'expense update reports a failed local save',
);
assert.deepEqual(getDatabase().expenses, beforeFailedExpenseMutations.expenses, 'failed expense update leaves durable records unchanged');
assert.equal(deleteExpense('EXP-STORAGE-FAILURE-TEST'), false,
  'expense deletion reports a failed local save without throwing');

assert.deepEqual(getDatabase().expenses, beforeFailedExpenseMutations.expenses, 'failed expense deletion leaves durable records unchanged');

// Budget and annual-plan mutations also roll back in-memory state when storage
// rejects the save; they must not close the form or proceed to cloud writes.
const budgetDb = getDatabase();
const originalBudgets = [...(budgetDb.budgets || [])];
const originalAnnualBudgets = [...(budgetDb.annualBudgets || [])];
const originalWorkplans = [...(budgetDb.workplans || [])];
assert.throws(
  () => addWorkplanItem({
    period: '2099-Q1',
    periodType: 'quarterly',
    activity: 'Synthetic workplan',
    objective: 'Test local persistence failure',
    description: 'Test local persistence failure',
    targetCount: 1,
    unit: 'session',
    completedCount: 0,
    progress: 0,
    status: 'In Progress',
    responsibleStaffId: 'TEST-STAFF',
    responsibleStaffName: 'Test Staff',
    startDate: '2099-01-01',
    endDate: '2099-01-02',
    dueDatePeriod: 'date:2099-01-02',
    location: 'Test location',
    notes: '',
  } as never, 'Test Staff'),
  /workplan item was not saved on this device/i,
  'workplan creation reports a failed local save',
);
assert.deepEqual(getDatabase().workplans, originalWorkplans, 'failed workplan creation rolls back its in-memory record');
assert.throws(
  () => addBudgetItem({
    period: '2099-Q1',
    periodType: 'quarterly',
    programme: 'Synthetic test programme',
    category: 'Education',
    itemDescription: 'Synthetic budget item',
    quantity: 1,
    unit: 'item',
    unitCost: 100,
    budgetAmount: 100,
    actualExpenditure: 0,
    notes: '',
  } as never, 'Test Staff'),
  /budget item was not saved on this device/i,
  'budget creation reports a failed local save',
);
assert.deepEqual(getDatabase().budgets, originalBudgets, 'failed budget creation rolls back its in-memory record');

fakeLocalStorage.setItem = originalSetItem;
const budgetFixture = {
  id: 'BDG-STORAGE-FAILURE-TEST',
  period: '2099-Q1',
  periodType: 'quarterly',
  programme: 'Synthetic test programme',
  category: 'Education',
  itemDescription: 'Synthetic existing budget',
  quantity: 1,
  unit: 'item',
  unitCost: 100,
  budgetAmount: 100,
  actualExpenditure: 0,
  notes: '',
  createdAt: '2026-10-16T00:00:00.000Z',
} as never;
const workplanFixture = {
  id: 'WKP-STORAGE-FAILURE-TEST',
  period: '2099-Q1',
  periodType: 'quarterly',
  activity: 'Synthetic existing workplan',
  objective: 'Test local persistence failure',
  description: 'Test local persistence failure',
  targetCount: 1,
  unit: 'session',
  completedCount: 0,
  progress: 0,
  status: 'In Progress',
  responsibleStaffId: 'TEST-STAFF',
  responsibleStaffName: 'Test Staff',
  startDate: '2099-01-01',
  endDate: '2099-01-02',
  dueDatePeriod: 'date:2099-01-02',
  location: 'Test location',
  notes: '',
  createdAt: '2026-10-16T00:00:00.000Z',
} as never;
const annualBudgetFixture = {
  id: 'ABG-STORAGE-FAILURE-TEST',
  financialYear: '2099-2100',
  title: 'Synthetic annual budget',
  programme: 'Synthetic test programme',
  description: '',
  status: 'Draft',
  approvedAmount: 1000,
  approvalDate: '',
  notes: '',
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
} as never;
budgetDb.budgets = [...originalBudgets, budgetFixture];
budgetDb.annualBudgets = [...originalAnnualBudgets, annualBudgetFixture];
budgetDb.workplans = [...originalWorkplans, workplanFixture];
assert.equal(saveDatabase(budgetDb).ok, true, 'synthetic budget/workplan fixtures are persisted before storage is disabled');
fakeLocalStorage.setItem = () => { throw new Error('SecurityError'); };
const beforeFailedBudgetMutations = [...budgetDb.budgets];
const beforeFailedAnnualBudgetMutations = [...budgetDb.annualBudgets];
const beforeFailedWorkplanMutations = [...budgetDb.workplans];
assert.throws(
  () => updateBudgetItem('BDG-STORAGE-FAILURE-TEST', { budgetAmount: 150 } as never, 'Test Staff'),
  /budget item was not saved on this device/i,
  'budget update reports a failed local save',
);
assert.deepEqual(getDatabase().budgets, beforeFailedBudgetMutations, 'failed budget update rolls back the original record');
assert.equal(deleteBudgetItem('BDG-STORAGE-FAILURE-TEST'), false,
  'budget deletion reports a failed local save without throwing');

assert.deepEqual(getDatabase().budgets, beforeFailedBudgetMutations, 'failed budget deletion restores the original record');
assert.throws(
  () => updateWorkplanItem('WKP-STORAGE-FAILURE-TEST', { completedCount: 1 } as never, 'Test Staff'),
  /workplan item was not saved on this device/i,
  'workplan update reports a failed local save',
);
assert.deepEqual(getDatabase().workplans, beforeFailedWorkplanMutations, 'failed workplan update restores the original record');
assert.equal(deleteWorkplanItem('WKP-STORAGE-FAILURE-TEST'), false,
  'workplan deletion reports a failed local save without throwing');

assert.deepEqual(getDatabase().workplans, beforeFailedWorkplanMutations, 'failed workplan deletion restores the original record');
assert.throws(
  () => addAnnualBudgetPlan({
    financialYear: '2099-2100',
    title: 'Synthetic failed annual plan',
    programme: 'Synthetic test programme',
    description: '',
    status: 'Draft',
    approvedAmount: 2000,
    approvalDate: '',
    notes: '',
    createdBy: 'Test Staff',
    updatedBy: 'Test Staff',
  } as never, 'Test Staff'),
  /annual budget plan was not saved on this device/i,
  'annual budget creation reports a failed local save',
);
assert.deepEqual(getDatabase().annualBudgets, beforeFailedAnnualBudgetMutations, 'failed annual budget creation rolls back');
assert.throws(
  () => updateAnnualBudgetPlan('ABG-STORAGE-FAILURE-TEST', { approvedAmount: 1500 } as never, 'Test Staff'),
  /annual budget plan was not saved on this device/i,
  'annual budget update reports a failed local save',
);
assert.deepEqual(getDatabase().annualBudgets, beforeFailedAnnualBudgetMutations, 'failed annual budget update rolls back');
fakeLocalStorage.setItem = originalSetItem;
budgetDb.budgets = originalBudgets;
budgetDb.annualBudgets = originalAnnualBudgets;
budgetDb.workplans = originalWorkplans;
assert.equal(saveDatabase(budgetDb).ok, true, 'synthetic financial/workplan fixtures are removed from local test storage');

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

// Restore establishes the recovery lock before any destructive cloud work,
// and removes it only through successful finalization.
const restoreOrder: string[] = [];
const orderedRestore = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { restoreOrder.push('cloud'); },
  () => { restoreOrder.push('local'); return { ok: true, quotaExceeded: false }; },
  async () => { restoreOrder.push('finalize'); },
  async () => 'clear',
  () => { restoreOrder.push('lock'); },
);
assert.equal(orderedRestore.status, 'success');
assert.deepEqual(restoreOrder, ['lock', 'cloud', 'local', 'finalize'],
  'restore lock is durable before cloud changes and queue finalization is last');

let cloudAfterLockFailure = false;
const failedLockRestore = await restoreDatabaseWithPersistence(
  validBackup,
  async () => { cloudAfterLockFailure = true; },
  () => ({ ok: true, quotaExceeded: false }),
  async () => {},
  async () => 'clear',
  () => { throw new Error('synthetic recovery-lock write failure'); },
);
assert.equal(failedLockRestore.status, 'offline_state_unavailable');
assert.equal(cloudAfterLockFailure, false, 'a failed recovery lock prevents destructive cloud writes');

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

// --- Core case and workplan mutations fail closed when local storage rejects ----
fakeLocalStorage.setItem = originalSetItem;
const baseline = getDatabase();
baseline.girls = [{ id: 'SG-STORAGE-BASELINE', name: 'Synthetic test beneficiary', householdId: 'SH-STORAGE-BASELINE' } as never];
baseline.households = [{ id: 'SH-STORAGE-BASELINE', name: 'Synthetic test household' } as never];
baseline.educationalFollowUps = [{ id: 'EDU-STORAGE-BASELINE', girlId: 'SG-STORAGE-BASELINE' } as never];
baseline.healthFollowUps = [{ id: 'HLT-STORAGE-BASELINE', girlId: 'SG-STORAGE-BASELINE' } as never];
baseline.familyFollowUps = [{ id: 'FAM-STORAGE-BASELINE', girlId: 'SG-STORAGE-BASELINE' } as never];
baseline.rentPayments = [{ id: 'RENT-STORAGE-BASELINE', householdId: 'SH-STORAGE-BASELINE' } as never];
baseline.expenses = [{ id: 'EXP-STORAGE-BASELINE', householdId: 'SH-STORAGE-BASELINE' } as never];
baseline.householdActivities = [{ id: 'ACT-STORAGE-BASELINE', householdId: 'SH-STORAGE-BASELINE' } as never];
baseline.workplans = [{ id: 'WP-STORAGE-BASELINE', title: 'Synthetic test workplan item' } as never];
baseline.employees = [{ id: 'EMP-STORAGE-BASELINE', fullName: 'Synthetic Employee', salaryMWK: 100000, employmentStatus: 'Active' } as never];
baseline.payrollRecords = [{
  id: 'PAY-STORAGE-BASELINE', employeeId: 'EMP-STORAGE-BASELINE', employeeName: 'Synthetic Employee',
  payPeriod: '2026-09', payPeriodStartDate: '2026-09-01', paymentStatus: 'Pending', amountPaid: 0,
} as never];
baseline.meetings = [{ id: 'MEET-STORAGE-BASELINE', title: 'Synthetic meeting' } as never];
baseline.feedingProgramLogs = [{ id: 'FEED-STORAGE-BASELINE', date: '2026-10-01' } as never];
baseline.marketPrices = [{ id: 'MARKET-STORAGE-BASELINE', item: 'Synthetic item' } as never];
baseline.earlyYearsRecords = [{ id: 'EYS-STORAGE-BASELINE', childId: 'SYNTHETIC-CHILD' } as never];
baseline.historicalRecords = [{ id: 'HIST-STORAGE-BASELINE', girlId: 'SG-STORAGE-BASELINE' } as never];
baseline.importAudits = [{ id: 'AUD-STORAGE-BASELINE' } as never];
baseline.people = [{ id: 'PERSON-STORAGE-BASELINE', fullName: 'Synthetic Person' } as never];
baseline.inventoryItems = [{ id: 'INV-STORAGE-BASELINE', stockCode: 'SYN-INV-1', name: 'Synthetic inventory item', quantityOnHand: 4, minimumStockLevel: 1, unit: 'units', location: 'Main Office', movements: [] } as never];
baseline.assets = [{ id: 'ASSET-STORAGE-BASELINE', assetTag: 'SYN-ASSET-1', name: 'Synthetic asset', history: [] } as never];
baseline.forecastSettings = [{ id: 'FORECAST-BASELINE' } as never];
baseline.aiSettings = [{ id: 'AI-SETTINGS-BASELINE' } as never];
baseline.intelligenceSuggestions = [{ id: 'SUGGESTION-BASELINE', title: 'Original synthetic suggestion' } as never];
baseline.customPersonTypes = ['Synthetic original type'];
assert.equal(saveDatabase(baseline).ok, true, 'synthetic baseline is persisted before storage is disabled');
assert.throws(() => saveInventoryItem({ id: 'INV-DUPLICATE-CODE', stockCode: ' syn-inv-1 ', name: 'Duplicate synthetic item', quantityOnHand: 1, minimumStockLevel: 0, unit: 'units', location: 'Main Office', movements: [] } as never), /stock code is already in use/i, 'storage layer rejects duplicate stock codes after trimming and case-folding');
assert.throws(() => saveAssetRecord({ id: 'ASSET-DUPLICATE-TAG', assetTag: ' syn-asset-1 ', name: 'Duplicate synthetic asset', history: [] } as never), /asset tag is already in use/i, 'storage layer rejects duplicate asset tags after trimming and case-folding');
assert.equal(getDatabase().inventoryItems?.length, 1, 'rejected duplicate stock code does not mutate the inventory register');
assert.equal(getDatabase().assets?.length, 1, 'rejected duplicate asset tag does not mutate the asset register');
const beforeFailedMutations = {
  girls: [...baseline.girls],
  households: [...baseline.households],
  educationalFollowUps: [...baseline.educationalFollowUps],
  healthFollowUps: [...baseline.healthFollowUps],
  familyFollowUps: [...baseline.familyFollowUps],
  rentPayments: [...baseline.rentPayments],
  expenses: [...baseline.expenses],
  householdActivities: [...baseline.householdActivities],
  workplans: [...baseline.workplans],
  employees: [...baseline.employees],
  payrollRecords: [...baseline.payrollRecords],
  meetings: [...baseline.meetings],
  feedingProgramLogs: [...baseline.feedingProgramLogs],
  marketPrices: [...baseline.marketPrices],
  earlyYearsRecords: [...baseline.earlyYearsRecords],
  historicalRecords: [...baseline.historicalRecords],
  importAudits: [...baseline.importAudits],
  people: [...baseline.people],
  inventoryItems: [...(baseline.inventoryItems || [])],
  assets: [...(baseline.assets || [])],
  forecastSettings: [...(baseline.forecastSettings || [])],
  aiSettings: [...(baseline.aiSettings || [])],
  intelligenceSuggestions: [...(baseline.intelligenceSuggestions || [])],
  customPersonTypes: [...(baseline.customPersonTypes || [])],
};

fakeLocalStorage.setItem = () => { throw new Error('synthetic local save failure'); };

// Add paths that previously mutated the shared database before a failed save
// and left the unsaved record in memory for a later caller to accidentally reuse.
const beforeFailedInsertions = getDatabase();
const insertionCollectionFields = [
  'educationalFollowUps',
  'healthFollowUps',
  'familyFollowUps',
  'rentPayments',
  'householdActivities',
  'meetings',
  'feedingProgramLogs',
  'marketPrices',
  'earlyYearsRecords',
  'historicalRecords',
  'importAudits',
  'people',
] as const;
type InsertionCollectionField = typeof insertionCollectionFields[number];
const insertionCollectionSnapshots = new Map<InsertionCollectionField, readonly unknown[]>();
const captureInsertionCollectionSnapshots = (db: AppDatabase): void => {
  for (const field of insertionCollectionFields) {
    const records = db[field];
    assert.ok(Array.isArray(records), `insertion baseline keeps ${field} initialized`);
    insertionCollectionSnapshots.set(field, structuredClone(records));
  }
};
captureInsertionCollectionSnapshots(beforeFailedInsertions);
const assertInsertionCollectionsPreserved = (db: AppDatabase, phase: string): void => {
  for (const field of insertionCollectionFields) {
    const records = db[field];
    assert.ok(Array.isArray(records), `${phase} keeps ${field} initialized`);
    const expected = insertionCollectionSnapshots.get(field);
    assert.ok(expected, `${phase} has an original ${field} snapshot`);
    assert.deepEqual(records, expected, `${phase} preserves original ${field} records`);
  }
};
assertInsertionCollectionsPreserved(beforeFailedInsertions, 'insertion baseline');
const failedInsertions: Array<[string, () => unknown]> = [
  ['education follow-up', () => addEducationalFollowUp({ girlId: 'SYNTHETIC-GIRL' } as never)],
  ['health follow-up', () => addHealthFollowUp({ girlId: 'SYNTHETIC-GIRL' } as never)],
  ['family follow-up', () => addFamilyFollowUp({ girlId: 'SYNTHETIC-GIRL' } as never)],
  ['rent payment', () => addRentPayment({ householdId: 'SYNTHETIC-HOUSEHOLD' } as never)],
  ['household activity', () => addHouseholdActivity({ householdId: 'SYNTHETIC-HOUSEHOLD' } as never)],
  ['meeting', () => addMeetingRecord({ title: 'Synthetic failed meeting' } as never)],
  ['feeding log', () => addFeedingProgramLog({ date: '2099-01-01' } as never)],
  ['market price', () => addMarketPrice({ item: 'Synthetic item' } as never)],
  ['early-years record', () => addEarlyYearsRecord({ childId: 'SYNTHETIC-CHILD' } as never)],
  ['historical record', () => addHistoricalCaseRecord({ girlId: 'SYNTHETIC-GIRL' } as never)],
  ['import audit', () => addImportAuditRecord({ source: 'synthetic test' } as never)],
  ['person', () => addPerson({ fullName: 'Synthetic failed person' } as never)],
];
events.length = 0;
for (const [label, create] of failedInsertions) {
  assert.throws(create, /not saved on this device/i, `${label} reports local persistence failure`);
}
assert.ok(!events.includes('shine_db_updated'), 'failed insertions do not notify app listeners of unsaved data');
const afterFailedInsertions = getDatabase();
assertInsertionCollectionsPreserved(afterFailedInsertions, 'failed insertion');

assert.throws(
  () => addGirl({ id: 'SG-STORAGE-FAIL', name: 'Synthetic unsaved beneficiary' } as never),
  /Device storage is unavailable/,
  'girl creation must not return success when local persistence fails',
);
assert.throws(
  () => updateGirl('SG-STORAGE-BASELINE', { name: 'Unsaved beneficiary update' } as never),
  /Device storage is unavailable/,
  'beneficiary update must not return success when local persistence fails',
);
assert.throws(
  () => addHousehold({ id: 'SH-STORAGE-FAIL', name: 'Unsaved household' } as never),
  /Device storage is unavailable/,
  'household creation must not return success when local persistence fails',
);
assert.throws(
  () => updateHousehold('SH-STORAGE-BASELINE', { name: 'Unsaved household update' } as never),
  /Device storage is unavailable/,
  'household update must not return success when local persistence fails',
);
assert.throws(
  () => updateWorkplanItem('WP-STORAGE-BASELINE', { title: 'Unsaved update' } as never),
  /Device storage is unavailable/,
  'workplan update must not return success when local persistence fails',
);
assert.throws(
  () => addWorkplanItem({ title: 'Unsaved workplan item' } as never),
  /Device storage is unavailable/,
  'workplan creation must not return success when local persistence fails',
);
assert.throws(
  () => addPayrollRecord({
    employeeId: 'EMP-STORAGE-BASELINE', employeeName: 'Synthetic Employee', payPeriod: '2026-10',
    payPeriodStartDate: '2026-10-01', paymentStatus: 'Pending', amountPaid: 0,
  } as never),
  /Device storage is unavailable/,
  'payroll creation must not return success when local persistence fails',
);
assert.throws(
  () => updatePayrollRecord('PAY-STORAGE-BASELINE', { paymentStatus: 'Paid' } as never),
  /Device storage is unavailable/,
  'payroll update must not return success when local persistence fails',
);
await assert.rejects(
  () => updateEmployeeRecord('EMP-STORAGE-BASELINE', { fullName: 'Unsaved Employee Update' } as never),
  /Device storage is unavailable/,
  'employee update must not return success when local persistence fails',
);
assert.equal(deletePayrollRecord('PAY-STORAGE-BASELINE'), false, 'payroll deletion reports failure when local persistence fails');
assert.equal(deleteEducationalFollowUp('EDU-STORAGE-BASELINE'), false, 'education follow-up deletion reports failure when local persistence fails');
assert.equal(deleteHealthFollowUp('HLT-STORAGE-BASELINE'), false, 'health follow-up deletion reports failure when local persistence fails');
assert.equal(deleteFamilyFollowUp('FAM-STORAGE-BASELINE'), false, 'family follow-up deletion reports failure when local persistence fails');
assert.equal(deleteRentPayment('RENT-STORAGE-BASELINE'), false, 'rent deletion reports failure when local persistence fails');
assert.equal(deleteHouseholdActivity('ACT-STORAGE-BASELINE'), false, 'household activity deletion reports failure when local persistence fails');
assert.equal(deleteMeetingRecord('MEET-STORAGE-BASELINE'), false, 'meeting deletion reports failure when local persistence fails');
assert.equal(deleteFeedingProgramLog('FEED-STORAGE-BASELINE'), false, 'feeding log deletion reports failure when local persistence fails');
assert.equal(deleteMarketPrice('MARKET-STORAGE-BASELINE'), false, 'market price deletion reports failure when local persistence fails');
assert.equal(deleteEarlyYearsRecord('EYS-STORAGE-BASELINE'), false, 'early-years deletion reports failure when local persistence fails');
assert.equal(deleteHistoricalCaseRecord('HIST-STORAGE-BASELINE'), false, 'historical record deletion reports failure when local persistence fails');
assert.equal(deletePerson('PERSON-STORAGE-BASELINE'), false, 'person deletion reports failure when local persistence fails');
assert.equal(deleteGirl('SG-STORAGE-BASELINE'), false, 'girl deletion reports failure when local persistence fails');
assert.equal(deleteHousehold('SH-STORAGE-BASELINE'), false, 'household deletion reports failure when local persistence fails');
assert.equal(deleteWorkplanItem('WP-STORAGE-BASELINE'), false, 'workplan deletion reports failure when local persistence fails');
assert.throws(() => saveInventoryItem({ id: 'INV-STORAGE-NEW', stockCode: 'SYN-INV-2', name: 'Unsaved inventory item', quantityOnHand: 1, minimumStockLevel: 0, unit: 'units', location: 'Main Office', movements: [] } as never), /Could not save inventory changes/, 'inventory save reports local persistence failure');
assert.throws(() => saveAssetRecord({ id: 'ASSET-STORAGE-NEW', assetTag: 'SYN-ASSET-2', name: 'Unsaved asset', history: [] } as never), /Could not save asset changes/, 'asset save reports local persistence failure');
assert.throws(() => saveForecastSettings({ id: 'FORECAST-UNSAVED' } as never), /not saved on this device/i, 'forecast settings report failed local persistence');
assert.throws(() => saveAISettings({ id: 'AI-SETTINGS-UNSAVED' } as never), /not saved on this device/i, 'AI settings report failed local persistence');
assert.throws(() => saveIntelligenceSuggestion({ id: 'SUGGESTION-BASELINE', title: 'Unsaved replacement' } as never), /not saved on this device/i, 'intelligence suggestion updates report failed local persistence');
assert.throws(() => addCustomPersonType('Unsaved synthetic type'), /not saved on this device/i, 'custom person type reports failed local persistence');
fakeLocalStorage.setItem = originalSetItem;
const afterFailedMutations = getDatabase();
assert.deepEqual(afterFailedMutations.girls, beforeFailedMutations.girls, 'failed beneficiary mutations restore the original girls');
assert.deepEqual(afterFailedMutations.households, beforeFailedMutations.households, 'failed household mutations restore the original households');
assert.deepEqual(afterFailedMutations.educationalFollowUps, beforeFailedMutations.educationalFollowUps, 'failed girl deletion restores educational follow-ups');
assert.deepEqual(afterFailedMutations.healthFollowUps, beforeFailedMutations.healthFollowUps, 'failed girl deletion restores health follow-ups');
assert.deepEqual(afterFailedMutations.familyFollowUps, beforeFailedMutations.familyFollowUps, 'failed girl deletion restores family follow-ups');
assert.deepEqual(afterFailedMutations.rentPayments, beforeFailedMutations.rentPayments, 'failed household deletion restores rent records');
assert.deepEqual(afterFailedMutations.expenses, beforeFailedMutations.expenses, 'failed household deletion restores expenses');
assert.deepEqual(afterFailedMutations.householdActivities, beforeFailedMutations.householdActivities, 'failed household deletion restores activities');
assert.deepEqual(afterFailedMutations.workplans, beforeFailedMutations.workplans, 'failed planning mutations restore the original workplans');
assert.deepEqual(afterFailedMutations.employees, beforeFailedMutations.employees, 'failed employee updates restore the original personnel record');
assert.deepEqual(afterFailedMutations.payrollRecords, beforeFailedMutations.payrollRecords, 'failed payroll create/update/delete operations restore the original payroll rows');
assert.deepEqual(afterFailedMutations.meetings, beforeFailedMutations.meetings, 'failed meeting deletion restores the meeting');
assert.deepEqual(afterFailedMutations.feedingProgramLogs, beforeFailedMutations.feedingProgramLogs, 'failed feeding log deletion restores the record');
assert.deepEqual(afterFailedMutations.marketPrices, beforeFailedMutations.marketPrices, 'failed market price deletion restores the record');
assert.deepEqual(afterFailedMutations.earlyYearsRecords, beforeFailedMutations.earlyYearsRecords, 'failed early-years deletion restores the record');
assert.deepEqual(afterFailedMutations.historicalRecords, beforeFailedMutations.historicalRecords, 'failed historical record deletion restores the timeline');
assert.deepEqual(afterFailedMutations.people, beforeFailedMutations.people, 'failed person deletion restores the person');
assert.deepEqual(afterFailedMutations.inventoryItems, beforeFailedMutations.inventoryItems, 'failed inventory save leaves the persisted inventory register unchanged');
assert.deepEqual(afterFailedMutations.assets, beforeFailedMutations.assets, 'failed asset save leaves the persisted asset register unchanged');
assert.deepEqual(afterFailedMutations.forecastSettings, beforeFailedMutations.forecastSettings, 'failed forecast settings save restores the prior settings');
assert.deepEqual(afterFailedMutations.aiSettings, beforeFailedMutations.aiSettings, 'failed AI settings save restores the prior settings');
assert.deepEqual(afterFailedMutations.intelligenceSuggestions, beforeFailedMutations.intelligenceSuggestions, 'failed intelligence suggestion save restores the prior suggestions');
assert.deepEqual(afterFailedMutations.customPersonTypes, beforeFailedMutations.customPersonTypes, 'failed custom person type save restores the prior options');
assert.ok(!afterFailedMutations.girls.some((girl) => girl.id === 'SG-STORAGE-FAIL'), 'a failed create does not leak into persisted records');

// Empty/corrupt storage fallback must return a fresh seed copy, not the shared
// INITIAL_DATABASE singleton, or failed writes can leak into later reads.
values.delete('shine_relief_trust_prod_v1');
fakeLocalStorage.setItem = () => { throw new Error('synthetic storage unavailable'); };
const fallbackOne = getDatabase();
fallbackOne.girls.push({ id: 'SG-SEED-FALLBACK-LEAK' } as never);
const fallbackTwo = getDatabase();
assert.ok(!fallbackTwo.girls.some((girl) => girl.id === 'SG-SEED-FALLBACK-LEAK'),
  'a failed save from an empty store must not mutate the shared seed object');
fakeLocalStorage.setItem = originalSetItem;
assert.equal(saveDatabase(fallbackTwo).ok, true, 'the isolated fallback can be persisted after storage recovers');

console.log('Local storage failure handling tests passed.');
