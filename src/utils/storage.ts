import {
  AppDatabase,
  Girl,
  Household,
  EducationalFollowUp,
  HealthFollowUp,
  FamilyFollowUp,
  HouseholdRentPayment,
  HouseholdExpense,
  HouseholdActivity,
  BudgetItem,
  AnnualBudgetPlan,
  EmployeeRecord,
  PayrollRecord,
  WorkplanItem,
  ScheduleItem,
  HistoricalCaseRecord,
  ImportAuditRecord,
  ProcurementList,
  ProjectProjection,
  EarlyYearsRecord,
  Person,
  MeetingRecord,
  FeedingProgramLog,
  MarketPriceRecord,
  ForecastSettings,
  WhatIfScenario,
  IntelligenceSuggestion,
  AISettings,
  InventoryItem,
  AssetRecord,
} from '../types';
import { INITIAL_DATABASE } from '../data/seedData';
import { clearOfflineChangesAfterDatabaseReset, inspectPendingOfflineChanges, isDatabaseResetRecoveryRequired, markDatabaseResetRecoveryRequired } from '../services/offlineSync';
import { getAllAttachmentMetadata } from '../services/attachmentService';
import { updateExpenseWithAudit, withExpenseCreationAudit } from '../services/expenseAudit';
import {
  persistGirlToFirestore,
  deleteGirlFromFirestore,
  persistHouseholdToFirestore,
  deleteHouseholdFromFirestore,
  persistEduFollowUpToFirestore,
  deleteEduFollowUpFromFirestore,
  persistHealthFollowUpToFirestore,
  deleteHealthFollowUpFromFirestore,
  persistFamilyFollowUpToFirestore,
  deleteFamilyFollowUpFromFirestore,
  persistRentPaymentToFirestore,
  deleteRentPaymentFromFirestore,
  persistExpenseToFirestore,
  deleteExpenseFromFirestore,
  persistHouseholdActivityToFirestore,
  deleteHouseholdActivityFromFirestore,
  persistBudgetItemToFirestore,
  deleteBudgetItemFromFirestore,
  persistAnnualBudgetPlanToFirestore,
  deleteAnnualBudgetPlanFromFirestore,
  persistPayrollRecordToFirestore,
  deletePayrollRecordFromFirestore,
  persistEmployeeRecordToFirestore,
  persistWorkplanItemToFirestore,
  deleteWorkplanItemFromFirestore,
  persistHistoricalCaseRecordToFirestore,
  deleteHistoricalCaseRecordFromFirestore,
  persistImportAuditToFirestore,
  persistPersonToFirestore,
  deletePersonFromFirestore,
  clearAllFirestoreCollections,
  syncEntireDatabaseToFirestore,
  persistPhase2Record,
  appendCaseActionAudit,
  persistMeetingToFirestore,
  deleteMeetingFromFirestore,
  persistFeedingProgramLogToFirestore,
  deleteFeedingProgramLogFromFirestore,
  persistMarketPriceToFirestore,
  deleteMarketPriceFromFirestore,
  persistForecastSettingsToFirestore,
  persistWhatIfScenarioToFirestore,
  persistIntelligenceSuggestionToFirestore,
  persistAISettingsToFirestore,
  persistEarlyYearsRecordToFirestore,
  deleteEarlyYearsRecordFromFirestore,
} from '../services/firestoreSync';
import {
  CaseAction,
  EducationHistoryRecord,
  AcademicSupportRecord,
  ExaminationRecord,
  AttendanceRecord,
  GirlLeaveRecord,
  ProgrammeLogRecord,
  CaseReview,
} from '../types';

const STORAGE_KEY = 'shine_relief_trust_prod_v1';
const LEGACY_STORAGE_KEY = 'shine_relief_trust_db_v1';

/** Dispatched when a local save fails so the UI can show a persistent banner. */
export const STORAGE_WARNING_EVENT = 'shine_storage_warning';
export const STORAGE_RECOVERED_EVENT = 'shine_storage_recovered';

export interface StorageSaveResult {
  ok: boolean;
  quotaExceeded: boolean;
  error?: unknown;
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: number };
  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

function dispatchStorageEvent(name: string, detail?: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function cloneInitialDatabase(): AppDatabase {
  // Never hand callers the shared seed object: a failed local save must not
  // mutate the in-memory seed and make unsaved changes appear to survive.
  return JSON.parse(JSON.stringify(INITIAL_DATABASE)) as AppDatabase;
}

export function getDatabase(): AppDatabase {
  if (typeof window === 'undefined') return cloneInitialDatabase();
  try {
    // Purge any old demo key from previous test sessions
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = cloneInitialDatabase();
      saveDatabase(initial, false);
      return initial;
    }
    const parsed = JSON.parse(raw);
    return {
      girls: parsed.girls || [],
      households: parsed.households || [],
      educationalFollowUps: parsed.educationalFollowUps || [],
      healthFollowUps: parsed.healthFollowUps || [],
      familyFollowUps: parsed.familyFollowUps || [],
      rentPayments: parsed.rentPayments || [],
      expenses: parsed.expenses || [],
      householdActivities: parsed.householdActivities || [],
      contacts: parsed.contacts || [],
      attachments: parsed.attachments || [],
      budgets: parsed.budgets || [],
      annualBudgets: parsed.annualBudgets || [],
      payrollRecords: parsed.payrollRecords || [],
      employees: parsed.employees || [],
      workplans: parsed.workplans || [],
      schedules: parsed.schedules || [],
      meetings: parsed.meetings || [],
      feedingProgramLogs: parsed.feedingProgramLogs || [],
      marketPrices: parsed.marketPrices || [],
      forecastSettings: parsed.forecastSettings || [],
      whatIfScenarios: parsed.whatIfScenarios || [],
      intelligenceSuggestions: parsed.intelligenceSuggestions || [],
      aiSettings: parsed.aiSettings || [],
      historicalRecords: parsed.historicalRecords || [],
      importAudits: parsed.importAudits || [],
      restrictedImportSources: parsed.restrictedImportSources || [],
      earlyYearsRecords: parsed.earlyYearsRecords || [],
      people: parsed.people || [],
      customPersonTypes: parsed.customPersonTypes || [],
      caseActions: parsed.caseActions || [],
      educationHistory: parsed.educationHistory || [],
      academicSupports: parsed.academicSupports || [],
      examinationRecords: parsed.examinationRecords || [],
      attendanceRecords: parsed.attendanceRecords || [],
      girlLeaves: parsed.girlLeaves || [],
      programmeLogs: Array.isArray(parsed.programmeLogs) ? parsed.programmeLogs : [],
      caseReviews: parsed.caseReviews || [],
      caseGoals: parsed.caseGoals || [],
      procurementLists: parsed.procurementLists || [],
      projectProjections: parsed.projectProjections || [],
      inventoryItems: Array.isArray(parsed.inventoryItems) ? parsed.inventoryItems : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    };
  } catch (error) {
    console.error('Error reading database from localStorage:', error);
    return cloneInitialDatabase();
  }
}

export function saveDatabase(db: AppDatabase, dispatchEvent: boolean = true): StorageSaveResult {
  if (typeof window === 'undefined') return { ok: true, quotaExceeded: false };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    if (dispatchEvent) {
      window.dispatchEvent(new Event('shine_db_updated'));
    }
    // A previous failure may now be resolved (space freed or back online).
    dispatchStorageEvent(STORAGE_RECOVERED_EVENT);
    return { ok: true, quotaExceeded: false };
  } catch (error) {
    const quotaExceeded = isQuotaExceededError(error);
    console.error('Error saving database to localStorage:', error);
    // Storage health must always reach the warning banner. dispatchEvent only
    // controls the database-updated notification, not failure/recovery signals.
    dispatchStorageEvent(STORAGE_WARNING_EVENT, { quotaExceeded, error });
    return { ok: false, quotaExceeded, error };
  }
}

/**
 * Financial/staff mutations must not start a cloud write when the device
 * rejected the local save. This prevents a UI success from masking a split
 * local/cloud record state.
 */
