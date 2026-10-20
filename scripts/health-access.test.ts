import assert from 'node:assert/strict';
import { canReceiveFollowUpNotification, canStaffViewHealthRecords, getGirlsWithActionRequired } from '../src/services/healthRecordAccess';

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

const actionDb: any = {
  educationalFollowUps: [{ girlId: 'girl-edu', furtherActionRequired: true }],
  healthFollowUps: [{ girlId: 'girl-health', furtherActionRequired: true }],
  familyFollowUps: [{ girlId: 'girl-family', furtherActionRequired: true }],
};
assert.deepEqual([...getGirlsWithActionRequired(actionDb, false)].sort(), ['girl-edu', 'girl-family']);
assert.deepEqual([...getGirlsWithActionRequired(actionDb, true)].sort(), ['girl-edu', 'girl-family', 'girl-health']);
console.log('Health record access and follow-up notification checks passed.');
