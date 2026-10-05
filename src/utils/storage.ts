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
} from '../types';
import { INITIAL_DATABASE } from '../data/seedData';
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
  persistWorkplanItemToFirestore,
  deleteWorkplanItemFromFirestore,
  persistScheduleItemToFirestore,
  deleteScheduleItemFromFirestore,
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

export function getDatabase(): AppDatabase {
  if (typeof window === 'undefined') return INITIAL_DATABASE;
  try {
    // Purge any old demo key from previous test sessions
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveDatabase(INITIAL_DATABASE, false);
      return INITIAL_DATABASE;
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
      procurementLists: parsed.procurementLists || [],
      projectProjections: parsed.projectProjections || [],
    };
  } catch (error) {
    console.error('Error reading database from localStorage:', error);
    return INITIAL_DATABASE;
  }
}

export function saveDatabase(db: AppDatabase, dispatchEvent: boolean = true): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    if (dispatchEvent) {
      window.dispatchEvent(new Event('shine_db_updated'));
    }
  } catch (error) {
    console.error('Error saving database to localStorage:', error);
  }
}

export async function clearAllDatabase(): Promise<AppDatabase> {
  await clearAllFirestoreCollections();
  saveDatabase(INITIAL_DATABASE);
  return INITIAL_DATABASE;
}

export const resetDatabaseToDefault = clearAllDatabase;
export const resetDatabaseToSeed = clearAllDatabase;

export async function exportDatabaseJSON(): Promise<string> {
  const db = getDatabase();
  db.attachments = await getAllAttachmentMetadata();
  return JSON.stringify(db, null, 2);
}

export async function importDatabaseJSON(rawJson: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed.girls) || !Array.isArray(parsed.households)) {
      return false;
    }
    const validatedDb: AppDatabase = {
      girls: parsed.girls,
      households: parsed.households,
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
      procurementLists: Array.isArray(parsed.procurementLists) ? parsed.procurementLists : [],
      projectProjections: Array.isArray(parsed.projectProjections) ? parsed.projectProjections : [],
    };
    await syncEntireDatabaseToFirestore(validatedDb, true);
    saveDatabase(validatedDb);
    return true;
  } catch (err) {
    console.error('Failed to parse database backup:', err);
    return false;
  }
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);

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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);

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
  saveDatabase(db);
  deleteEduFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete educational follow-up from Firestore:', err)
  );
  return db.educationalFollowUps.length < initialLength;
}

export function deleteHealthFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.healthFollowUps.length;
  db.healthFollowUps = db.healthFollowUps.filter((h) => h.id !== id);
  saveDatabase(db);
  deleteHealthFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete health follow-up from Firestore:', err)
  );
  return db.healthFollowUps.length < initialLength;
}

export function deleteFamilyFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.familyFollowUps.length;
  db.familyFollowUps = db.familyFollowUps.filter((f) => f.id !== id);
  saveDatabase(db);
  deleteFamilyFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete family follow-up from Firestore:', err)
  );
  return db.familyFollowUps.length < initialLength;
}

export function deleteRentPayment(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.rentPayments.length;
  db.rentPayments = db.rentPayments.filter((r) => r.id !== id);
  saveDatabase(db);
  deleteRentPaymentFromFirestore(id).catch((err) =>
    console.error('Failed to delete rent payment from Firestore:', err)
  );
  return db.rentPayments.length < initialLength;
}

export function deleteExpense(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.expenses.length;
  db.expenses = db.expenses.filter((e) => e.id !== id);
  saveDatabase(db);
  deleteExpenseFromFirestore(id).catch((err) =>
    console.error('Failed to delete expense from Firestore:', err)
  );
  return db.expenses.length < initialLength;
}

export function deleteHouseholdActivity(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.householdActivities.length;
  db.householdActivities = db.householdActivities.filter((a) => a.id !== id);
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  db.expenses.unshift(newItem);
  saveDatabase(db);
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
  db.expenses = db.expenses.map((expense) => expense.id === id ? updatedItem : expense);
  saveDatabase(db);
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
  saveDatabase(db);
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
  actor: string
): T {
  const db = getDatabase();
  const now = new Date().toISOString();
  const record = {
    ...data,
    id: generateFollowUpId(prefix),
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  } as T;
  const allData = db as unknown as Record<string, unknown>;
  const records = (allData[dbField] as T[] | undefined) || [];
  records.unshift(record);
  allData[dbField] = records;
  saveDatabase(db);
  persistPhase2Record(collectionName, record).catch((err) =>
    console.error(`Failed to persist ${collectionName}:`, err)
  );
  return record;
}

