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
