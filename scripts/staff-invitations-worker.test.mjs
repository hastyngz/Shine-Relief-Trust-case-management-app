import assert from 'node:assert/strict';
import { handleStaffInvitationRequest } from '../workers/r2-storage/invitations.mjs';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const emailHash = (email) => `email:${email}`;
const tokenHash = (token) => `hash:${token}`;

function setup(options = {}) {
  let serial = 0;
  const invitations = new Map();
  const staffByUid = new Map();
  const staffByEmail = new Map();
  const authAccounts = new Map();
  const sent = [];
  let failDelivery = false;
  let admin = options.admin === undefined
    ? { uid: 'admin-uid', email: 'admin@example.invalid', fullName: 'Synthetic Admin', role: 'Administrator', status: 'Active' }
    : options.admin;
  const identities = new Map();
  const deps = {
    now: () => NOW,
    getAccessToken: async () => 'synthetic-access-token',
    generateToken: () => `synthetic-token-${++serial}`,
    hashEmail: async emailHash,
    hashToken: async tokenHash,
    authenticateAdmin: async () => admin,
    findAuthAccountByEmail: async (email) => authAccounts.get(email) || null,
    findStaffByEmail: async (email) => staffByEmail.get(email) || null,
    getInvitation: async (id) => invitations.has(id) ? structuredClone(invitations.get(id)) : null,
    createInvitation: async (id, data) => {
      if (invitations.has(id)) throw new Error('already exists');
      const saved = { data: structuredClone(data), updateTime: `update-${serial}-1` };
      invitations.set(id, saved);
      return structuredClone(saved);
    },
    updateInvitation: async (id, data, updateTime) => {
      const old = invitations.get(id);
      if (!old || old.updateTime !== updateTime) throw new Error('conflict');
      const saved = { data: structuredClone(data), updateTime: `update-${serial}-${Date.now()}` };
      invitations.set(id, saved);
      return structuredClone(saved);
    },
    sendEmail: async ({ email, continueUrl }) => {
      if (failDelivery) throw new Error('synthetic delivery failure');
      sent.push({ email, continueUrl });
      return { email };
    },
    lookupIdentity: async (request) => {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      return identities.get(token) || null;
    },
    findStaffByUid: async (uid) => staffByUid.get(uid) || null,
    commitClaim: async ({ id, invitation, profile }) => {
      const current = invitations.get(id);
      if (!current || current.updateTime !== invitation.updateTime || current.data.status !== 'pending') {
        throw new Error('claim conflict');
      }
      if (staffByUid.has(profile.uid) || staffByEmail.has(profile.email)) throw new Error('staff already exists');
      current.data = { ...current.data, status: 'accepted', acceptedAt: new Date(NOW).toISOString(), acceptedUid: profile.uid };
      current.updateTime = `accepted-${profile.uid}`;
      staffByUid.set(profile.uid, structuredClone(profile));
      staffByEmail.set(profile.email, structuredClone(profile));
      return { profile: structuredClone(profile) };
    },
  };
  const env = { FIREBASE_WEB_API_KEY: 'synthetic-key', FIREBASE_INVITATION_CONTINUE_URL: 'https://shine.example.invalid/', CORS_ALLOWED_ORIGINS: 'https://shine.example.invalid' };
  const request = (path, body, token = 'admin-token') => new Request(`https://worker.example.invalid${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const invite = (body = {}, token = 'admin-token') => handleStaffInvitationRequest(
    request('/api/staff-invitations', {
      email: 'new.staff@example.invalid',
      fullName: 'New Synthetic Staff',
      role: 'Staff',
      departmentOrTitle: 'Field Officer',
      phone: '',
      ...body,
    }, token), env, deps
  );
  return {
    deps, env, request, invite, invitations, staffByUid, staffByEmail, authAccounts, identities, sent,
    setAdmin(value) { admin = value; },
    setDeliveryFailure(value) { failDelivery = value; },
  };
}

try {
  {
    const f = setup({ admin: null });
    const response = await f.invite();
    assert.equal(response.status, 401, 'unauthenticated invitation requests must be rejected');
  }
  {
    const f = setup({ admin: { uid: 'manager-uid', email: 'manager@example.invalid', role: 'Manager', status: 'Active' } });
    const response = await f.invite();
    assert.equal(response.status, 403, 'non-administrators must not invite staff');
  }
  {
    const f = setup();
    const response = await f.invite({ role: 'Administrator' });
    assert.equal(response.status, 400, 'this invitation workflow must not grant Administrator');
  }
  {
    const f = setup();
    f.authAccounts.set('new.staff@example.invalid', { uid: 'pre-existing-uid', createdAt: '2026-01-01T00:00:00.000Z' });
    const response = await f.invite();
    assert.equal(response.status, 409, 'existing Firebase Auth identities must not be invited as new users');
  }
  {
    const f = setup();
    f.setDeliveryFailure(true);
    const response = await f.invite();
    assert.equal(response.status, 502, 'email delivery failure must not be reported as success');
    const stored = f.invitations.get(await emailHash('new.staff@example.invalid'));
    assert.equal(stored.data.status, 'delivery_failed');
  }
  {
    const f = setup();
    const response = await f.invite();
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, 'pending');
    assert.equal('token' in body, false, 'raw invitation token must never be returned to the administrator client');
    assert.equal(f.sent.length, 1);
    const stored = f.invitations.get(await emailHash('new.staff@example.invalid'));
    assert.equal(stored.data.status, 'pending');
    assert.equal(stored.data.tokenHash, 'hash:synthetic-token-1');
  }
  {
    const f = setup();
    await f.invite();
    const first = f.invitations.get(await emailHash('new.staff@example.invalid')).data.tokenHash;
    const response = await f.invite();
    assert.equal(response.status, 202, 'a pending invite can be resent within the limit');
    const second = f.invitations.get(await emailHash('new.staff@example.invalid')).data.tokenHash;
    assert.notEqual(second, first, 'resend must rotate the single-use token');
    assert.equal(f.sent.length, 2);
  }
  {
    const f = setup();
    await f.invite();
    await f.invite();
    await f.invite();
    const response = await f.invite();
    assert.equal(response.status, 429, 'the fourth message in a rolling window must be rejected');
    assert.equal(f.sent.length, 3, 'a rejected resend must not send email');
  }
  {
    const f = setup();
    await f.invite();
    const stored = f.invitations.get(await emailHash('new.staff@example.invalid'));
    stored.data.expiresAt = new Date(NOW - 1).toISOString();
    f.invitations.set(await emailHash('new.staff@example.invalid'), stored);
    f.identities.set('claim-token', {
      uid: 'new-uid', email: 'new.staff@example.invalid', emailVerified: true,
      createdAt: new Date(NOW + 1000).toISOString(), displayName: 'New Synthetic Staff',
    });
    const response = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(response.status, 410, 'expired invitations must be rejected');
    assert.equal(f.staffByUid.size, 0);
  }
  {
    const f = setup();
    await f.invite();
    f.identities.set('claim-token', {
      uid: 'new-uid', email: 'different@example.invalid', emailVerified: true,
      createdAt: new Date(NOW + 1000).toISOString(),
    });
    const response = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(response.status, 403, 'a different signed-in email must not claim the invitation');
    assert.equal(f.staffByUid.size, 0);
  }
  {
    const f = setup();
    await f.invite();
    f.identities.set('claim-token', {
      uid: 'old-uid', email: 'new.staff@example.invalid', emailVerified: true,
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const response = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(response.status, 409, 'an Auth identity created before the invitation must not claim it');
    assert.equal(f.staffByUid.size, 0);
  }
  {
    const f = setup();
    await f.invite();
    f.identities.set('claim-token', {
      uid: 'malformed-uid', email: 'new.staff@example.invalid', emailVerified: true,
      createdAt: 'not-a-timestamp',
    });
    const response = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(response.status, 409, 'malformed Auth creation timestamps must fail closed');
    assert.equal(f.staffByUid.size, 0);
  }
  {
    const f = setup();
    await f.invite();
    f.identities.set('claim-token', {
      uid: 'new-uid', email: 'new.staff@example.invalid', emailVerified: true,
      createdAt: String(NOW + 1000),
      displayName: 'New Synthetic Staff',
    });
    const response = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(response.status, 200, 'Firebase Auth millisecond-string createdAt must be accepted');
    assert.equal(f.staffByUid.size, 1);
  }
  {
    const f = setup();
    await f.invite();
    f.identities.set('claim-token', {
      uid: 'new-uid', email: 'new.staff@example.invalid', emailVerified: true,
      createdAt: new Date(NOW + 1000).toISOString(),
      displayName: 'New Synthetic Staff',
    });
    const response = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.profile.uid, 'new-uid');
    assert.equal(body.profile.status, 'Active');
    assert.equal(f.staffByUid.size, 1);
    const replay = await handleStaffInvitationRequest(f.request('/api/staff-invitations/claim', { token: 'synthetic-token-1' }, 'claim-token'), f.env, f.deps);
    assert.equal(replay.status, 409, 'an accepted invitation must not be replayed');
    assert.equal(f.staffByUid.size, 1);
  }
  console.log('Staff invitation lifecycle tests passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
