import assert from 'node:assert/strict';
import { getStaffInvitationToken, isStaffInvitationRoute } from '../src/utils/staffInvitationUrl';

const token = 'synthetic-one-time-token';

assert.equal(getStaffInvitationToken(`#/accept-invitation?invitationToken=${token}`, '', 'https://shine.example.invalid'), token,
  'the app route should read a token from the hash fragment');
assert.equal(getStaffInvitationToken('', `?mode=signIn&continueUrl=${encodeURIComponent(`https://shine.example.invalid/#/accept-invitation?invitationToken=${token}`)}`, 'https://shine.example.invalid'), token,
  'Firebase action URLs should preserve the token in the approved continue URL fragment');
assert.equal(getStaffInvitationToken('#/accept-invitation', '', 'https://shine.example.invalid'), '',
  'a route without a token must not invent one');
assert.equal(getStaffInvitationToken('', '?continueUrl=not-a-url', 'https://shine.example.invalid'), '',
  'malformed continue URLs must fail closed');
assert.equal(getStaffInvitationToken('', `?continueUrl=${encodeURIComponent(`https://attacker.example.invalid/#/accept-invitation?invitationToken=${token}`)}`, 'https://shine.example.invalid'), '',
  'tokens in continue URLs from unapproved origins must be ignored');
assert.equal(getStaffInvitationToken('', `?invitationToken=${token}`, 'https://shine.example.invalid'), '',
  'the raw token must not be accepted from a top-level query parameter');
assert.equal(isStaffInvitationRoute('#/accept-invitation?invitationToken=x', ''), true);
assert.equal(isStaffInvitationRoute('', '?mode=signIn&oobCode=synthetic'), true);
assert.equal(isStaffInvitationRoute('#/dashboard', ''), false);
assert.equal(isStaffInvitationRoute('', '?mode=resetPassword'), false);

console.log('Staff invitation URL tests passed.');
