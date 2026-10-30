import assert from 'node:assert/strict';
import { getStaffInvitationClaimErrorMessage } from '../src/utils/staffInvitationFeedback';

const cases: Array<[unknown, string]> = [
  [{ code: 'auth/expired-action-code', message: 'RAW_FIREBASE_DETAIL' }, 'invalid or expired'],
  [{ code: 'auth/network-request-failed', message: 'RAW_FIREBASE_DETAIL' }, 'Check your connection'],
  [{ code: 'auth/too-many-requests', message: 'RAW_FIREBASE_DETAIL' }, 'Too many sign-in attempts'],
  [{ status: 403, message: 'RAW_SERVER_DETAIL' }, 'not authorized'],
  [{ status: 410, message: 'RAW_SERVER_DETAIL' }, 'invalid, replaced or expired'],
  [{ status: 503, message: 'RAW_SERVER_DETAIL' }, 'could not complete the invitation'],
  [new Error('RAW_FIREBASE_DETAIL confidential data'), 'could not be verified'],
  [null, 'could not be verified'],
];

for (const [error, expected] of cases) {
  const result = getStaffInvitationClaimErrorMessage(error);
  assert.match(result, new RegExp(expected, 'i'));
  assert.equal(result.includes('RAW_FIREBASE_DETAIL'), false);
  assert.equal(result.includes('RAW_SERVER_DETAIL'), false);
}

assert.equal(
  getStaffInvitationClaimErrorMessage(new Error('Open the sign-in link from the invitation email on this device, then try again.')),
  'Open the sign-in link from the invitation email on this device, then try again.',
  'known app-authored guidance should remain actionable',
);

console.log('Staff invitation feedback tests passed.');
