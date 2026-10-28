import assert from 'node:assert/strict';
import { getPasswordResetErrorMessage } from '../src/utils/passwordResetFeedback';

const cases: Array<[string, string]> = [
  ['auth/invalid-email', 'invalid email address'],
  ['auth/too-many-requests', 'temporarily limited'],
  ['auth/network-request-failed', 'Check your connection'],
  ['auth/operation-not-allowed', 'not available for this sign-in method'],
  ['auth/user-not-found', 'If an account is eligible for password reset'],
];

for (const [code, expectedText] of cases) {
  const result = getPasswordResetErrorMessage({
    code,
    message: 'RAW_FIREBASE_DETAIL account enumeration/internal response',
  });
  assert.match(result, new RegExp(expectedText, 'i'));
  assert.equal(result.includes('RAW_FIREBASE_DETAIL'), false, 'raw provider details must not reach UI');
  assert.equal(result.includes('enumeration'), false, 'provider internals must not reach UI');
}

for (const error of [
  new Error('RAW_FIREBASE_DETAIL confidential data'),
  { message: 'RAW_FIREBASE_DETAIL confidential data' },
  null,
  'RAW_FIREBASE_DETAIL confidential data',
]) {
  const result = getPasswordResetErrorMessage(error);
  assert.match(result, /No password was changed/);
  assert.equal(result.includes('RAW_FIREBASE_DETAIL'), false, 'unknown errors must be safely generalized');
}

console.log('Password reset feedback tests passed.');
