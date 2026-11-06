/**
 * Firestore collections removed by the administrator's operational-data reset.
 *
 * Staff accounts, conversations, messages, notifications, user preferences,
 * safeguarding case records, the petty-cash ledger and its balance checkpoint,
 * and dedicated audit-log/report-history collections are intentionally retained.
 * Management procurement report metadata is also preserved through resets and
 * expires through its dedicated 90-day Firestore TTL.
 * Some operational history (such as case actions and import audit records) is cleared with the programme data. Keep this list
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
 * Collections represented by AppDatabase backups. The petty-cash ledger is
 * append-only financial history: restore validates against server entries and
 * refuses missing or changed records; reset and replacement never delete it.
 */
export const BACKUP_RESTORE_COLLECTIONS = [
  ...OPERATIONAL_COLLECTIONS_TO_CLEAR.filter((collection) => collection !== 'employeeSalaryHistory'),
  'pettyCashTransactions',
] as const;