export function addCaseAction(
  data: Omit<CaseAction, keyof Phase2TrackedRecord | 'createdByUid' | 'updatedByUid'>,
  actor: { uid: string; name: string }
): CaseAction {
  const record = addPhase2Record<CaseAction>('caseActions', 'caseActions', 'ACTN', {
    ...data,
    createdByUid: actor.uid,
    updatedByUid: actor.uid,
  }, actor.name);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  db.budgets.unshift(newItem);
  saveDatabase(db);
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
  db.budgets[index] = updated;
  saveDatabase(db);
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
  db.budgets.splice(index, 1);
  saveDatabase(db);
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
  db.annualBudgets.unshift(newPlan);
  saveDatabase(db);
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
  db.annualBudgets[index] = updated;
  saveDatabase(db);
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
  const now = new Date().toISOString();
  const newRecord: PayrollRecord = {
    ...record,
    id: record.id || generateFollowUpId('PAY'),
    createdAt: now,
    updatedAt: now,
    createdBy: record.createdBy || auditActor || 'SHINE Staff',
    updatedBy: record.updatedBy || auditActor || 'SHINE Staff',
    createdByUid: record.createdByUid || auditActorUid || 'system',
    updatedByUid: record.updatedByUid || auditActorUid || 'system',
  };
  db.payrollRecords.unshift(newRecord);
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
  deletePayrollRecordFromFirestore(id).catch((err) =>
    console.error('Failed to delete payroll record from Firestore:', err)
  );
  return true;
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
  db.workplans.unshift(newItem);
  saveDatabase(db);
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
  db.workplans[index] = updated;
  saveDatabase(db);
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
  db.workplans.splice(index, 1);
  saveDatabase(db);
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
  saveDatabase(db);
  persistPhase2Record('procurementLists', { ...updated }).catch((err) =>
    console.error('Failed to update procurement list:', err)
  );
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
export function addScheduleItem(
  item: Omit<ScheduleItem, 'id' | 'createdAt'>,
  auditActor?: string
): ScheduleItem {
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
  db.schedules.unshift(newItem);
  saveDatabase(db);
  persistScheduleItemToFirestore(newItem).catch((err) =>
    console.error('Failed to persist schedule item to Firestore:', err)
  );
  return newItem;
}

export function updateScheduleItem(
  id: string,
  updates: Partial<ScheduleItem>,
  auditActor?: string
): ScheduleItem | null {
  const db = getDatabase();
  if (!db.schedules) db.schedules = [];
  const index = db.schedules.findIndex((s) => s.id === id);
  if (index === -1) return null;
  const updated: ScheduleItem = {
    ...db.schedules[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || db.schedules[index].updatedBy || 'SHINE Staff',
  };
  db.schedules[index] = updated;
  saveDatabase(db);
  persistScheduleItemToFirestore(updated).catch((err) =>
    console.error('Failed to update schedule item in Firestore:', err)
  );
  return updated;
}

export function deleteScheduleItem(id: string): boolean {
  const db = getDatabase();
  if (!db.schedules) return false;
  const index = db.schedules.findIndex((s) => s.id === id);
  if (index === -1) return false;
  db.schedules.splice(index, 1);
  saveDatabase(db);
  deleteScheduleItemFromFirestore(id).catch((err) =>
    console.error('Failed to delete schedule item from Firestore:', err)
  );
  return true;
}

export function addMeetingRecord(item: Omit<MeetingRecord, 'id' | 'createdAt' | 'updatedAt'>, auditActor?: string): MeetingRecord {
  const db = getDatabase();
  if (!db.meetings) db.meetings = [];
  const now = new Date().toISOString();
  const meeting: MeetingRecord = { ...item, id: generateFollowUpId('MTG'), createdAt: now, updatedAt: now, createdBy: auditActor || item.createdBy };
  db.meetings.unshift(meeting);
  saveDatabase(db);
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
  saveDatabase(db);
  persistMeetingToFirestore(meeting).catch((err) => console.error('Failed to update meeting:', err));
  return meeting;
}

export function deleteMeetingRecord(id: string): boolean {
  const db = getDatabase();
  if (!db.meetings) return false;
  const index = db.meetings.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.meetings.splice(index, 1);
  saveDatabase(db);
  deleteMeetingFromFirestore(id).catch((err) => console.error('Failed to delete meeting:', err));
  return true;
}

export function addFeedingProgramLog(item: Omit<FeedingProgramLog, 'id' | 'createdAt'>): FeedingProgramLog {
  const db = getDatabase();
  if (!db.feedingProgramLogs) db.feedingProgramLogs = [];
  const log: FeedingProgramLog = { ...item, id: generateFollowUpId('FEED'), createdAt: new Date().toISOString() };
  db.feedingProgramLogs.unshift(log);
  saveDatabase(db);
  persistFeedingProgramLogToFirestore(log).catch((err) => console.error('Failed to persist feeding log:', err));
  return log;
}

export function deleteFeedingProgramLog(id: string): boolean {
  const db = getDatabase();
  if (!db.feedingProgramLogs) return false;
  const index = db.feedingProgramLogs.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.feedingProgramLogs.splice(index, 1);
  saveDatabase(db);
  deleteFeedingProgramLogFromFirestore(id).catch((err) => console.error('Failed to delete feeding log:', err));
  return true;
}

export function addMarketPrice(item: Omit<MarketPriceRecord, 'id' | 'createdAt'>): MarketPriceRecord {
  const db = getDatabase();
  if (!db.marketPrices) db.marketPrices = [];
  const record: MarketPriceRecord = { ...item, id: generateFollowUpId('PRICE'), createdAt: new Date().toISOString() };
  db.marketPrices.unshift(record);
  saveDatabase(db);
  persistMarketPriceToFirestore(record).catch((err) => console.error('Failed to persist market price:', err));
  return record;
}

export function deleteMarketPrice(id: string): boolean {
  const db = getDatabase();
  if (!db.marketPrices) return false;
  const index = db.marketPrices.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.marketPrices.splice(index, 1);
  saveDatabase(db);
  deleteMarketPriceFromFirestore(id).catch((err) => console.error('Failed to delete market price:', err));
  return true;
}

export function saveForecastSettings(item: ForecastSettings): ForecastSettings {
  const db = getDatabase();
  db.forecastSettings = [item];
  saveDatabase(db);
  persistForecastSettingsToFirestore(item).catch((err) => console.error('Failed to persist forecast settings:', err));
  return item;
}

export function addWhatIfScenario(item: Omit<WhatIfScenario, 'id' | 'createdAt'>): WhatIfScenario {
  const db = getDatabase();
  if (!db.whatIfScenarios) db.whatIfScenarios = [];
  const scenario: WhatIfScenario = { ...item, id: generateFollowUpId('SCN'), createdAt: new Date().toISOString() };
  db.whatIfScenarios.unshift(scenario);
  saveDatabase(db);
  persistWhatIfScenarioToFirestore(scenario).catch((err) => console.error('Failed to persist scenario:', err));
  return scenario;
}

export function saveIntelligenceSuggestion(item: IntelligenceSuggestion): IntelligenceSuggestion {
  const db = getDatabase();
  if (!db.intelligenceSuggestions) db.intelligenceSuggestions = [];
  const existingIndex = db.intelligenceSuggestions.findIndex((suggestion) => suggestion.id === item.id);
  if (existingIndex >= 0) db.intelligenceSuggestions[existingIndex] = item;
  else db.intelligenceSuggestions.unshift(item);
  saveDatabase(db);
  persistIntelligenceSuggestionToFirestore(item).catch((err) => console.error('Failed to persist intelligence suggestion:', err));
  return item;
}

export function saveAISettings(item: AISettings): AISettings {
  const db = getDatabase();
  db.aiSettings = [item];
  saveDatabase(db);
  persistAISettingsToFirestore(item).catch((err) => console.error('Failed to persist AI settings:', err));
  return item;
}

export function addEarlyYearsRecord(item: Omit<EarlyYearsRecord, 'id' | 'createdAt'>): EarlyYearsRecord {
  const db = getDatabase();
  if (!db.earlyYearsRecords) db.earlyYearsRecords = [];
  const record: EarlyYearsRecord = { ...item, id: generateFollowUpId('ECD'), createdAt: new Date().toISOString() };
  db.earlyYearsRecords.unshift(record);
  saveDatabase(db);
  persistEarlyYearsRecordToFirestore(record).catch((err) => console.error('Failed to persist early-years record:', err));
  return record;
}

export function deleteEarlyYearsRecord(id: string): boolean {
  const db = getDatabase();
  if (!db.earlyYearsRecords) return false;
  const index = db.earlyYearsRecords.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.earlyYearsRecords.splice(index, 1);
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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
  saveDatabase(db);
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

  saveDatabase(db);
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
  saveDatabase(db);
  deletePersonFromFirestore(id).catch((err) =>
    console.error('Failed to delete person from Firestore:', err)
  );

  return true;
}

export function addCustomPersonType(type: string): string[] {
  const db = getDatabase();
  if (!db.customPersonTypes) db.customPersonTypes = [];
  const clean = type.trim();
  if (clean && !db.customPersonTypes.includes(clean)) {
    db.customPersonTypes.push(clean);
    saveDatabase(db);
  }
  return db.customPersonTypes;
}