function saveDatabaseOrThrow(db: AppDatabase, recordType: string): void {
  const result = saveDatabase(db);
  if (!result.ok) {
    const reason = result.quotaExceeded
      ? 'Device storage is full.'
      : 'Device storage is unavailable.';
    throw new Error(`${recordType} was not saved on this device, so the cloud write was not started. ${reason} Free storage and retry.`);
  }
}

export async function clearAllDatabase(): Promise<AppDatabase> {
  // Lock offline replay before the first destructive cloud operation. If any
  // later step fails, queued edits stay paused instead of recreating deleted data.
  markDatabaseResetRecoveryRequired();
  await clearAllFirestoreCollections();
  const localSave = saveDatabase(INITIAL_DATABASE);
  if (!localSave.ok) {
    throw new Error(
      'Cloud operational records may already have been cleared, but this device could not save the reset. Offline synchronization is paused to prevent old edits from recreating records. Fix device storage, then retry the administrator reset.'
    );
  }
  // Clears pending edits and removes the recovery lock only after cloud and local
  // reset succeeded. If queue cleanup fails, the lock remains in place.
  await clearOfflineChangesAfterDatabaseReset(INITIAL_DATABASE);
  return INITIAL_DATABASE;
}

export const resetDatabaseToDefault = clearAllDatabase;
export const resetDatabaseToSeed = clearAllDatabase;

export async function exportDatabaseJSON(): Promise<string> {
  const db = getDatabase();
  db.attachments = await getAllAttachmentMetadata();
  return JSON.stringify(db, null, 2);
}

export function normalizeImportedDatabase(parsed: Partial<AppDatabase>): AppDatabase {
  return {
    girls: Array.isArray(parsed.girls) ? parsed.girls : [],
    households: Array.isArray(parsed.households) ? parsed.households : [],
    educationalFollowUps: Array.isArray(parsed.educationalFollowUps) ? parsed.educationalFollowUps : [],
    healthFollowUps: Array.isArray(parsed.healthFollowUps) ? parsed.healthFollowUps : [],
    familyFollowUps: Array.isArray(parsed.familyFollowUps) ? parsed.familyFollowUps : [],
    rentPayments: Array.isArray(parsed.rentPayments) ? parsed.rentPayments : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    householdActivities: Array.isArray(parsed.householdActivities) ? parsed.householdActivities : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
    annualBudgets: Array.isArray(parsed.annualBudgets) ? parsed.annualBudgets : [],
    payrollRecords: Array.isArray(parsed.payrollRecords) ? parsed.payrollRecords : [],
    employees: Array.isArray(parsed.employees) ? parsed.employees : [],
    workplans: Array.isArray(parsed.workplans) ? parsed.workplans : [],
    schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
    meetings: Array.isArray(parsed.meetings) ? parsed.meetings : [],
    feedingProgramLogs: Array.isArray(parsed.feedingProgramLogs) ? parsed.feedingProgramLogs : [],
    marketPrices: Array.isArray(parsed.marketPrices) ? parsed.marketPrices : [],
    forecastSettings: Array.isArray(parsed.forecastSettings) ? parsed.forecastSettings : [],
    whatIfScenarios: Array.isArray(parsed.whatIfScenarios) ? parsed.whatIfScenarios : [],
    intelligenceSuggestions: Array.isArray(parsed.intelligenceSuggestions) ? parsed.intelligenceSuggestions : [],
    aiSettings: Array.isArray(parsed.aiSettings) ? parsed.aiSettings : [],
    historicalRecords: Array.isArray(parsed.historicalRecords) ? parsed.historicalRecords : [],
    importAudits: Array.isArray(parsed.importAudits) ? parsed.importAudits : [],
    restrictedImportSources: Array.isArray(parsed.restrictedImportSources) ? parsed.restrictedImportSources : [],
    earlyYearsRecords: Array.isArray(parsed.earlyYearsRecords) ? parsed.earlyYearsRecords : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    customPersonTypes: Array.isArray(parsed.customPersonTypes) ? parsed.customPersonTypes : [],
    caseActions: Array.isArray(parsed.caseActions) ? parsed.caseActions : [],
    educationHistory: Array.isArray(parsed.educationHistory) ? parsed.educationHistory : [],
    academicSupports: Array.isArray(parsed.academicSupports) ? parsed.academicSupports : [],
    examinationRecords: Array.isArray(parsed.examinationRecords) ? parsed.examinationRecords : [],
    attendanceRecords: Array.isArray(parsed.attendanceRecords) ? parsed.attendanceRecords : [],
    girlLeaves: Array.isArray(parsed.girlLeaves) ? parsed.girlLeaves : [],
    programmeLogs: Array.isArray(parsed.programmeLogs) ? parsed.programmeLogs : [],
    caseReviews: Array.isArray(parsed.caseReviews) ? parsed.caseReviews : [],
    caseGoals: Array.isArray(parsed.caseGoals) ? parsed.caseGoals : [],
    procurementLists: Array.isArray(parsed.procurementLists) ? parsed.procurementLists : [],
    projectProjections: Array.isArray(parsed.projectProjections) ? parsed.projectProjections : [],
    inventoryItems: Array.isArray(parsed.inventoryItems) ? parsed.inventoryItems : [],
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
  };
}

export type DatabaseRestoreResult =
  | { status: 'success' }
  | { status: 'invalid_backup'; message: string }
  | { status: 'pending_offline_changes'; message: string }
  | { status: 'offline_state_unavailable'; message: string }
  | { status: 'cloud_sync_failed'; message: string }
  | { status: 'cloud_updated_local_save_failed'; message: string }
  | { status: 'queue_cleanup_failed'; message: string };

/**
 * Restore orchestration is injectable so local/cloud partial-failure outcomes
 * can be regression-tested without a live Firebase project.
 *
 * Cloud sync runs first to avoid replacing the only local copy when Firestore
 * rejects the restore. Firestore batches are not transactional across the full
 * database, so a cloud error may still mean some earlier batches were applied.
 */
export async function restoreDatabaseWithPersistence(
  rawJson: string,
  persistCloud: (db: AppDatabase) => Promise<void>,
  persistLocal: (db: AppDatabase) => StorageSaveResult,
  finalizeLocalRestore: (db: AppDatabase) => Promise<void> = async () => {},
  inspectPendingOfflineChanges: () => Promise<'clear' | 'pending' | 'unavailable'> = async () => 'clear',
  beginRestoreRecovery: () => void = () => {},
): Promise<DatabaseRestoreResult> {
  let validatedDb: AppDatabase;
  try {
    const parsed = JSON.parse(rawJson) as Partial<AppDatabase>;
    if (!Array.isArray(parsed.girls) || !Array.isArray(parsed.households)) {
      return { status: 'invalid_backup', message: 'The file is not a valid SHINE database backup.' };
    }
    validatedDb = normalizeImportedDatabase(parsed);
  } catch {
    return { status: 'invalid_backup', message: 'The file is not valid JSON or is not a valid SHINE database backup.' };
  }

  let pendingState: 'clear' | 'pending' | 'unavailable';
  try {
    pendingState = await inspectPendingOfflineChanges();
  } catch {
    pendingState = 'unavailable';
  }
  if (pendingState === 'pending') {
    return {
      status: 'pending_offline_changes',
      message: 'This device has unsynchronized offline changes. Sync them first, then retry the restore so older edits cannot overwrite restored records.',
    };
  }
  if (pendingState === 'unavailable') {
    return {
      status: 'offline_state_unavailable',
      message: 'SHINE could not verify the offline change queue, so the restore was not started. Check device storage and retry.',
    };
  }

  // Persist a recovery lock before the first destructive cloud write. If a
  // later batch fails, queued offline edits must not repopulate partially
  // restored collections. The lock is cleared only by successful finalization.
  try {
    beginRestoreRecovery();
  } catch (err) {
    console.error('Could not establish database restore recovery lock:', err);
    return {
      status: 'offline_state_unavailable',
      message: 'SHINE could not protect the offline queue before restoring. No cloud restore was started; check device storage and retry.',
    };
  }

  try {
    await persistCloud(validatedDb);
  } catch (err) {
    console.error('Database restore cloud synchronization failed:', err);
    return {
      status: 'cloud_sync_failed',
      message: 'Cloud restore failed. Some Firestore batches may already have been applied; the local database was not replaced. Check cloud records before retrying.',
    };
  }

  const localResult = persistLocal(validatedDb);
  if (!localResult.ok) {
    return {
      status: 'cloud_updated_local_save_failed',
      message: 'Cloud restore completed, but this device could not save the restored database. Existing local data remains in place. Free device storage and retry local recovery before editing records.',
    };
  }

  try {
    // Old offline edits must not replay over the newly restored database.
    await finalizeLocalRestore(validatedDb);
  } catch (err) {
    console.error('Database restored but offline queue cleanup failed:', err);
    return {
      status: 'queue_cleanup_failed',
      message: 'The restored database was saved locally and in the cloud, but this device could not clear its pending offline changes. Do not edit records or reconnect repeatedly yet; free device storage, then retry recovery so old queued edits cannot overwrite restored records.',
    };
  }

  return { status: 'success' };
}

