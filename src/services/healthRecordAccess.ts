import type { AppDatabase, StaffUser } from '../types';

export type FollowUpReminderRecordType = 'educationalFollowUp' | 'healthFollowUp' | 'familyFollowUp';

/** Manager/admin access is role-derived; other staff need explicit health-view permission. */
export function canStaffViewHealthRecords(staff: Pick<StaffUser, 'role' | 'canViewHealthRecords'>): boolean {
  return staff.role === 'Administrator' || staff.role === 'Manager' || staff.canViewHealthRecords === true;
}

export function canReceiveFollowUpNotification(
  staff: Pick<StaffUser, 'role' | 'canViewHealthRecords'>,
  recordType: FollowUpReminderRecordType,
): boolean {
  return recordType !== 'healthFollowUp' || canStaffViewHealthRecords(staff);
}

/** Build the generic girl-action indicator without inferring restricted medical actions. */
export function getGirlsWithActionRequired(
  db: Pick<AppDatabase, 'educationalFollowUps' | 'healthFollowUps' | 'familyFollowUps'>,
  canViewHealthRecords: boolean,
): Set<string> {
  const girlIds = new Set<string>();
  (db.educationalFollowUps || []).forEach((item) => {
    if (item.furtherActionRequired) girlIds.add(item.girlId);
  });
  if (canViewHealthRecords) {
    (db.healthFollowUps || []).forEach((item) => {
      if (item.furtherActionRequired) girlIds.add(item.girlId);
    });
  }
  (db.familyFollowUps || []).forEach((item) => {
    if (item.furtherActionRequired) girlIds.add(item.girlId);
  });
  return girlIds;
}

export interface RestrictedRecordAccess {
  canViewHealthRecords: boolean;
  canViewCaseReviews: boolean;
  canViewSafeguarding: boolean;
  /** Manager/admin-only planning and HR data. Omitted means no access. */
  canViewManagementPlanning?: boolean;
  /** Full source payloads from imported files are manager/admin-only. */
  canReadImportSourceData?: boolean;
  /** Authenticated UID used to retain only that staff member's payroll rows. */
  uid?: string;
}

/**
 * Remove permission-restricted fields from a local snapshot before rendering it
 * after login, role changes, or permission revocation on a shared device.
 */
export function filterRestrictedCachedData(db: AppDatabase, access: RestrictedRecordAccess): AppDatabase {
  const caseReviews = !access.canViewCaseReviews
    ? []
    : access.canViewHealthRecords
      ? (db.caseReviews || [])
      : (db.caseReviews || []).map(({ health: _health, ...review }) => review);
  const attachments = (db.attachments || []).filter((attachment) => {
    const targetType = String(attachment.targetType);
    return (access.canViewHealthRecords || (
      targetType !== 'healthFollowUp' &&
      !['Medical Document', 'Prescription'].includes(attachment.category)
    )) && (access.canViewSafeguarding || targetType !== 'safeguardingCase');
  });
  const caseActions = (db.caseActions || []).filter((action) =>
    (access.canViewSafeguarding || action.sourceType !== 'safeguarding') &&
    (access.canViewHealthRecords || action.sourceType !== 'healthFollowUp')
  );

  return {
    ...db,
    healthFollowUps: access.canViewHealthRecords ? db.healthFollowUps : [],
    historicalRecords: access.canViewHealthRecords
      ? (db.historicalRecords || [])
      : (db.historicalRecords || []).filter((record) => record.recordType !== 'medical'),
    caseReviews,
    attachments,
    caseActions,
    employees: access.canViewManagementPlanning ? (db.employees || []) : [],
    whatIfScenarios: access.canViewManagementPlanning ? (db.whatIfScenarios || []) : [],
    projectProjections: access.canViewManagementPlanning ? (db.projectProjections || []) : [],
    restrictedImportSources: access.canReadImportSourceData ? (db.restrictedImportSources || []) : [],
    payrollRecords: access.canViewManagementPlanning
      ? (db.payrollRecords || [])
      : (db.payrollRecords || []).filter((record) => Boolean(access.uid) && record.employeeId === access.uid),
  };
}

