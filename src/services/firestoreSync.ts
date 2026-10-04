import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Unsubscribe,
  Query,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { firestore, storage } from '../firebase';
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
  WorkplanItem,
  ScheduleItem,
  HistoricalCaseRecord,
  ImportAuditRecord,
  EarlyYearsRecord,
  Person,
  StaffUser,
  SalaryHistoryRecord,
  AnnualBudgetPlan,
  PayrollRecord,
  CaseAction,
  EducationHistoryRecord,
  AcademicSupportRecord,
  ExaminationRecord,
  AttendanceRecord,
  GirlLeaveRecord,
  ProgrammeLogRecord,
  CaseReview,
  ReportHistoryRecord,
  MeetingRecord,
  FeedingProgramLog,
  MarketPriceRecord,
  ForecastSettings,
  WhatIfScenario,
  IntelligenceSuggestion,
  AISettings,
  ContactRecord,
} from '../types';

export type SyncStatus = 'connecting' | 'connected' | 'saving' | 'synced' | 'error';

let syncStatus: SyncStatus = 'connecting';
let syncStatusListeners: Array<(status: SyncStatus) => void> = [];

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.push(listener);
  listener(syncStatus);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== listener);
  };
}

function updateSyncStatus(newStatus: SyncStatus) {
  syncStatus = newStatus;
  syncStatusListeners.forEach((fn) => fn(newStatus));
}

// Clean undefined fields so Firestore doesn't reject them
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Firestore collection names
export const COLLECTIONS = {
  GIRLS: 'girls',
  HOUSEHOLDS: 'households',
  EDU_FOLLOW_UPS: 'educationalFollowUps',
  HEALTH_FOLLOW_UPS: 'healthFollowUps',
  FAMILY_FOLLOW_UPS: 'familyFollowUps',
  RENT_PAYMENTS: 'rentPayments',
  EXPENSES: 'expenses',
  ACTIVITIES: 'householdActivities',
  CONTACTS: 'contacts',
  BUDGETS: 'budgets',
  ANNUAL_BUDGETS: 'annualBudgets',
  PAYROLL_RECORDS: 'payrollRecords',
  WORKPLANS: 'workplans',
  SCHEDULES: 'schedules',
  MEETINGS: 'meetings',
  FEEDING_LOGS: 'feedingProgramLogs',
  MARKET_PRICES: 'marketPrices',
  FORECAST_SETTINGS: 'forecastSettings',
  WHAT_IF_SCENARIOS: 'whatIfScenarios',
  INTELLIGENCE_SUGGESTIONS: 'intelligenceSuggestions',
  AI_SETTINGS: 'aiSettings',
  HISTORICAL_RECORDS: 'historicalCaseRecords',
  IMPORT_AUDITS: 'importAudits',
  EARLY_YEARS: 'earlyYearsRecords',
  PEOPLE: 'people',
  ATTACHMENTS: 'attachments',
  STAFF_USERS: 'staffUsers',
  CONVERSATIONS: 'staffConversations',
  MESSAGES: 'staffMessages',
  NOTIFICATIONS: 'staffNotifications',
  ANNOUNCEMENTS: 'staffAnnouncements',
  PREFERENCES: 'userNotificationPreferences',
  CASE_ACTIONS: 'caseActions',
  CASE_ACTION_AUDIT_LOGS: 'caseActionAuditLogs',
  EDUCATION_HISTORY: 'educationHistory',
  ACADEMIC_SUPPORTS: 'academicSupports',
  EXAMINATION_RECORDS: 'examinationRecords',
  ATTENDANCE_RECORDS: 'attendanceRecords',
  GIRL_LEAVES: 'girlLeaves',
  PROGRAMME_LOGS: 'programmeLogs',
  CASE_REVIEWS: 'caseReviews',
  SAFEGUARDING_CASES: 'safeguardingCases',
  SAFEGUARDING_AUDIT_LOGS: 'safeguardingAuditLogs',
  EMPLOYEE_SALARY_HISTORY: 'employeeSalaryHistory',
  EMPLOYEE_AUDIT_LOGS: 'employeeAuditLogs',
  REPORT_HISTORY: 'reportHistory',
} as const;

export async function persistPhase2Record(collectionName: string, record: Record<string, any>): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, collectionName, record.id), sanitizeForFirestore(record), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error(`Firestore persist ${collectionName} error:`, err);
    updateSyncStatus('error');
    throw err;
  }
}

