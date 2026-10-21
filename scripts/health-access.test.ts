import assert from 'node:assert/strict';
import { canReceiveFollowUpNotification, canStaffViewHealthRecords, getGirlsWithActionRequired, filterRestrictedCachedData, hasRestrictedCachedData, filterNotificationsByHealthPermission, isAttachmentAllowedInGeneralReport, isCaseActionAllowedInGeneralSearch, excludeSafeguardingCaseActions, canStaffReceiveCaseActionNotification, filterCaseActionsForStaff } from '../src/services/healthRecordAccess';

const staff = (role: string, canViewHealthRecords?: boolean) => ({ role, canViewHealthRecords }) as any;
assert.equal(canStaffViewHealthRecords(staff('Administrator')), true);
assert.equal(canStaffViewHealthRecords(staff('Manager')), true);
assert.equal(canStaffViewHealthRecords(staff('Staff', true)), true);
assert.equal(canStaffViewHealthRecords(staff('Staff', false)), false);
assert.equal(canReceiveFollowUpNotification(staff('Staff'), 'educationalFollowUp'), true);
assert.equal(canReceiveFollowUpNotification(staff('Staff'), 'familyFollowUp'), true);
assert.equal(canReceiveFollowUpNotification(staff('Staff'), 'healthFollowUp'), false);
assert.equal(canReceiveFollowUpNotification(staff('Staff', true), 'healthFollowUp'), true);
assert.equal(canReceiveFollowUpNotification(staff('Manager'), 'healthFollowUp'), true);
const mixedNotifications = [
  { id: 'general', relatedRecordType: 'girl' },
  { id: 'legacy-health', relatedRecordType: 'healthFollowUp' },
  { id: 'untyped', relatedRecordType: undefined },
];
assert.deepEqual(filterNotificationsByHealthPermission(mixedNotifications, false).map((item) => item.id), ['general', 'untyped']);
assert.equal(filterNotificationsByHealthPermission(mixedNotifications, true).length, 3);
assert.equal(isAttachmentAllowedInGeneralReport({ targetType: 'safeguardingCase', category: 'Photo' }, true), false);
assert.equal(isAttachmentAllowedInGeneralReport({ targetType: 'healthFollowUp', category: 'Photo' }, false), false);
assert.equal(isAttachmentAllowedInGeneralReport({ targetType: 'girl', category: 'Medical Document' }, false), false);
assert.equal(isAttachmentAllowedInGeneralReport({ targetType: 'girl', category: 'Photo' }, false), true);
assert.equal(isAttachmentAllowedInGeneralReport({ targetType: 'healthFollowUp', category: 'Photo' }, true), true);
assert.equal(isCaseActionAllowedInGeneralSearch({ sourceType: 'safeguarding' }, true), false);
assert.equal(isCaseActionAllowedInGeneralSearch({ sourceType: 'healthFollowUp' }, false), false);
assert.equal(isCaseActionAllowedInGeneralSearch({ sourceType: 'healthFollowUp' }, true), true);
assert.equal(isCaseActionAllowedInGeneralSearch({ sourceType: 'manual' }, false), true);
assert.deepEqual(excludeSafeguardingCaseActions([{ id: 'private', sourceType: 'safeguarding' }, { id: 'normal', sourceType: 'manual' }]).map((item) => item.id), ['normal']);
assert.equal(canStaffReceiveCaseActionNotification({ role: 'Staff' }, 'healthFollowUp'), false);
assert.equal(canStaffReceiveCaseActionNotification({ role: 'Staff', canViewHealthRecords: true }, 'healthFollowUp'), true);
assert.equal(canStaffReceiveCaseActionNotification({ role: 'Manager' }, 'healthFollowUp'), true);
assert.equal(canStaffReceiveCaseActionNotification({ role: 'Staff' }, 'safeguarding'), false);
assert.equal(canStaffReceiveCaseActionNotification({ role: 'Staff', safeguardingPermissions: { canView: true } }, 'safeguarding'), true);
assert.equal(canStaffReceiveCaseActionNotification({ role: 'Administrator' }, 'safeguarding'), true);