export function hasRestrictedCachedData(db: AppDatabase, access: RestrictedRecordAccess): boolean {
  if (!access.canViewHealthRecords && (
    (db.caseActions || []).some((action) => action.sourceType === 'healthFollowUp') ||
    db.healthFollowUps.length > 0 ||
    (db.historicalRecords || []).some((record) => record.recordType === 'medical') ||
    (db.caseReviews || []).some((review) => Object.prototype.hasOwnProperty.call(review, 'health')) ||
    (db.attachments || []).some((attachment) =>
      String(attachment.targetType) === 'healthFollowUp' ||
      ['Medical Document', 'Prescription'].includes(attachment.category)
    )
  )) return true;
  if (!access.canViewCaseReviews && (db.caseReviews || []).length > 0) return true;
  if (!access.canViewSafeguarding && (
    (db.caseActions || []).some((action) => action.sourceType === 'safeguarding') ||
    (db.attachments || []).some((attachment) => String(attachment.targetType) === 'safeguardingCase')
  )) return true;
  if (!access.canViewManagementPlanning && (
    (db.employees || []).length > 0 ||
    (db.whatIfScenarios || []).length > 0 ||
    (db.projectProjections || []).length > 0 ||
    (db.payrollRecords || []).some((record) => !access.uid || record.employeeId !== access.uid)
  )) return true;
  if (!access.canReadImportSourceData && (db.restrictedImportSources || []).length > 0) return true;
  return false;
}

/** Keep old health-reminder notifications out of the visible inbox after permission revocation. */
export function filterNotificationsByHealthPermission<T extends { relatedRecordType?: string }>(
  notifications: T[],
  canViewHealthRecords: boolean,
): T[] {
  return canViewHealthRecords
    ? notifications
    : notifications.filter((notification) => notification.relatedRecordType !== 'healthFollowUp');
}

/** General programme reports must never contain safeguarding attachments. */
export function isAttachmentAllowedInGeneralReport(
  attachment: { targetType?: string; category?: string },
  canViewHealthRecords: boolean,
): boolean {
  const targetType = String(attachment.targetType);
  if (targetType === 'safeguardingCase') return false;
  if (canViewHealthRecords) return true;
  return targetType !== 'healthFollowUp' && !['Medical Document', 'Prescription'].includes(attachment.category || '');
}

/** General search keeps safeguarding actions in the dedicated safeguarding results path. */
export function isCaseActionAllowedInGeneralSearch(action: { sourceType?: string }, canViewHealthRecords = false): boolean {
  return action.sourceType !== 'safeguarding' && (canViewHealthRecords || action.sourceType !== 'healthFollowUp');
}

/**
 * Scope cached case actions to the current staff session before any display,
 * search, report, or AI-context use. This is deliberately a view filter: it
 * must not overwrite the shared offline cache, because that cache may contain
 * queued edits or useful data for another authorized account on this device.
 */
export function filterCaseActionsForStaff<T extends { assignedStaffId?: string; sourceType?: string }>(
  actions: T[],
  access: {
    uid?: string;
    canViewTeamTasks: boolean;
    canViewHealthRecords: boolean;
    canViewSafeguarding: boolean;
  },
): T[] {
  if (!access.canViewTeamTasks && !access.uid) return [];
  return actions.filter((action) =>
    (access.canViewTeamTasks || action.assignedStaffId === access.uid) &&
    (access.canViewHealthRecords || action.sourceType !== 'healthFollowUp') &&
    (access.canViewSafeguarding || action.sourceType !== 'safeguarding')
  );
}

/** Remove safeguarding-linked actions from general exports, even for administrators. */
export function excludeSafeguardingCaseActions<T extends { sourceType?: string }>(actions: T[]): T[] {
  return actions.filter((action) => action.sourceType !== 'safeguarding');
}

/** Avoid sending a case-action alert to a recipient who cannot view its source record. */
export function canStaffReceiveCaseActionNotification(
  staff: {
    role?: string;
    canViewHealthRecords?: boolean;
    safeguardingPermissions?: { canView?: boolean };
  },
  sourceType?: string,
): boolean {
  if (sourceType === 'healthFollowUp') {
    return staff.role === 'Administrator' || staff.role === 'Manager' || staff.canViewHealthRecords === true;
  }
  if (sourceType === 'safeguarding') {
    return staff.role === 'Administrator' || staff.safeguardingPermissions?.canView === true;
  }
  return true;
}