export async function appendCaseActionAudit(event: Record<string, any>): Promise<void> {
  const auditId = `caa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(firestore, COLLECTIONS.CASE_ACTION_AUDIT_LOGS, auditId), {
    ...sanitizeForFirestore(event),
    id: auditId,
  });
}

// Staff User management methods
export async function persistStaffUserToFirestore(staff: StaffUser): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.STAFF_USERS, staff.id);
    await setDoc(ref, sanitizeForFirestore(staff), { merge: true });
  } catch (err) {
    console.error('Firestore persistStaffUser error:', err);
    throw err;
  }
}

export async function getEmployeeSalaryHistory(employeeId: string): Promise<SalaryHistoryRecord[]> {
  const salaryQuery = query(
    collection(firestore, COLLECTIONS.EMPLOYEE_SALARY_HISTORY),
    where('employeeId', '==', employeeId)
  );
  const snapshot = await getDocs(salaryQuery);
  return snapshot.docs
    .map((salaryDoc) => salaryDoc.data() as SalaryHistoryRecord)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export async function getEmployeeSalaryHistoryForStaff(employeeIds: string[]): Promise<SalaryHistoryRecord[]> {
  const uniqueIds = Array.from(new Set(employeeIds));
  const records: SalaryHistoryRecord[] = [];
  for (let index = 0; index < uniqueIds.length; index += 30) {
    const batch = uniqueIds.slice(index, index + 30);
    const salaryQuery = query(
      collection(firestore, COLLECTIONS.EMPLOYEE_SALARY_HISTORY),
      where('employeeId', 'in', batch)
    );
    const snapshot = await getDocs(salaryQuery);
    records.push(...snapshot.docs.map((salaryDoc) => salaryDoc.data() as SalaryHistoryRecord));
  }
  return records;
}

export async function persistEmployeeSalaryHistoryToFirestore(record: SalaryHistoryRecord): Promise<void> {
  await setDoc(
    doc(firestore, COLLECTIONS.EMPLOYEE_SALARY_HISTORY, record.id),
    sanitizeForFirestore(record)
  );
}

export async function appendEmployeeAuditLog(event: Record<string, any>): Promise<void> {
  const auditId = `employee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(firestore, COLLECTIONS.EMPLOYEE_AUDIT_LOGS, auditId), {
    ...sanitizeForFirestore(event),
    id: auditId,
  });
}

export async function appendReportHistory(record: ReportHistoryRecord): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.REPORT_HISTORY, record.id), sanitizeForFirestore(record));
}

export async function getReportHistory(uid: string, canReadAll: boolean): Promise<ReportHistoryRecord[]> {
  const reportQuery = canReadAll
    ? query(collection(firestore, COLLECTIONS.REPORT_HISTORY), orderBy('generatedAt', 'desc'), limit(100))
    : query(collection(firestore, COLLECTIONS.REPORT_HISTORY), where('generatedByUid', '==', uid), orderBy('generatedAt', 'desc'), limit(50));
  const snapshot = await getDocs(reportQuery);
  return snapshot.docs
    .map((report) => report.data() as ReportHistoryRecord)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export async function getStaffUserDoc(uid: string): Promise<StaffUser | null> {
  try {
    const ref = doc(firestore, COLLECTIONS.STAFF_USERS, uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as StaffUser;
    }
    return null;
  } catch (err) {
    console.error('Firestore getStaffUserDoc error:', err);
    return null;
  }
}

export async function getStaffUserByEmail(email: string): Promise<StaffUser | null> {
  try {
    const cleanEmail = email.toLowerCase().trim();
    const q = query(
      collection(firestore, COLLECTIONS.STAFF_USERS),
      where('email', '==', cleanEmail),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as StaffUser;
    }
    return null;
  } catch (err) {
    console.warn('Firestore getStaffUserByEmail notice:', err);
    return null;
  }
}

export async function deleteStaffUserFromFirestore(staffId: string): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.STAFF_USERS, staffId);
    await deleteDoc(ref);
  } catch (err) {
    console.error('Firestore deleteStaffUser error:', err);
    throw err;
  }
}

export function subscribeStaffUsers(onUpdated: (staffList: StaffUser[]) => void): () => void {
  const ref = collection(firestore, COLLECTIONS.STAFF_USERS);
  return onSnapshot(
    ref,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as StaffUser);
      onUpdated(list);
    },
    (error) => {
      console.error('Firestore staffUsers snapshot error:', error);
    }
  );
}

