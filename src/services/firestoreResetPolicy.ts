/**
 * Firestore collections removed by the administrator's operational-data reset.
 *
 * Staff accounts, conversations, messages, notifications, user preferences,
 * safeguarding case records, and dedicated audit-log/report-history collections
 * are intentionally retained. Some operational history (such as case actions
 * and import audit records) is cleared with the programme data. Keep this list
 * aligned with operational data persisted by firestoreSync.ts; omissions leave
 * stale operational data in the cloud.
 */
export const OPERATIONAL_COLLECTIONS_TO_CLEAR = [
  'girls',
  'households',
  'educationalFollowUps',
  'healthFollowUps',
  'familyFollowUps',
  'rentPayments',
  'expenses',
  'householdActivities',
  'contacts',
  'budgets',
  'annualBudgets',
  'payrollRecords',
  'employees',
  'employeeSalaryHistory',
  'workplans',
  'schedules',
  'meetings',
  'feedingProgramLogs',
  'marketPrices',
  'forecastSettings',
  'whatIfScenarios',
  'intelligenceSuggestions',
  'aiSettings',
  'historicalCaseRecords',
  'importAudits',
  'restrictedImportSources',
  'earlyYearsRecords',
  'people',
  'attachments',
  'caseActions',
  'educationHistory',
  'academicSupports',
  'examinationRecords',
  'attendanceRecords',
  'girlLeaves',
  'programmeLogs',
  'caseReviews',
  'caseGoals',
  'procurementLists',
  'projectProjections',
  'inventoryItems',
  'assets',
] as const;

/**
 * Cloud-backed operational collections represented by AppDatabase backups.
 * Employee salary history is maintained separately from AppDatabase and is
 * therefore excluded from backup replacement unless a dedicated export is added.
 */
export const BACKUP_RESTORE_COLLECTIONS = OPERATIONAL_COLLECTIONS_TO_CLEAR.filter(
  (collection) => collection !== 'employeeSalaryHistory',
);
