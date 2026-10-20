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
    access.canViewSafeguarding || action.sourceType !== 'safeguarding'
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
  };
}

export function hasRestrictedCachedData(db: AppDatabase, access: RestrictedRecordAccess): boolean {
  if (!access.canViewHealthRecords && (
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