// Single-document Firestore persist methods
export async function persistGirlToFirestore(girl: Girl): Promise<void> {
  try {
    updateSyncStatus('saving');
    const ref = doc(firestore, COLLECTIONS.GIRLS, girl.id);
    await setDoc(ref, sanitizeForFirestore(girl), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistGirl error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteGirlFromFirestore(
  girlId: string,
  linkedFollowUpIds: { edu: string[]; health: string[]; family: string[] }
): Promise<void> {
  try {
    updateSyncStatus('saving');
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, COLLECTIONS.GIRLS, girlId));

    linkedFollowUpIds.edu.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, id));
    });
    linkedFollowUpIds.health.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, id));
    });
    linkedFollowUpIds.family.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, id));
    });

    await batch.commit();
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteGirl error:', err);
    updateSyncStatus('error');
  }
}

export async function persistHouseholdToFirestore(house: Household): Promise<void> {
  try {
    updateSyncStatus('saving');
    const ref = doc(firestore, COLLECTIONS.HOUSEHOLDS, house.id);
    await setDoc(ref, sanitizeForFirestore(house), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHousehold error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHouseholdFromFirestore(
  houseId: string,
  affectedGirlIds: string[],
  linkedRecordIds: { rent: string[]; expense: string[]; activity: string[] }
): Promise<void> {
  try {
    updateSyncStatus('saving');
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, COLLECTIONS.HOUSEHOLDS, houseId));

    // Clear household assignment on resident girls
    affectedGirlIds.forEach((gId) => {
      batch.update(doc(firestore, COLLECTIONS.GIRLS, gId), {
        householdId: '',
        updatedAt: new Date().toISOString(),
      });
    });

    // Delete linked rent, expenses, activities
    linkedRecordIds.rent.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.RENT_PAYMENTS, id));
    });
    linkedRecordIds.expense.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.EXPENSES, id));
    });
    linkedRecordIds.activity.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.ACTIVITIES, id));
    });

    await batch.commit();
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHousehold error:', err);
    updateSyncStatus('error');
  }
}

export async function persistEduFollowUpToFirestore(item: EducationalFollowUp): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistEduFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteEduFollowUpFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteEduFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function persistHealthFollowUpToFirestore(item: HealthFollowUp): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHealthFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHealthFollowUpFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHealthFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function persistFamilyFollowUpToFirestore(item: FamilyFollowUp): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistFamilyFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteFamilyFollowUpFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteFamilyFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function persistRentPaymentToFirestore(item: HouseholdRentPayment): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.RENT_PAYMENTS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistRentPayment error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteRentPaymentFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.RENT_PAYMENTS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteRentPayment error:', err);
    updateSyncStatus('error');
  }
}

export async function persistExpenseToFirestore(item: HouseholdExpense): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.EXPENSES, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistExpense error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteExpenseFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.EXPENSES, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteExpense error:', err);
    updateSyncStatus('error');
  }
}

export async function persistHouseholdActivityToFirestore(item: HouseholdActivity): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.ACTIVITIES, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHouseholdActivity error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHouseholdActivityFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.ACTIVITIES, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHouseholdActivity error:', err);
    updateSyncStatus('error');
  }
}

// Budgets persistence
export async function persistBudgetItemToFirestore(item: BudgetItem): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.BUDGETS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistBudgetItem error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteBudgetItemFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.BUDGETS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteBudgetItem error:', err);
    updateSyncStatus('error');
  }
}

export async function persistAnnualBudgetPlanToFirestore(item: AnnualBudgetPlan): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.ANNUAL_BUDGETS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistAnnualBudgetPlan error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteAnnualBudgetPlanFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.ANNUAL_BUDGETS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteAnnualBudgetPlan error:', err);
    updateSyncStatus('error');
  }
}

export async function persistPayrollRecordToFirestore(item: PayrollRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.PAYROLL_RECORDS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistPayrollRecord error:', err);
    updateSyncStatus('error');
  }
}

export async function deletePayrollRecordFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.PAYROLL_RECORDS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deletePayrollRecord error:', err);
    updateSyncStatus('error');
  }
}

// Workplans persistence
export async function persistWorkplanItemToFirestore(item: WorkplanItem): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.WORKPLANS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistWorkplanItem error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteWorkplanItemFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.WORKPLANS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteWorkplanItem error:', err);
    updateSyncStatus('error');
  }
}

// Schedules persistence
export async function persistScheduleItemToFirestore(item: ScheduleItem): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.SCHEDULES, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistScheduleItem error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteScheduleItemFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.SCHEDULES, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteScheduleItem error:', err);
    updateSyncStatus('error');
  }
}

