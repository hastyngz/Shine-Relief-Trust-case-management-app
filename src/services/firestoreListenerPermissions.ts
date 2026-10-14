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
    canReadHealthRecords?: boolean;
    canReadCaseReviews?: boolean;
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
      colName === 'employees') &&
    options.canReadManagementPlanning !== true
  ) {
    return false;
  }
  // Payroll is manager/admin-wide, but an active staff member may read only
  // documents whose employeeId matches their authenticated UID. Without a UID,
  // do not start any payroll listener.
  if (colName === 'payrollRecords' && options.canReadManagementPlanning !== true && !options.uid) {
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