export async function restoreDatabaseJSON(
  rawJson: string,
  options: { allowDiscardPendingChangesDuringRecovery?: boolean } = {},
): Promise<DatabaseRestoreResult> {
  const inspectQueueForRestore = async (): Promise<'clear' | 'pending' | 'unavailable'> => {
    const state = await inspectPendingOfflineChanges();
    // A recovery-locked restore may only discard queued edits after the admin
    // explicitly confirms in the UI. Unreadable/corrupt queue state still fails closed.
    if (
      state === 'pending' &&
      options.allowDiscardPendingChangesDuringRecovery === true &&
      isDatabaseResetRecoveryRequired()
    ) {
      return 'clear';
    }
    return state;
  };

  return restoreDatabaseWithPersistence(
    rawJson,
    (db) => syncEntireDatabaseToFirestore(db, true),
    (db) => saveDatabase(db),
    (db) => clearOfflineChangesAfterDatabaseReset(db),
    inspectQueueForRestore,
    markDatabaseResetRecoveryRequired,
  );
}

/** Backwards-compatible helper for existing callers that only need a success flag. */
export async function importDatabaseJSON(rawJson: string): Promise<boolean> {
  return (await restoreDatabaseJSON(rawJson)).status === 'success';
}

// ID Generators
export function generateGirlId(currentGirls: Girl[]): string {
  const existingNumbers = currentGirls
    .map((g) => {
      const match = g.id.match(/SG-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const max = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const next = max + 1;
  return `SG-${next.toString().padStart(3, '0')}`;
}

export function generateHouseholdId(currentHouses: Household[]): string {
  const existingNumbers = currentHouses
    .map((h) => {
      const match = h.id.match(/SH-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const max = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const next = max + 1;
  return `SH-${next.toString().padStart(2, '0')}`;
}

export function generateFollowUpId(prefix: string): string {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${timestamp}${random}`;
}

// Entity operations with automatic Firebase Firestore cloud persistence
export function addGirl(
  girl: Omit<Girl, 'createdAt' | 'updatedAt'>,
  auditActor?: string
): Girl {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newGirl: Girl = {
    ...girl,
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || girl.createdBy || 'SHINE Staff',
    updatedBy: auditActor || girl.updatedBy || 'SHINE Staff',
  };
  db.girls.unshift(newGirl);
  saveDatabaseOrThrow(db, 'girl record');
  // Persist directly to Cloud Firestore
  persistGirlToFirestore(newGirl).catch((err) =>
    console.error('Failed to persist girl to Firestore:', err)
  );
  return newGirl;
}

export function updateGirl(
  id: string,
  updates: Partial<Girl>,
  auditActor?: string
): Girl | null {
  const db = getDatabase();
  const index = db.girls.findIndex((g) => g.id === id);
  if (index === -1) return null;
  const updated: Girl = {
    ...db.girls[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || updates.updatedBy || db.girls[index].updatedBy || 'SHINE Staff',
  };
  db.girls[index] = updated;
  saveDatabaseOrThrow(db, 'girl record');
  // Persist update to Cloud Firestore
  persistGirlToFirestore(updated).catch((err) =>
    console.error('Failed to update girl in Firestore:', err)
  );
  return updated;
}

export function deleteGirl(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.girls.length;
  // Collect linked follow-up IDs for cloud deletion
  const linkedEdu = db.educationalFollowUps.filter((e) => e.girlId === id).map((e) => e.id);
  const linkedHealth = db.healthFollowUps.filter((h) => h.girlId === id).map((h) => h.id);
  const linkedFamily = db.familyFollowUps.filter((f) => f.girlId === id).map((f) => f.id);

  db.girls = db.girls.filter((g) => g.id !== id);
  db.educationalFollowUps = db.educationalFollowUps.filter((e) => e.girlId !== id);
  db.healthFollowUps = db.healthFollowUps.filter((h) => h.girlId !== id);
  db.familyFollowUps = db.familyFollowUps.filter((f) => f.girlId !== id);
  if (!saveDatabase(db).ok) return false;

  // Delete from Cloud Firestore
  deleteGirlFromFirestore(id, { edu: linkedEdu, health: linkedHealth, family: linkedFamily }).catch(
    (err) => console.error('Failed to delete girl from Firestore:', err)
  );
  return db.girls.length < initialLength;
}

export function addHousehold(
  household: Omit<Household, 'createdAt' | 'updatedAt'>,
  auditActor?: string
): Household {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newHouse: Household = {
    ...household,
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || household.createdBy || 'SHINE Staff',
    updatedBy: auditActor || household.updatedBy || 'SHINE Staff',
  };
  db.households.unshift(newHouse);
  saveDatabaseOrThrow(db, 'household record');
  // Persist directly to Cloud Firestore
  persistHouseholdToFirestore(newHouse).catch((err) =>
    console.error('Failed to persist household to Firestore:', err)
  );
  return newHouse;
}

export function updateHousehold(
  id: string,
  updates: Partial<Household>,
  auditActor?: string
): Household | null {
  const db = getDatabase();
  const index = db.households.findIndex((h) => h.id === id);
  if (index === -1) return null;
  const updated: Household = {
    ...db.households[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || updates.updatedBy || db.households[index].updatedBy || 'SHINE Staff',
  };
  db.households[index] = updated;
  saveDatabaseOrThrow(db, 'household record');
  // Persist update to Cloud Firestore
  persistHouseholdToFirestore(updated).catch((err) =>
    console.error('Failed to update household in Firestore:', err)
  );
  return updated;
}

export function deleteHousehold(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.households.length;
  // Collect affected girls and linked financial/activity logs
  const affectedGirlIds = db.girls.filter((g) => g.householdId === id).map((g) => g.id);
  const linkedRent = db.rentPayments.filter((r) => r.householdId === id).map((r) => r.id);
  const linkedExpense = db.expenses.filter((e) => e.householdId === id).map((e) => e.id);
  const linkedActivity = db.householdActivities.filter((a) => a.householdId === id).map((a) => a.id);

  db.households = db.households.filter((h) => h.id !== id);
  db.girls = db.girls.map((g) => (g.householdId === id ? { ...g, householdId: '' } : g));
  db.rentPayments = db.rentPayments.filter((r) => r.householdId !== id);
  db.expenses = db.expenses.filter((e) => e.householdId !== id);
  db.householdActivities = db.householdActivities.filter((a) => a.householdId !== id);
  if (!saveDatabase(db).ok) return false;

  // Delete from Cloud Firestore
  deleteHouseholdFromFirestore(id, affectedGirlIds, {
    rent: linkedRent,
    expense: linkedExpense,
    activity: linkedActivity,
  }).catch((err) => console.error('Failed to delete household from Firestore:', err));

  return db.households.length < initialLength;
}

export function deleteEducationalFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.educationalFollowUps.length;
  db.educationalFollowUps = db.educationalFollowUps.filter((e) => e.id !== id);
  if (!saveDatabase(db).ok) return false;
  deleteEduFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete educational follow-up from Firestore:', err)
  );
  return db.educationalFollowUps.length < initialLength;
}

export function deleteHealthFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.healthFollowUps.length;
  db.healthFollowUps = db.healthFollowUps.filter((h) => h.id !== id);
  if (!saveDatabase(db).ok) return false;
  deleteHealthFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete health follow-up from Firestore:', err)
  );
  return db.healthFollowUps.length < initialLength;
}

export function deleteFamilyFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.familyFollowUps.length;
  db.familyFollowUps = db.familyFollowUps.filter((f) => f.id !== id);
  if (!saveDatabase(db).ok) return false;
  deleteFamilyFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete family follow-up from Firestore:', err)
  );
  return db.familyFollowUps.length < initialLength;
}

export function deleteRentPayment(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.rentPayments.length;
  db.rentPayments = db.rentPayments.filter((r) => r.id !== id);
  if (!saveDatabase(db).ok) return false;
  deleteRentPaymentFromFirestore(id).catch((err) =>
    console.error('Failed to delete rent payment from Firestore:', err)
  );
  return db.rentPayments.length < initialLength;
}

export function deleteExpense(id: string): boolean {
  const db = getDatabase();
  const previousExpenses = db.expenses;
  const initialLength = previousExpenses.length;
  db.expenses = previousExpenses.filter((e) => e.id !== id);
  if (db.expenses.length === initialLength) return false;
  try {
    saveDatabaseOrThrow(db, 'Expense deletion');
  } catch (error) {
    db.expenses = previousExpenses;
    throw error;
  }
  deleteExpenseFromFirestore(id).catch((err) =>
    console.error('Failed to delete expense from Firestore:', err)
  );
  return true;
}

export function deleteHouseholdActivity(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.householdActivities.length;
  db.householdActivities = db.householdActivities.filter((a) => a.id !== id);
  if (!saveDatabase(db).ok) return false;
  deleteHouseholdActivityFromFirestore(id).catch((err) =>
    console.error('Failed to delete household activity from Firestore:', err)
  );
  return db.householdActivities.length < initialLength;
}

export function addEducationalFollowUp(
  item: Omit<EducationalFollowUp, 'id' | 'createdAt'>,
  auditActor?: string
): EducationalFollowUp {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: EducationalFollowUp = {
    ...item,
    id: generateFollowUpId('EDU'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.educationalFollowUps.unshift(newItem);
  saveDatabaseOrThrow(db, 'education follow-up');
  persistEduFollowUpToFirestore(newItem).catch((err) =>
    console.error('Failed to persist educational follow-up to Firestore:', err)
  );
  return newItem;
}

export function addHealthFollowUp(
  item: Omit<HealthFollowUp, 'id' | 'createdAt'>,
  auditActor?: string
): HealthFollowUp {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HealthFollowUp = {
    ...item,
    id: generateFollowUpId('HLT'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.healthFollowUps.unshift(newItem);
  saveDatabaseOrThrow(db, 'health follow-up');
  persistHealthFollowUpToFirestore(newItem).catch((err) =>
    console.error('Failed to persist health follow-up to Firestore:', err)
  );
  return newItem;
}

export function addFamilyFollowUp(
  item: Omit<FamilyFollowUp, 'id' | 'createdAt'>,
  auditActor?: string
): FamilyFollowUp {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: FamilyFollowUp = {
    ...item,
    id: generateFollowUpId('FAM'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.familyFollowUps.unshift(newItem);
  saveDatabaseOrThrow(db, 'family follow-up');
  persistFamilyFollowUpToFirestore(newItem).catch((err) =>
    console.error('Failed to persist family follow-up to Firestore:', err)
  );
  return newItem;
}

export function addRentPayment(
  item: Omit<HouseholdRentPayment, 'id' | 'createdAt'>,
  auditActor?: string
): HouseholdRentPayment {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HouseholdRentPayment = {
    ...item,
    id: generateFollowUpId('RNT'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  };
  db.rentPayments.unshift(newItem);
  saveDatabaseOrThrow(db, 'rent payment');
  persistRentPaymentToFirestore(newItem).catch((err) =>
    console.error('Failed to persist rent payment to Firestore:', err)
  );
  return newItem;
}

export function addExpense(
  item: Omit<HouseholdExpense, 'id' | 'createdAt'>,
  auditActor?: string
): HouseholdExpense {
  const db = getDatabase();
  const now = new Date().toISOString();
  const actor = auditActor || item.createdBy || 'SHINE Staff';
  const newItem = withExpenseCreationAudit({
    ...item,
    id: generateFollowUpId('EXP'),
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  }, actor, now);
  const previousExpenses = [...db.expenses];
  db.expenses.unshift(newItem);
  try {
    saveDatabaseOrThrow(db, 'Household expense');
  } catch (error) {
    db.expenses = previousExpenses;
    throw error;
  }
  persistExpenseToFirestore(newItem).catch((err) =>
    console.error('Failed to persist expense to Firestore:', err)
  );
  return newItem;
}

export function updateExpense(
  id: string,
  changes: Partial<Omit<HouseholdExpense, 'id' | 'householdId' | 'createdAt'>>,
  auditActor?: string,
): HouseholdExpense | undefined {
  const db = getDatabase();
  const existing = db.expenses.find((expense) => expense.id === id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const actor = auditActor || 'SHINE Staff';
  const updatedItem = updateExpenseWithAudit(existing, changes, actor, now);
  const previousExpenses = db.expenses;
  db.expenses = db.expenses.map((expense) => expense.id === id ? updatedItem : expense);
  try {
    saveDatabaseOrThrow(db, 'Expense update');
  } catch (error) {
    db.expenses = previousExpenses;
    throw error;
  }
  persistExpenseToFirestore(updatedItem).catch((err) =>
    console.error('Failed to persist expense update to Firestore:', err)
  );
  return updatedItem;
}

export function addHouseholdActivity(
  item: Omit<HouseholdActivity, 'id' | 'createdAt'>,
  auditActor?: string
): HouseholdActivity {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HouseholdActivity = {
    ...item,
    id: generateFollowUpId('ACT'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.householdActivities.unshift(newItem);
  saveDatabaseOrThrow(db, 'household activity');
  persistHouseholdActivityToFirestore(newItem).catch((err) =>
    console.error('Failed to persist household activity to Firestore:', err)
  );
  return newItem;
}

type Phase2TrackedRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

function addPhase2Record<T extends Phase2TrackedRecord>(
  dbField: string,
  collectionName: string,
  prefix: string,
  data: Omit<T, keyof Phase2TrackedRecord>,
  actor: string,
  stableId?: string,
): T {
  const db = getDatabase();
  const now = new Date().toISOString();
  const record = {
    ...data,
    id: stableId || generateFollowUpId(prefix),
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  } as T;
  const allData = db as unknown as Record<string, unknown>;
  const records = (allData[dbField] as T[] | undefined) || [];
  records.unshift(record);
  allData[dbField] = records;
  saveDatabaseOrThrow(db, 'case-management record');
  if (collectionName !== 'procurementLists') {
    // Procurement lists participate in the per-record offline queue. A parallel
    // direct setDoc would bypass baseUpdatedAt conflict checks.
    persistPhase2Record(collectionName, record).catch((err) =>
      console.error(`Failed to persist ${collectionName}:`, err)
    );
  }
  return record;
}

export function addCaseAction(
  data: Omit<CaseAction, keyof Phase2TrackedRecord | 'createdByUid' | 'updatedByUid' | 'id'> & { id?: string },
  actor: { uid: string; name: string }
): CaseAction {
  if (data.id) {
    const existing = (getDatabase().caseActions || []).find((action) => action.id === data.id);
    if (existing) return existing;
  }
  const { id, ...actionData } = data;
  const record = addPhase2Record<CaseAction>('caseActions', 'caseActions', 'ACTN', {
    ...actionData,
    createdByUid: actor.uid,
    updatedByUid: actor.uid,
  }, actor.name, id);
  appendCaseActionAudit({
    action: 'created',
    recordId: record.id,
    userId: actor.uid,
    userName: actor.name,
    timestamp: record.createdAt,
  }).catch((err) => console.error('Failed to write case-action audit:', err));
  return record;
}

export function updateCaseAction(
  id: string,
  updates: Partial<CaseAction>,
  actor: { uid: string; name: string }
): CaseAction | null {
  const db = getDatabase();
  const records = db.caseActions || [];
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = records[index];
  const now = new Date().toISOString();
  const updated: CaseAction = {
    ...current,
    ...updates,
    updatedBy: actor.name,
    updatedByUid: actor.uid,
    updatedAt: now,
    ...(updates.status === 'Completed' && current.status !== 'Completed'
      ? { completedAt: now }
      : {}),
  };
  records[index] = updated;
  db.caseActions = records;
  saveDatabaseOrThrow(db, 'case action');
  persistPhase2Record('caseActions', updated).catch((err) =>
    console.error('Failed to update case action:', err)
  );
  appendCaseActionAudit({
    action: 'updated',
    recordId: id,
    userId: actor.uid,
    userName: actor.name,
    timestamp: now,
    changedFields: Object.keys(updates),
  }).catch((err) => console.error('Failed to write case-action audit:', err));
  return updated;
}

export function addEducationHistoryRecord(
  data: Omit<EducationHistoryRecord, keyof Phase2TrackedRecord>, actorName: string
): EducationHistoryRecord {
  return addPhase2Record('educationHistory', 'educationHistory', 'EDH', data, actorName);
}

export function updateEducationHistoryRecord(
  id: string,
  updates: Partial<EducationHistoryRecord>,
  actorName: string
): EducationHistoryRecord | null {
  const db = getDatabase();
  const records = db.educationHistory || [];
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated = { ...records[index], ...updates, updatedBy: actorName, updatedAt: new Date().toISOString() };
  records[index] = updated;
  db.educationHistory = records;
  saveDatabaseOrThrow(db, 'education history');
  persistPhase2Record('educationHistory', updated).catch((err) => console.error('Failed to update education history:', err));
  return updated;
}

export function addAcademicSupportRecord(
  data: Omit<AcademicSupportRecord, keyof Phase2TrackedRecord>, actorName: string
): AcademicSupportRecord {
  return addPhase2Record('academicSupports', 'academicSupports', 'ACS', data, actorName);
}

export function addExaminationRecord(
  data: Omit<ExaminationRecord, keyof Phase2TrackedRecord>, actorName: string
): ExaminationRecord {
  return addPhase2Record('examinationRecords', 'examinationRecords', 'EXM', data, actorName);
}

export function addAttendanceRecord(
  data: Omit<AttendanceRecord, keyof Phase2TrackedRecord>, actorName: string
): AttendanceRecord {
  return addPhase2Record<AttendanceRecord>('attendanceRecords', 'attendanceRecords', 'ATT', data, actorName);
}

export function updateAttendanceRecord(
  id: string,
  updates: Partial<AttendanceRecord>,
  actorName: string
): AttendanceRecord | null {
  const db = getDatabase();
  const records = db.attendanceRecords || [];
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated = { ...records[index], ...updates, updatedBy: actorName, updatedAt: new Date().toISOString() };
  records[index] = updated;
  db.attendanceRecords = records;
  saveDatabaseOrThrow(db, 'attendance record');
  persistPhase2Record('attendanceRecords', updated).catch((err) => console.error('Failed to update attendance record:', err));
  return updated;
}

export function addGirlLeaveRecord(
  data: Omit<GirlLeaveRecord, keyof Phase2TrackedRecord>, actorName: string
): GirlLeaveRecord {
  return addPhase2Record('girlLeaves', 'girlLeaves', 'LEV', data, actorName);
}

export function updateGirlLeaveRecord(
  id: string,
  updates: Partial<GirlLeaveRecord>,
  actorName: string
): GirlLeaveRecord | null {
  const db = getDatabase();
  const records = db.girlLeaves || [];
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated = { ...records[index], ...updates, updatedBy: actorName, updatedAt: new Date().toISOString() };
  records[index] = updated;
  db.girlLeaves = records;
  saveDatabaseOrThrow(db, 'girl leave record');
  persistPhase2Record('girlLeaves', updated).catch((err) => console.error('Failed to update leave record:', err));
  return updated;
}

export function addProgrammeLog(
  data: Omit<ProgrammeLogRecord, keyof Phase2TrackedRecord>, actorName: string
): ProgrammeLogRecord {
  return addPhase2Record('programmeLogs', 'programmeLogs', 'PRG', data, actorName);
}

export function updateProgrammeLog(
  id: string,
  updates: Partial<ProgrammeLogRecord>,
  actorName: string
): ProgrammeLogRecord | null {
  const db = getDatabase();
  const records = db.programmeLogs || [];
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated = { ...records[index], ...updates, updatedBy: actorName, updatedAt: new Date().toISOString() };
  records[index] = updated;
  db.programmeLogs = records;
  saveDatabaseOrThrow(db, 'programme log');
  persistPhase2Record('programmeLogs', updated).catch((err) => console.error('Failed to update programme log:', err));
  return updated;
}

export function addCaseReview(
  data: Omit<CaseReview, keyof Phase2TrackedRecord>, actorName: string
): CaseReview {
  return addPhase2Record('caseReviews', 'caseReviews', 'REV', data, actorName);
}

// ----------------------------------------------------------------------
// BUDGET MANAGEMENT HELPERS
// ----------------------------------------------------------------------
export function addBudgetItem(
  item: Omit<BudgetItem, 'id' | 'createdAt'>,
  auditActor?: string
): BudgetItem {
  const db = getDatabase();
  if (!db.budgets) db.budgets = [];
  const now = new Date().toISOString();
  const newItem: BudgetItem = {
    ...item,
    id: generateFollowUpId('BDG'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  };
  const previousBudgets = [...db.budgets];
  db.budgets.unshift(newItem);
  try {
    saveDatabaseOrThrow(db, 'budget item');
  } catch (error) {
    db.budgets = previousBudgets;
    throw error;
  }
  persistBudgetItemToFirestore(newItem).catch((err) =>
    console.error('Failed to persist budget item to Firestore:', err)
  );
  return newItem;
}

export function updateBudgetItem(
  id: string,
  updates: Partial<BudgetItem>,
  auditActor?: string
): BudgetItem | null {
  const db = getDatabase();
  if (!db.budgets) db.budgets = [];
  const index = db.budgets.findIndex((b) => b.id === id);
  if (index === -1) return null;
  const updated: BudgetItem = {
    ...db.budgets[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || db.budgets[index].updatedBy || 'SHINE Staff',
  };
  const previousBudgets = [...db.budgets];
  db.budgets[index] = updated;
  try {
    saveDatabaseOrThrow(db, 'budget item');
  } catch (error) {
    db.budgets = previousBudgets;
    throw error;
  }
  persistBudgetItemToFirestore(updated).catch((err) =>
    console.error('Failed to update budget item in Firestore:', err)
  );
  return updated;
}

export function deleteBudgetItem(id: string): boolean {
  const db = getDatabase();
  if (!db.budgets) return false;
  const index = db.budgets.findIndex((b) => b.id === id);
  if (index === -1) return false;
  const previousBudgets = [...db.budgets];
  db.budgets.splice(index, 1);
  try {
    saveDatabaseOrThrow(db, 'budget item deletion');
  } catch (error) {
    db.budgets = previousBudgets;
    throw error;
  }
  deleteBudgetItemFromFirestore(id).catch((err) =>
    console.error('Failed to delete budget item from Firestore:', err)
  );
  return true;
}

export function addAnnualBudgetPlan(
  plan: Omit<AnnualBudgetPlan, 'id' | 'createdAt' | 'updatedAt'>,
  auditActor?: string
): AnnualBudgetPlan {
  const db = getDatabase();
  if (!db.annualBudgets) db.annualBudgets = [];
  const now = new Date().toISOString();
  const newPlan: AnnualBudgetPlan = {
    ...plan,
    id: generateFollowUpId('ABG'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || plan.createdBy || 'SHINE Staff',
    updatedBy: auditActor || plan.updatedBy || 'SHINE Staff',
  };
  const previousAnnualBudgets = [...db.annualBudgets];
  db.annualBudgets.unshift(newPlan);
  try {
    saveDatabaseOrThrow(db, 'annual budget plan');
  } catch (error) {
    db.annualBudgets = previousAnnualBudgets;
    throw error;
  }
  persistAnnualBudgetPlanToFirestore(newPlan).catch((err) =>
    console.error('Failed to persist annual budget plan to Firestore:', err)
  );
  return newPlan;
}

export function updateAnnualBudgetPlan(
  id: string,
  updates: Partial<AnnualBudgetPlan>,
  auditActor?: string
): AnnualBudgetPlan | null {
  const db = getDatabase();
  if (!db.annualBudgets) db.annualBudgets = [];
  const index = db.annualBudgets.findIndex((plan) => plan.id === id);
  if (index === -1) return null;
  const updated: AnnualBudgetPlan = {
    ...db.annualBudgets[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || db.annualBudgets[index].updatedBy || 'SHINE Staff',
  };
  const previousAnnualBudgets = [...db.annualBudgets];
  db.annualBudgets[index] = updated;
  try {
    saveDatabaseOrThrow(db, 'annual budget plan');
  } catch (error) {
    db.annualBudgets = previousAnnualBudgets;
    throw error;
  }
  persistAnnualBudgetPlanToFirestore(updated).catch((err) =>
    console.error('Failed to update annual budget plan in Firestore:', err)
  );
  return updated;
}

export function addPayrollRecord(
  record: Omit<PayrollRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'createdByUid' | 'updatedByUid'> & {
    id?: string;
    createdBy?: string;
    updatedBy?: string;
    createdByUid?: string;
    updatedByUid?: string;
  },
  auditActor?: string,
  auditActorUid?: string
): PayrollRecord {
  const db = getDatabase();
  if (!db.payrollRecords) db.payrollRecords = [];
  const existing = db.payrollRecords.find((item) =>
    item.employeeId === record.employeeId &&
    (item.payPeriod === record.payPeriod || item.payPeriodStartDate === record.payPeriodStartDate));
  if (existing) return existing;
  const now = new Date().toISOString();
  const newRecord: PayrollRecord = {
    ...record,
    id: record.id || `PAY-${encodeURIComponent(record.employeeId)}-${record.payPeriod}`,
    createdAt: now,
    updatedAt: now,
    createdBy: record.createdBy || auditActor || 'SHINE Staff',
    updatedBy: record.updatedBy || auditActor || 'SHINE Staff',
    createdByUid: record.createdByUid || auditActorUid || 'system',
    updatedByUid: record.updatedByUid || auditActorUid || 'system',
  };
  db.payrollRecords.unshift(newRecord);
  saveDatabaseOrThrow(db, 'Payroll record');
  persistPayrollRecordToFirestore(newRecord).catch((err) =>
    console.error('Failed to persist payroll record to Firestore:', err)
  );
  return newRecord;
}

export function updatePayrollRecord(
  id: string,
  updates: Partial<PayrollRecord>,
  auditActor?: string,
  auditActorUid?: string
): PayrollRecord | null {
  const db = getDatabase();
  if (!db.payrollRecords) db.payrollRecords = [];
  const index = db.payrollRecords.findIndex((record) => record.id === id);
  if (index === -1) return null;
  const updated: PayrollRecord = {
    ...db.payrollRecords[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: updates.updatedBy || auditActor || db.payrollRecords[index].updatedBy || 'SHINE Staff',
    updatedByUid: updates.updatedByUid || auditActorUid || db.payrollRecords[index].updatedByUid || 'system',
  };
  db.payrollRecords[index] = updated;
  saveDatabaseOrThrow(db, 'Payroll update');
  persistPayrollRecordToFirestore(updated).catch((err) =>
    console.error('Failed to update payroll record in Firestore:', err)
  );
  return updated;
}

export function deletePayrollRecord(id: string): boolean {
  const db = getDatabase();
  if (!db.payrollRecords) return false;
  const index = db.payrollRecords.findIndex((record) => record.id === id);
  if (index === -1) return false;
  db.payrollRecords.splice(index, 1);
  const saveResult = saveDatabase(db);
  if (!saveResult.ok) return false;
  deletePayrollRecordFromFirestore(id).catch((err) =>
    console.error('Failed to delete payroll record from Firestore:', err)
  );
  return true;
}

export async function updateEmployeeRecord(
  id: string,
  updates: Partial<EmployeeRecord>,
  auditActor?: string
): Promise<EmployeeRecord | null> {
  const db = getDatabase();
  if (!db.employees) db.employees = [];
  const index = db.employees.findIndex((employee) => employee.id === id);
  if (index < 0) return null;
  const existing = db.employees[index];
  const now = new Date().toISOString();
  const updated: EmployeeRecord = {
    ...existing,
    ...updates,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    updatedAt: now,
    updatedBy: auditActor || existing.updatedBy,
  };
  db.employees[index] = updated;
  saveDatabaseOrThrow(db, 'Employee record');
  await persistEmployeeRecordToFirestore(updated);
  return updated;
}

// ----------------------------------------------------------------------
// WORKPLAN HELPERS
// ----------------------------------------------------------------------
export function addWorkplanItem(
  item: Omit<WorkplanItem, 'id' | 'createdAt'>,
  auditActor?: string
): WorkplanItem {
  const db = getDatabase();
  if (!db.workplans) db.workplans = [];
  const now = new Date().toISOString();
  const newItem: WorkplanItem = {
    ...item,
    id: generateFollowUpId('WKP'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  };
  const previousWorkplans = [...db.workplans];
  db.workplans.unshift(newItem);
  try {
    saveDatabaseOrThrow(db, 'workplan item');
  } catch (error) {
    db.workplans = previousWorkplans;
    throw error;
  }
  persistWorkplanItemToFirestore(newItem).catch((err) =>
    console.error('Failed to persist workplan item to Firestore:', err)
  );
  return newItem;
}

export function updateWorkplanItem(
  id: string,
  updates: Partial<WorkplanItem>,
  auditActor?: string
): WorkplanItem | null {
  const db = getDatabase();
  if (!db.workplans) db.workplans = [];
  const index = db.workplans.findIndex((w) => w.id === id);
  if (index === -1) return null;
  const updated: WorkplanItem = {
    ...db.workplans[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || db.workplans[index].updatedBy || 'SHINE Staff',
  };
  const previousWorkplans = [...db.workplans];
  db.workplans[index] = updated;
  try {
    saveDatabaseOrThrow(db, 'workplan item');
  } catch (error) {
    db.workplans = previousWorkplans;
    throw error;
  }
  persistWorkplanItemToFirestore(updated).catch((err) =>
    console.error('Failed to update workplan item in Firestore:', err)
  );
  return updated;
}

export function deleteWorkplanItem(id: string): boolean {
  const db = getDatabase();
  if (!db.workplans) return false;
  const index = db.workplans.findIndex((w) => w.id === id);
  if (index === -1) return false;
  const previousWorkplans = [...db.workplans];
  db.workplans.splice(index, 1);
  try {
    saveDatabaseOrThrow(db, 'workplan item deletion');
  } catch (error) {
    db.workplans = previousWorkplans;
    throw error;
  }
  deleteWorkplanItemFromFirestore(id).catch((err) =>
    console.error('Failed to delete workplan item from Firestore:', err)
  );
  return true;
}

export function addProcurementList(
  data: Omit<ProcurementList, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  actor = 'SHINE Staff'
): ProcurementList {
  return addPhase2Record<ProcurementList>('procurementLists', 'procurementLists', 'PRC', data, actor);
}

export function updateProcurementList(
  id: string,
  updates: Partial<ProcurementList>,
  actor = 'SHINE Staff',
): ProcurementList | null {
  const db = getDatabase();
  if (!db.procurementLists) db.procurementLists = [];
  const index = db.procurementLists.findIndex((record) => record.id === id);
  if (index < 0) return null;
  const updated = {
    ...db.procurementLists[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  db.procurementLists[index] = updated;
  saveDatabaseOrThrow(db, 'procurement list');
  // Procurement updates use the shared per-record queue so stale local edits
  // cannot bypass the server baseline/conflict checks.
  return updated;
}

export function addProjectProjection(
  data: Omit<ProjectProjection, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  actor = 'SHINE Staff'
): ProjectProjection {
  return addPhase2Record<ProjectProjection>('projectProjections', 'projectProjections', 'PRJ', data, actor);
}

// ----------------------------------------------------------------------
// SCHEDULE HELPERS
// ----------------------------------------------------------------------
export function addScheduleItemWithSaveResult(
  item: Omit<ScheduleItem, 'id' | 'createdAt'>,
  auditActor?: string,
): { item: ScheduleItem; savedLocally: boolean } {
  const db = getDatabase();
  if (!db.schedules) db.schedules = [];
  const now = new Date().toISOString();
  const newItem: ScheduleItem = {
    ...item,
    id: generateFollowUpId('SCH'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  };
  const previousSchedules = [...db.schedules];
  db.schedules.unshift(newItem);
  const saveResult = saveDatabase(db);
  if (!saveResult.ok) db.schedules = previousSchedules;
  // The app's database-updated listener records successful saves in the
  // per-record offline queue. Never issue a parallel direct setDoc here.
  return { item: newItem, savedLocally: saveResult.ok };
}

export function addScheduleItem(
  item: Omit<ScheduleItem, 'id' | 'createdAt'>,
  auditActor?: string,
): ScheduleItem {
  const result = addScheduleItemWithSaveResult(item, auditActor);
  if (!result.savedLocally) {
    throw new Error('Schedule item was not saved on this device, so it was not queued for cloud sync. Free device storage and retry.');
  }
  return result.item;
}

export function updateScheduleItemWithSaveResult(
  id: string,
  updates: Partial<ScheduleItem>,
  auditActor?: string,
): { item: ScheduleItem | null; savedLocally: boolean } {
  const db = getDatabase();
  if (!db.schedules) db.schedules = [];
  const index = db.schedules.findIndex((s) => s.id === id);
  if (index === -1) return { item: null, savedLocally: false };
  const updated: ScheduleItem = {
    ...db.schedules[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || db.schedules[index].updatedBy || 'SHINE Staff',
  };
  const previousSchedules = [...db.schedules];
  db.schedules[index] = updated;
  const saveResult = saveDatabase(db);
  if (!saveResult.ok) db.schedules = previousSchedules;
  // Schedule edits use the shared per-record offline queue after a successful
  // local save, so stale local snapshots cannot bypass baseline/conflict checks.
  return { item: updated, savedLocally: saveResult.ok };
}

export function updateScheduleItem(
  id: string,
  updates: Partial<ScheduleItem>,
  auditActor?: string,
): ScheduleItem | null {
  const result = updateScheduleItemWithSaveResult(id, updates, auditActor);
  if (!result.savedLocally && result.item) {
    throw new Error('Schedule update was not saved on this device, so it was not queued for cloud sync. Free device storage and retry.');
  }
  return result.item;
}

export function deleteScheduleItem(id: string): boolean {
  const db = getDatabase();
  if (!db.schedules) return false;
  const index = db.schedules.findIndex((s) => s.id === id);
  if (index === -1) return false;
  const previousSchedules = [...db.schedules];
  db.schedules.splice(index, 1);
  try {
    saveDatabaseOrThrow(db, 'schedule deletion');
  } catch (error) {
    db.schedules = previousSchedules;
    throw error;
  }
  // Deletions are detected by the shared per-record queue against its confirmed
  // baseline and are transactionally flushed with conflict protection.
  return true;
}

export function addMeetingRecord(item: Omit<MeetingRecord, 'id' | 'createdAt' | 'updatedAt'>, auditActor?: string): MeetingRecord {
  const db = getDatabase();
  if (!db.meetings) db.meetings = [];
  const now = new Date().toISOString();
  const meeting: MeetingRecord = { ...item, id: generateFollowUpId('MTG'), createdAt: now, updatedAt: now, createdBy: auditActor || item.createdBy };
  db.meetings.unshift(meeting);
  saveDatabaseOrThrow(db, 'meeting record');
  persistMeetingToFirestore(meeting).catch((err) => console.error('Failed to persist meeting:', err));
  return meeting;
}

export function updateMeetingRecord(id: string, updates: Partial<MeetingRecord>): MeetingRecord | null {
  const db = getDatabase();
  if (!db.meetings) return null;
  const index = db.meetings.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const meeting = { ...db.meetings[index], ...updates, updatedAt: new Date().toISOString() };
  db.meetings[index] = meeting;
  saveDatabaseOrThrow(db, 'meeting record');
  persistMeetingToFirestore(meeting).catch((err) => console.error('Failed to update meeting:', err));
  return meeting;
}

export function deleteMeetingRecord(id: string): boolean {
  const db = getDatabase();
  if (!db.meetings) return false;
  const index = db.meetings.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.meetings.splice(index, 1);
  if (!saveDatabase(db).ok) return false;
  deleteMeetingFromFirestore(id).catch((err) => console.error('Failed to delete meeting:', err));
  return true;
}

export function addFeedingProgramLog(item: Omit<FeedingProgramLog, 'id' | 'createdAt'>): FeedingProgramLog {
  const db = getDatabase();
  if (!db.feedingProgramLogs) db.feedingProgramLogs = [];
  const log: FeedingProgramLog = { ...item, id: generateFollowUpId('FEED'), createdAt: new Date().toISOString() };
  db.feedingProgramLogs.unshift(log);
  saveDatabaseOrThrow(db, 'feeding programme log');
  persistFeedingProgramLogToFirestore(log).catch((err) => console.error('Failed to persist feeding log:', err));
  return log;
}

export function deleteFeedingProgramLog(id: string): boolean {
  const db = getDatabase();
  if (!db.feedingProgramLogs) return false;
  const index = db.feedingProgramLogs.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.feedingProgramLogs.splice(index, 1);
  if (!saveDatabase(db).ok) return false;
  deleteFeedingProgramLogFromFirestore(id).catch((err) => console.error('Failed to delete feeding log:', err));
  return true;
}

export function addMarketPrice(item: Omit<MarketPriceRecord, 'id' | 'createdAt'>): MarketPriceRecord {
  const db = getDatabase();
  if (!db.marketPrices) db.marketPrices = [];
  const record: MarketPriceRecord = { ...item, id: generateFollowUpId('PRICE'), createdAt: new Date().toISOString() };
  db.marketPrices.unshift(record);
  saveDatabaseOrThrow(db, 'market price');
  persistMarketPriceToFirestore(record).catch((err) => console.error('Failed to persist market price:', err));
  return record;
}

export function deleteMarketPrice(id: string): boolean {
  const db = getDatabase();
  if (!db.marketPrices) return false;
  const index = db.marketPrices.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.marketPrices.splice(index, 1);
  if (!saveDatabase(db).ok) return false;
  deleteMarketPriceFromFirestore(id).catch((err) => console.error('Failed to delete market price:', err));
  return true;
}

export function saveForecastSettings(item: ForecastSettings): ForecastSettings {
  const db = getDatabase();
  db.forecastSettings = [item];
  saveDatabaseOrThrow(db, 'forecast settings');
  persistForecastSettingsToFirestore(item).catch((err) => console.error('Failed to persist forecast settings:', err));
  return item;
}

export function addWhatIfScenario(item: Omit<WhatIfScenario, 'id' | 'createdAt'>): WhatIfScenario {
  const db = getDatabase();
  if (!db.whatIfScenarios) db.whatIfScenarios = [];
  const scenario: WhatIfScenario = { ...item, id: generateFollowUpId('SCN'), createdAt: new Date().toISOString() };
  db.whatIfScenarios.unshift(scenario);
  saveDatabaseOrThrow(db, 'what-if scenario');
  persistWhatIfScenarioToFirestore(scenario).catch((err) => console.error('Failed to persist scenario:', err));
  return scenario;
}

export function saveIntelligenceSuggestion(item: IntelligenceSuggestion): IntelligenceSuggestion {
  const db = getDatabase();
  if (!db.intelligenceSuggestions) db.intelligenceSuggestions = [];
  const existingIndex = db.intelligenceSuggestions.findIndex((suggestion) => suggestion.id === item.id);
  if (existingIndex >= 0) db.intelligenceSuggestions[existingIndex] = item;
  else db.intelligenceSuggestions.unshift(item);
  saveDatabaseOrThrow(db, 'intelligence suggestion');
  persistIntelligenceSuggestionToFirestore(item).catch((err) => console.error('Failed to persist intelligence suggestion:', err));
  return item;
}

export function saveAISettings(item: AISettings): AISettings {
  const db = getDatabase();
  db.aiSettings = [item];
  saveDatabaseOrThrow(db, 'AI settings');
  persistAISettingsToFirestore(item).catch((err) => console.error('Failed to persist AI settings:', err));
  return item;
}

export function addEarlyYearsRecord(item: Omit<EarlyYearsRecord, 'id' | 'createdAt'>): EarlyYearsRecord {
  const db = getDatabase();
  if (!db.earlyYearsRecords) db.earlyYearsRecords = [];
  const record: EarlyYearsRecord = { ...item, id: generateFollowUpId('ECD'), createdAt: new Date().toISOString() };
  db.earlyYearsRecords.unshift(record);
  saveDatabaseOrThrow(db, 'early-years record');
  persistEarlyYearsRecordToFirestore(record).catch((err) => console.error('Failed to persist early-years record:', err));
  return record;
}

export function deleteEarlyYearsRecord(id: string): boolean {
  const db = getDatabase();
  if (!db.earlyYearsRecords) return false;
  const index = db.earlyYearsRecords.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.earlyYearsRecords.splice(index, 1);
  if (!saveDatabase(db).ok) return false;
  deleteEarlyYearsRecordFromFirestore(id).catch((err) => console.error('Failed to delete early-years record:', err));
  return true;
}

// ----------------------------------------------------------------------
// HISTORICAL CASE RECORDS (CRITICAL TO PRESERVE TIMELINE & PREVENT SILENT OVERWRITES)
// ----------------------------------------------------------------------
export function addHistoricalCaseRecord(
  item: Omit<HistoricalCaseRecord, 'id' | 'createdAt'>
): HistoricalCaseRecord {
  const db = getDatabase();
  if (!db.historicalRecords) db.historicalRecords = [];
  const now = new Date().toISOString();
  const newItem: HistoricalCaseRecord = {
    ...item,
    id: generateFollowUpId('HIST'),
    createdAt: now,
  };
  db.historicalRecords.unshift(newItem);
  saveDatabaseOrThrow(db, 'historical case record');
  persistHistoricalCaseRecordToFirestore(newItem).catch((err) =>
    console.error('Failed to persist historical record to Firestore:', err)
  );
  return newItem;
}

export function deleteHistoricalCaseRecord(id: string): boolean {
  const db = getDatabase();
  if (!db.historicalRecords) return false;
  const index = db.historicalRecords.findIndex((h) => h.id === id);
  if (index === -1) return false;
  db.historicalRecords.splice(index, 1);
  if (!saveDatabase(db).ok) return false;
  deleteHistoricalCaseRecordFromFirestore(id).catch((err) =>
    console.error('Failed to delete historical record from Firestore:', err)
  );
  return true;
}

// ----------------------------------------------------------------------
// IMPORT AUDIT HISTORY
// ----------------------------------------------------------------------
export function addImportAuditRecord(
  item: Omit<ImportAuditRecord, 'id'>
): ImportAuditRecord {
  const db = getDatabase();
  if (!db.importAudits) db.importAudits = [];
  const newItem: ImportAuditRecord = {
    ...item,
    id: generateFollowUpId('AUD'),
  };
  db.importAudits.unshift(newItem);
  saveDatabaseOrThrow(db, 'import audit record');
  persistImportAuditToFirestore(newItem).catch((err) =>
    console.error('Failed to persist import audit to Firestore:', err)
  );
  return newItem;
}

// ----------------------------------------------------------------------
// PEOPLE / CONTACTS DIRECTORY (Central Stakeholder Directory)
// Strictly separate from Application Login Accounts!
// ----------------------------------------------------------------------
export function generatePersonId(existingPeople?: Person[]): string {
  const db = getDatabase();
  const list = existingPeople || db.people || [];
  const nextNum = list.length + 1;
  return `PER-${String(nextNum).padStart(3, '0')}`;
}

export function addPerson(personData: Omit<Person, 'id'> & { id?: string }): Person {
  const db = getDatabase();
  if (!db.people) db.people = [];

  const id = personData.id || generatePersonId(db.people);
  const now = new Date().toISOString();

  const newPerson: Person = {
    ...personData,
    id,
    dateRegistered: personData.dateRegistered || now,
    dateFirstIdentified: personData.dateFirstIdentified || now,
    createdDate: personData.createdDate || now,
    updatedDate: now,
    status: personData.status || 'Active',
    linkedGirlIds: personData.linkedGirlIds || [],
    linkedGirlNames: personData.linkedGirlNames || [],
    linkedHouseholdIds: personData.linkedHouseholdIds || [],
    linkedHouseholdNames: personData.linkedHouseholdNames || [],
    sourceDocuments: personData.sourceDocuments || [],
    isLoginUser: false,
  };

  db.people.unshift(newPerson);
  saveDatabaseOrThrow(db, 'person record');
  persistPersonToFirestore(newPerson).catch((err) =>
    console.error('Failed to persist person to Firestore:', err)
  );

  return newPerson;
}

export function updatePerson(person: Person): Person {
  const db = getDatabase();
  if (!db.people) db.people = [];

  const index = db.people.findIndex((p) => p.id === person.id);
  const updated: Person = {
    ...person,
    updatedDate: new Date().toISOString(),
    isLoginUser: false,
  };

  if (index !== -1) {
    db.people[index] = updated;
  } else {
    db.people.unshift(updated);
  }

  saveDatabaseOrThrow(db, 'person record');
  persistPersonToFirestore(updated).catch((err) =>
    console.error('Failed to update person in Firestore:', err)
  );

  return updated;
}

export function deletePerson(id: string): boolean {
  const db = getDatabase();
  if (!db.people) return false;

  const index = db.people.findIndex((p) => p.id === id);
  if (index === -1) return false;

  db.people.splice(index, 1);
  if (!saveDatabase(db).ok) return false;
  deletePersonFromFirestore(id).catch((err) =>
    console.error('Failed to delete person from Firestore:', err)
  );

  return true;
}

export function saveInventoryItem(item: InventoryItem): InventoryItem {
  const db = getDatabase();
  if (!db.inventoryItems) db.inventoryItems = [];
  const now = new Date().toISOString();
  const index = db.inventoryItems.findIndex((entry) => entry.id === item.id);
  const saved: InventoryItem = { ...item, updatedAt: now, movements: Array.isArray(item.movements) ? item.movements : [] };
  if (index >= 0) db.inventoryItems[index] = saved;
  else db.inventoryItems.unshift({ ...saved, createdAt: item.createdAt || now });
  const result = saveDatabase(db);
  if (!result.ok) throw new Error('Could not save inventory changes on this device. Check available storage and try again.');
  // saveDatabase dispatches the shared db-updated event; App.tsx diffs this record into
  // the per-record offline queue, preserving conflict detection instead of racing it
  // with a direct Firestore write from this helper.
  return saved;
}

export function saveAssetRecord(asset: AssetRecord): AssetRecord {
  const db = getDatabase();
  if (!db.assets) db.assets = [];
  const now = new Date().toISOString();
  const index = db.assets.findIndex((entry) => entry.id === asset.id);
  const saved: AssetRecord = { ...asset, updatedAt: now, history: Array.isArray(asset.history) ? asset.history : [] };
  if (index >= 0) db.assets[index] = saved;
  else db.assets.unshift({ ...saved, createdAt: asset.createdAt || now });
  const result = saveDatabase(db);
  if (!result.ok) throw new Error('Could not save asset changes on this device. Check available storage and try again.');
  // Shared database event feeds the conflict-aware offline queue.
  return saved;
}

export function addCustomPersonType(type: string): string[] {
  const db = getDatabase();
  if (!db.customPersonTypes) db.customPersonTypes = [];
  const clean = type.trim();
  if (clean && !db.customPersonTypes.includes(clean)) {
    db.customPersonTypes.push(clean);
    saveDatabaseOrThrow(db, 'custom person type');
  }
  return db.customPersonTypes;
}
