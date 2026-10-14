/**
 * Pure role-option gate for startup Firestore listeners.
 * Keep collection names and access rules aligned with firestore.rules.
 */
export function shouldSubscribeToCollection(
  colName: string,
  options: {
    canReadImportSourceData?: boolean;
    canReadManagementPlanning?: boolean;
    canReadHealthRecords?: boolean;
    canReadCaseReviews?: boolean;
  } = {},
): boolean {
  if (colName === 'restrictedImportSources' && options.canReadImportSourceData !== true) {
    return false;
  }
  if (
    (colName === 'whatIfScenarios' || colName === 'projectProjections') &&
    options.canReadManagementPlanning !== true
  ) {
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