const actionDb: any = {
  educationalFollowUps: [{ girlId: 'girl-edu', furtherActionRequired: true }],
  healthFollowUps: [{ girlId: 'girl-health', furtherActionRequired: true }],
  familyFollowUps: [{ girlId: 'girl-family', furtherActionRequired: true }],
};
assert.deepEqual([...getGirlsWithActionRequired(actionDb, false)].sort(), ['girl-edu', 'girl-family']);
assert.deepEqual([...getGirlsWithActionRequired(actionDb, true)].sort(), ['girl-edu', 'girl-family', 'girl-health']);

const staleCache: any = {
  ...actionDb,
  healthFollowUps: [{ id: 'health-cache', girlId: 'girl-health', furtherActionRequired: true }],
  historicalRecords: [{ id: 'medical-history', recordType: 'medical' }, { id: 'school-history', recordType: 'education' }],
  caseReviews: [{ id: 'review-cache', health: 'SYNTHETIC_PRIVATE_HEALTH', progress: 'School attendance improved' }],
  caseActions: [{ id: 'safe-action', sourceType: 'safeguarding' }, { id: 'health-action', sourceType: 'healthFollowUp' }, { id: 'normal-action', sourceType: 'manual' }],
  attachments: [
    { id: 'health-attachment', targetType: 'healthFollowUp', category: 'Other' },
    { id: 'medical-doc', targetType: 'girl', category: 'Medical Document' },
    { id: 'safeguarding-attachment', targetType: 'safeguardingCase', category: 'Other' },
    { id: 'ordinary-photo', targetType: 'girl', category: 'Photo' },
  ],
};
const staleAccess = { canViewHealthRecords: false, canViewCaseReviews: true, canViewSafeguarding: false };
const restrictedCache = filterRestrictedCachedData(staleCache, staleAccess);
assert.equal(hasRestrictedCachedData(staleCache, staleAccess), true);
assert.deepEqual(restrictedCache.healthFollowUps, []);
assert.deepEqual((restrictedCache.historicalRecords || []).map((record: any) => record.id), ['school-history']);
assert.ok(!JSON.stringify(restrictedCache.caseReviews).includes('SYNTHETIC_PRIVATE_HEALTH'));
assert.deepEqual((restrictedCache.caseActions || []).map((action: any) => action.id), ['normal-action']);
assert.deepEqual((restrictedCache.attachments || []).map((attachment: any) => attachment.id), ['ordinary-photo']);
assert.equal(hasRestrictedCachedData(restrictedCache, staleAccess), false);

// Cached case actions must be filtered for the active account without
// mutating the shared offline cache (which may be reused by another authorized user).
const sharedCachedActions = [
  { id: 'own-manual', assignedStaffId: 'viewer-uid', sourceType: 'manual' },
  { id: 'other-manual', assignedStaffId: 'manager-uid', sourceType: 'manual' },
  { id: 'own-health', assignedStaffId: 'viewer-uid', sourceType: 'healthFollowUp' },
  { id: 'own-safeguarding', assignedStaffId: 'viewer-uid', sourceType: 'safeguarding' },
];
const cachedActionsBeforeViewFilter = JSON.stringify(sharedCachedActions);
const viewerActions = filterCaseActionsForStaff(sharedCachedActions, {
  uid: 'viewer-uid', canViewTeamTasks: false, canViewHealthRecords: false, canViewSafeguarding: false,
});
assert.deepEqual(viewerActions.map((action) => action.id), ['own-manual']);
const managerActions = filterCaseActionsForStaff(sharedCachedActions, {
  uid: 'manager-uid', canViewTeamTasks: true, canViewHealthRecords: true, canViewSafeguarding: false,
});
assert.deepEqual(managerActions.map((action) => action.id), ['own-manual', 'other-manual', 'own-health']);
assert.deepEqual(filterCaseActionsForStaff(sharedCachedActions, {
  canViewTeamTasks: false, canViewHealthRecords: false, canViewSafeguarding: false,
}).length, 0);
assert.equal(JSON.stringify(sharedCachedActions), cachedActionsBeforeViewFilter, 'view filtering must preserve shared offline cache');

console.log('Health record access and follow-up notification checks passed.');