export async function persistMeetingToFirestore(item: MeetingRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.MEETINGS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistMeeting error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteMeetingFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.MEETINGS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteMeeting error:', err);
    updateSyncStatus('error');
  }
}

export async function persistFeedingProgramLogToFirestore(item: FeedingProgramLog): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.FEEDING_LOGS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistFeedingProgramLog error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteFeedingProgramLogFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.FEEDING_LOGS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteFeedingProgramLog error:', err);
    updateSyncStatus('error');
  }
}

export async function persistMarketPriceToFirestore(item: MarketPriceRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.MARKET_PRICES, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistMarketPrice error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteMarketPriceFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.MARKET_PRICES, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteMarketPrice error:', err);
    updateSyncStatus('error');
  }
}

export async function persistForecastSettingsToFirestore(item: ForecastSettings): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.FORECAST_SETTINGS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistForecastSettings error:', err);
    updateSyncStatus('error');
  }
}

export async function persistWhatIfScenarioToFirestore(item: WhatIfScenario): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.WHAT_IF_SCENARIOS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistWhatIfScenario error:', err);
    updateSyncStatus('error');
  }
}

export async function persistIntelligenceSuggestionToFirestore(item: IntelligenceSuggestion): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.INTELLIGENCE_SUGGESTIONS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistIntelligenceSuggestion error:', err);
    updateSyncStatus('error');
  }
}

export async function persistAISettingsToFirestore(item: AISettings): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.AI_SETTINGS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistAISettings error:', err);
    updateSyncStatus('error');
  }
}

// Historical Case Records persistence
export async function persistHistoricalCaseRecordToFirestore(item: HistoricalCaseRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.HISTORICAL_RECORDS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHistoricalCaseRecord error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHistoricalCaseRecordFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.HISTORICAL_RECORDS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHistoricalCaseRecord error:', err);
    updateSyncStatus('error');
  }
}

// Import Audits persistence
export async function persistImportAuditToFirestore(item: ImportAuditRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.IMPORT_AUDITS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistImportAudit error:', err);
    updateSyncStatus('error');
  }
}

// Early Years Records persistence
export async function persistEarlyYearsRecordToFirestore(item: EarlyYearsRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.EARLY_YEARS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistEarlyYearsRecord error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteEarlyYearsRecordFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.EARLY_YEARS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteEarlyYearsRecord error:', err);
    updateSyncStatus('error');
  }
}

export async function persistPersonToFirestore(person: Person): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.PEOPLE, person.id), sanitizeForFirestore(person), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistPerson error:', err);
    updateSyncStatus('error');
  }
}

export async function persistContactToFirestore(contact: ContactRecord): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.CONTACTS, contact.id), sanitizeForFirestore(contact), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistContact error:', err);
    updateSyncStatus('error');
    throw err;
  }
}

export async function deletePersonFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.PEOPLE, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deletePerson error:', err);
    updateSyncStatus('error');
  }
}

