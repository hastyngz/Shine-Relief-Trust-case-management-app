/**
 * Pure role-option gate for startup Firestore listeners.
 * Keep collection names and access rules aligned with firestore.rules.
 */
export function shouldSubscribeToCollection(
  colName: string,
  options: {
    uid?: string;
    canReadImportSourceData?: boolean;
    canReadManagementPlanning?: boolean;
    canReadOwnPayroll?: boolean;
    canReadHealthRecords?: boolean;
    canReadCaseReviews?: boolean;
    canViewTeamTasks?: boolean;
  } = {},
): boolean {
  if (colName === 'restrictedImportSources' && options.canReadImportSourceData !== true) {
    return false;
  }
  // These collections are manager/admin-only in firestore.rules. Employees
  // contains employment and salary-related details and must not be loaded for
  // ordinary staff or view-only sessions.
  if (
    (colName === 'whatIfScenarios' ||
      colName === 'projectProjections' ||
      colName === 'employees' ||
      colName === 'pettyCashTransactions') &&
    options.canReadManagementPlanning !== true
  ) {
    return false;
  }
  // Staff case-action queries must be scoped to their UID. If the caller
  // has neither management access nor a UID, skip the listener instead of
  // attempting a collection-wide query that cannot satisfy the rules.
  if (colName === 'caseActions' && options.canViewTeamTasks !== true && !options.uid) {
    return false;
  }
  // Payroll is manager/admin-wide. Only explicitly eligible Staff accounts
  // may start the self-service listener, which is filtered by staffUid.
  if (colName === 'payrollRecords' && options.canReadManagementPlanning !== true
    && (options.canReadOwnPayroll !== true || !options.uid)) {
    return false;
  }
  if (colName === 'healthFollowUps' && options.canReadHealthRecords === false) {
    return false;
  }
  if (colName === 'caseReviews' && options.canReadCaseReviews === false) {
    return false;
  }
  return true;
}
