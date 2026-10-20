import assert from 'node:assert/strict';
import { canReceiveFollowUpNotification, canStaffViewHealthRecords, getGirlsWithActionRequired, filterRestrictedCachedData, hasRestrictedCachedData, filterNotificationsByHealthPermission } from '../src/services/healthRecordAccess';

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
  caseActions: [{ id: 'safe-action', sourceType: 'safeguarding' }, { id: 'normal-action', sourceType: 'manual' }],
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
assert.deepEqual(restrictedCache.historicalRecords.map((record: any) => record.id), ['school-history']);
assert.ok(!JSON.stringify(restrictedCache.caseReviews).includes('SYNTHETIC_PRIVATE_HEALTH'));
assert.deepEqual(restrictedCache.caseActions.map((action: any) => action.id), ['normal-action']);
assert.deepEqual(restrictedCache.attachments.map((attachment: any) => attachment.id), ['ordinary-photo']);
assert.equal(hasRestrictedCachedData(restrictedCache, staleAccess), false);

console.log('Health record access and follow-up notification checks passed.');