// Bulk commit entire database into Firestore (e.g. for backup restore)
export async function syncEntireDatabaseToFirestore(
  db: AppDatabase,
  replaceExisting = false
): Promise<void> {
  try {
    updateSyncStatus('saving');

    // Helper for batch execution
    const commitInBatches = async (items: Array<{ ref: any; data: any }>) => {
      const BATCH_SIZE = 400;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firestore);
        chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
        await batch.commit();
      }
    };

    const operations: Array<{ ref: any; data: any }> = [];

    db.girls.forEach((g) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.GIRLS, g.id),
        data: sanitizeForFirestore(g),
      });
    });

    db.households.forEach((h) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.HOUSEHOLDS, h.id),
        data: sanitizeForFirestore(h),
      });
    });

    db.educationalFollowUps.forEach((e) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, e.id),
        data: sanitizeForFirestore(e),
      });
    });

    db.healthFollowUps.forEach((hf) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, hf.id),
        data: sanitizeForFirestore(hf),
      });
    });

    db.familyFollowUps.forEach((f) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, f.id),
        data: sanitizeForFirestore(f),
      });
    });

    db.rentPayments.forEach((r) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.RENT_PAYMENTS, r.id),
        data: sanitizeForFirestore(r),
      });
    });

    db.expenses.forEach((ex) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.EXPENSES, ex.id),
        data: sanitizeForFirestore(ex),
      });
    });

    db.householdActivities.forEach((a) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.ACTIVITIES, a.id),
        data: sanitizeForFirestore(a),
      });
    });

    if (db.budgets) {
      db.budgets.forEach((b) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.BUDGETS, b.id),
          data: sanitizeForFirestore(b),
        });
      });
    }

    if (db.annualBudgets) {
      db.annualBudgets.forEach((plan) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.ANNUAL_BUDGETS, plan.id),
          data: sanitizeForFirestore(plan),
        });
      });
    }

    if (db.payrollRecords) {
      db.payrollRecords.forEach((record) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.PAYROLL_RECORDS, record.id),
          data: sanitizeForFirestore(record),
        });
      });
    }

    if (db.workplans) {
      db.workplans.forEach((w) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.WORKPLANS, w.id),
          data: sanitizeForFirestore(w),
        });
      });
    }

    if (db.schedules) {
      db.schedules.forEach((s) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.SCHEDULES, s.id),
          data: sanitizeForFirestore(s),
        });
      });
    }

    if (db.historicalRecords) {
      db.historicalRecords.forEach((hr) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.HISTORICAL_RECORDS, hr.id),
          data: sanitizeForFirestore(hr),
        });
      });
    }

    if (db.importAudits) {
      db.importAudits.forEach((ia) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.IMPORT_AUDITS, ia.id),
          data: sanitizeForFirestore(ia),
        });
      });
    }

    if (db.earlyYearsRecords) {
      db.earlyYearsRecords.forEach((ey) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.EARLY_YEARS, ey.id),
          data: sanitizeForFirestore(ey),
        });
      });
    }

    if (db.people) {
      db.people.forEach((p) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.PEOPLE, p.id),
          data: sanitizeForFirestore(p),
        });
      });
    }

    if (db.contacts) {
      db.contacts.forEach((contact) => operations.push({
        ref: doc(firestore, COLLECTIONS.CONTACTS, contact.id),
        data: sanitizeForFirestore(contact),
      }));
    }

    if (db.attachments) {
      db.attachments.forEach((attachment) => {
        operations.push({
          ref: doc(firestore, COLLECTIONS.ATTACHMENTS, attachment.id),
          data: sanitizeForFirestore(attachment),
        });
      });
    }

    const phase2Collections: Array<[keyof AppDatabase, string]> = [
      ['caseActions', COLLECTIONS.CASE_ACTIONS],
      ['educationHistory', COLLECTIONS.EDUCATION_HISTORY],
      ['academicSupports', COLLECTIONS.ACADEMIC_SUPPORTS],
      ['examinationRecords', COLLECTIONS.EXAMINATION_RECORDS],
      ['attendanceRecords', COLLECTIONS.ATTENDANCE_RECORDS],
      ['girlLeaves', COLLECTIONS.GIRL_LEAVES],
      ['programmeLogs', COLLECTIONS.PROGRAMME_LOGS],
      ['caseReviews', COLLECTIONS.CASE_REVIEWS],
    ];
    for (const [field, collectionName] of phase2Collections) {
      const records = db[field] as Array<{ id: string }> | undefined;
      records?.forEach((record) => operations.push({
        ref: doc(firestore, collectionName, record.id),
        data: sanitizeForFirestore(record),
      }));
    }

    await commitInBatches(operations);

    if (replaceExisting) {
      const collectionNames = [
        COLLECTIONS.GIRLS,
        COLLECTIONS.HOUSEHOLDS,
        COLLECTIONS.EDU_FOLLOW_UPS,
        COLLECTIONS.HEALTH_FOLLOW_UPS,
        COLLECTIONS.FAMILY_FOLLOW_UPS,
        COLLECTIONS.RENT_PAYMENTS,
        COLLECTIONS.EXPENSES,
        COLLECTIONS.ACTIVITIES,
        COLLECTIONS.BUDGETS,
        COLLECTIONS.ANNUAL_BUDGETS,
        COLLECTIONS.PAYROLL_RECORDS,
        COLLECTIONS.WORKPLANS,
        COLLECTIONS.SCHEDULES,
        COLLECTIONS.HISTORICAL_RECORDS,
        COLLECTIONS.IMPORT_AUDITS,
        COLLECTIONS.EARLY_YEARS,
        COLLECTIONS.PEOPLE,
        COLLECTIONS.CONTACTS,
        COLLECTIONS.ATTACHMENTS,
        COLLECTIONS.CASE_ACTIONS,
        COLLECTIONS.EDUCATION_HISTORY,
        COLLECTIONS.ACADEMIC_SUPPORTS,
        COLLECTIONS.EXAMINATION_RECORDS,
        COLLECTIONS.ATTENDANCE_RECORDS,
        COLLECTIONS.GIRL_LEAVES,
        COLLECTIONS.PROGRAMME_LOGS,
        COLLECTIONS.CASE_REVIEWS,
      ];
      const restoredIds = new Map<string, Set<string>>();
      operations.forEach(({ ref }) => {
        const ids = restoredIds.get(ref.parent.id) || new Set<string>();
        ids.add(ref.id);
        restoredIds.set(ref.parent.id, ids);
      });

      for (const colName of collectionNames) {
        const snapshot = await getDocs(collection(firestore, colName));
        const staleRecords = snapshot.docs.filter(
          (record) => !restoredIds.get(colName)?.has(record.id)
        );
        if (colName === COLLECTIONS.ATTACHMENTS) {
          for (const record of staleRecords) {
            const storagePath = record.data().storagePath;
            if (typeof storagePath === 'string' && storagePath) {
              try {
                await deleteObject(ref(storage, storagePath));
              } catch (err: any) {
                if (err?.code !== 'storage/object-not-found') throw err;
              }
            }
          }
        }
        const staleRefs = staleRecords.map((record) => record.ref);
        for (let i = 0; i < staleRefs.length; i += 400) {
          const batch = writeBatch(firestore);
          staleRefs.slice(i, i + 400).forEach((recordRef) => batch.delete(recordRef));
          await batch.commit();
        }
      }
    }

    updateSyncStatus('synced');
  } catch (err) {
    console.error('syncEntireDatabaseToFirestore error:', err);
    updateSyncStatus('error');
    throw err;
  }
}

// Clear operational records without deleting staff access or message history.
export async function clearAllFirestoreCollections(): Promise<void> {
  try {
    updateSyncStatus('saving');
    const attachmentSnapshot = await getDocs(collection(firestore, COLLECTIONS.ATTACHMENTS));
    for (const attachmentDoc of attachmentSnapshot.docs) {
      const storagePath = attachmentDoc.data().storagePath;
      if (typeof storagePath === 'string' && storagePath) {
        try {
          await deleteObject(ref(storage, storagePath));
        } catch (err: any) {
          if (err?.code !== 'storage/object-not-found') throw err;
        }
      }
    }

    const collectionNames = [
      COLLECTIONS.GIRLS,
      COLLECTIONS.HOUSEHOLDS,
      COLLECTIONS.EDU_FOLLOW_UPS,
      COLLECTIONS.HEALTH_FOLLOW_UPS,
      COLLECTIONS.FAMILY_FOLLOW_UPS,
      COLLECTIONS.RENT_PAYMENTS,
      COLLECTIONS.EXPENSES,
      COLLECTIONS.ACTIVITIES,
      COLLECTIONS.BUDGETS,
      COLLECTIONS.ANNUAL_BUDGETS,
      COLLECTIONS.PAYROLL_RECORDS,
      COLLECTIONS.WORKPLANS,
      COLLECTIONS.SCHEDULES,
      COLLECTIONS.HISTORICAL_RECORDS,
      COLLECTIONS.IMPORT_AUDITS,
      COLLECTIONS.EARLY_YEARS,
      COLLECTIONS.PEOPLE,
      COLLECTIONS.ATTACHMENTS,
      COLLECTIONS.CASE_ACTIONS,
      COLLECTIONS.EDUCATION_HISTORY,
      COLLECTIONS.ACADEMIC_SUPPORTS,
      COLLECTIONS.EXAMINATION_RECORDS,
      COLLECTIONS.ATTENDANCE_RECORDS,
      COLLECTIONS.GIRL_LEAVES,
      COLLECTIONS.PROGRAMME_LOGS,
      COLLECTIONS.CASE_REVIEWS,
    ];

    for (const colName of collectionNames) {
      const snap = await getDocs(collection(firestore, colName));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(firestore);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    updateSyncStatus('synced');
  } catch (err) {
    console.error('clearAllFirestoreCollections error:', err);
    updateSyncStatus('error');
    throw err;
  }
}

// Global active unsubscribers
let activeUnsubscribers: Unsubscribe[] = [];

/**
 * Initializes real-time Firestore synchronization for all collections.
 * Dispatches 'shine_db_updated' whenever Firestore records are loaded or changed.
 */
export function initFirestoreListeners(
  onDatabaseSynced: (updatedDb: AppDatabase) => void,
  options: { uid?: string; canViewTeamTasks?: boolean; canReadHealthRecords?: boolean; canReadCaseReviews?: boolean } = {}
): () => void {
  // Teardown previous listeners if any
  activeUnsubscribers.forEach((unsub) => unsub());
  activeUnsubscribers = [];

  updateSyncStatus('connecting');

  // In-memory builder updated by collection snapshots
  const liveState: AppDatabase = {
    girls: [],
    households: [],
    educationalFollowUps: [],
    healthFollowUps: [],
    familyFollowUps: [],
    rentPayments: [],
    expenses: [],
    householdActivities: [],
    contacts: [],
    budgets: [],
    annualBudgets: [],
    payrollRecords: [],
    workplans: [],
    schedules: [],
    meetings: [],
    feedingProgramLogs: [],
    marketPrices: [],
    forecastSettings: [],
    whatIfScenarios: [],
    intelligenceSuggestions: [],
    aiSettings: [],
    historicalRecords: [],
    importAudits: [],
    earlyYearsRecords: [],
    people: [],
    caseActions: [],
    educationHistory: [],
    academicSupports: [],
    examinationRecords: [],
    attendanceRecords: [],
    girlLeaves: [],
    programmeLogs: [],
    caseReviews: [],
  };

  const initialLoadedCollections = new Set<string>();
  const TOTAL_COLLECTIONS = 33;

  const notifyChange = () => {
    onDatabaseSynced({
      girls: [...liveState.girls],
      households: [...liveState.households],
      educationalFollowUps: [...liveState.educationalFollowUps],
      healthFollowUps: [...liveState.healthFollowUps],
      familyFollowUps: [...liveState.familyFollowUps],
      rentPayments: [...liveState.rentPayments],
      expenses: [...liveState.expenses],
      householdActivities: [...liveState.householdActivities],
      contacts: [...(liveState.contacts || [])],
      budgets: [...(liveState.budgets || [])],
      annualBudgets: [...(liveState.annualBudgets || [])],
      payrollRecords: [...(liveState.payrollRecords || [])],
      workplans: [...(liveState.workplans || [])],
      schedules: [...(liveState.schedules || [])],
      meetings: [...(liveState.meetings || [])],
      feedingProgramLogs: [...(liveState.feedingProgramLogs || [])],
      marketPrices: [...(liveState.marketPrices || [])],
      forecastSettings: [...(liveState.forecastSettings || [])],
      whatIfScenarios: [...(liveState.whatIfScenarios || [])],
      intelligenceSuggestions: [...(liveState.intelligenceSuggestions || [])],
      aiSettings: [...(liveState.aiSettings || [])],
      historicalRecords: [...(liveState.historicalRecords || [])],
      importAudits: [...(liveState.importAudits || [])],
      earlyYearsRecords: [...(liveState.earlyYearsRecords || [])],
      people: [...(liveState.people || [])],
      caseActions: [...(liveState.caseActions || [])],
      educationHistory: [...(liveState.educationHistory || [])],
      academicSupports: [...(liveState.academicSupports || [])],
      examinationRecords: [...(liveState.examinationRecords || [])],
      attendanceRecords: [...(liveState.attendanceRecords || [])],
      girlLeaves: [...(liveState.girlLeaves || [])],
      programmeLogs: [...(liveState.programmeLogs || [])],
      caseReviews: [...(liveState.caseReviews || [])],
    });
  };

  const handleCollection = <T>(
    colName: string,
    stateField: keyof AppDatabase
  ) => {
    if (colName === COLLECTIONS.HEALTH_FOLLOW_UPS && options.canReadHealthRecords === false) {
      initialLoadedCollections.add(colName);
      return;
    }
    if (colName === COLLECTIONS.CASE_REVIEWS && options.canReadCaseReviews === false) {
      initialLoadedCollections.add(colName);
      return;
    }
    const colRef = collection(firestore, colName);
    const source: Query = colName === COLLECTIONS.CASE_ACTIONS && options.uid && !options.canViewTeamTasks
      ? query(colRef, where('assignedStaffId', '==', options.uid))
      : colName === COLLECTIONS.HISTORICAL_RECORDS && options.canReadHealthRecords === false
        ? query(colRef, where('recordType', 'in', ['school_class', 'education', 'family', 'household', 'support_intervention', 'general']))
        : colRef;
    const unsub = onSnapshot(
      source,
      (snapshot) => {
        const records = snapshot.docs.map((d) => d.data() as T);
        (liveState[stateField] as unknown as T[]) = records;

        const firstSnapshot = !initialLoadedCollections.has(colName);
        initialLoadedCollections.add(colName);
        if (initialLoadedCollections.size === TOTAL_COLLECTIONS) {
          updateSyncStatus('synced');
          notifyChange();
        } else if (!firstSnapshot) {
          updateSyncStatus('synced');
          notifyChange();
        }
      },
      (error) => {
        console.error(`Firestore snapshot error for ${colName}:`, error);
        updateSyncStatus('error');
      }
    );
    activeUnsubscribers.push(unsub);
  };

  handleCollection<Girl>(COLLECTIONS.GIRLS, 'girls');
  handleCollection<Household>(COLLECTIONS.HOUSEHOLDS, 'households');
  handleCollection<EducationalFollowUp>(COLLECTIONS.EDU_FOLLOW_UPS, 'educationalFollowUps');
  handleCollection<HealthFollowUp>(COLLECTIONS.HEALTH_FOLLOW_UPS, 'healthFollowUps');
  handleCollection<FamilyFollowUp>(COLLECTIONS.FAMILY_FOLLOW_UPS, 'familyFollowUps');
  handleCollection<HouseholdRentPayment>(COLLECTIONS.RENT_PAYMENTS, 'rentPayments');
  handleCollection<HouseholdExpense>(COLLECTIONS.EXPENSES, 'expenses');
  handleCollection<HouseholdActivity>(COLLECTIONS.ACTIVITIES, 'householdActivities');
  handleCollection<ContactRecord>(COLLECTIONS.CONTACTS, 'contacts');
  handleCollection<BudgetItem>(COLLECTIONS.BUDGETS, 'budgets');
  handleCollection<AnnualBudgetPlan>(COLLECTIONS.ANNUAL_BUDGETS, 'annualBudgets');
  handleCollection<PayrollRecord>(COLLECTIONS.PAYROLL_RECORDS, 'payrollRecords');
  handleCollection<WorkplanItem>(COLLECTIONS.WORKPLANS, 'workplans');
  handleCollection<ScheduleItem>(COLLECTIONS.SCHEDULES, 'schedules');
  handleCollection<MeetingRecord>(COLLECTIONS.MEETINGS, 'meetings');
  handleCollection<FeedingProgramLog>(COLLECTIONS.FEEDING_LOGS, 'feedingProgramLogs');
  handleCollection<MarketPriceRecord>(COLLECTIONS.MARKET_PRICES, 'marketPrices');
  handleCollection<ForecastSettings>(COLLECTIONS.FORECAST_SETTINGS, 'forecastSettings');
  handleCollection<WhatIfScenario>(COLLECTIONS.WHAT_IF_SCENARIOS, 'whatIfScenarios');
  handleCollection<IntelligenceSuggestion>(COLLECTIONS.INTELLIGENCE_SUGGESTIONS, 'intelligenceSuggestions');
  handleCollection<AISettings>(COLLECTIONS.AI_SETTINGS, 'aiSettings');
  handleCollection<HistoricalCaseRecord>(COLLECTIONS.HISTORICAL_RECORDS, 'historicalRecords');
  handleCollection<ImportAuditRecord>(COLLECTIONS.IMPORT_AUDITS, 'importAudits');
  handleCollection<EarlyYearsRecord>(COLLECTIONS.EARLY_YEARS, 'earlyYearsRecords');
  handleCollection<Person>(COLLECTIONS.PEOPLE, 'people');
  handleCollection<CaseAction>(COLLECTIONS.CASE_ACTIONS, 'caseActions');
  handleCollection<EducationHistoryRecord>(COLLECTIONS.EDUCATION_HISTORY, 'educationHistory');
  handleCollection<AcademicSupportRecord>(COLLECTIONS.ACADEMIC_SUPPORTS, 'academicSupports');
  handleCollection<ExaminationRecord>(COLLECTIONS.EXAMINATION_RECORDS, 'examinationRecords');
  handleCollection<AttendanceRecord>(COLLECTIONS.ATTENDANCE_RECORDS, 'attendanceRecords');
  handleCollection<GirlLeaveRecord>(COLLECTIONS.GIRL_LEAVES, 'girlLeaves');
  handleCollection<ProgrammeLogRecord>(COLLECTIONS.PROGRAMME_LOGS, 'programmeLogs');
  handleCollection<CaseReview>(COLLECTIONS.CASE_REVIEWS, 'caseReviews');

  return () => {
    activeUnsubscribers.forEach((unsub) => unsub());
    activeUnsubscribers = [];
  };
}
