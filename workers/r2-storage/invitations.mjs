const PROJECT_ID_FALLBACK = 'shine-relief-trust-cms';
const PRIMARY_ADMIN_EMAIL = 'hastingszidanamot@gmail.com';
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const SEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;
const ALLOWED_ROLES = new Set(['Manager', 'Staff', 'View Only']);

class InvitationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const nowIso = () => new Date().toISOString();

// Firebase Auth REST returns createdAt as a decimal string of milliseconds
// since the Unix epoch (not an ISO date). Invitation records use ISO strings.
// Accept both formats explicitly and fail closed on malformed timestamps.
function parseTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const normalized = value.trim();
  if (/^\d{10,16}$/.test(normalized)) {
    const milliseconds = Number(normalized);
    return Number.isFinite(milliseconds) ? milliseconds : Number.NaN;
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeFirestoreValue(entry)])) } };
  }
  throw new InvitationError('The invitation record contains an unsupported value.', 500);
}

function decodeFirestoreValue(value) {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decodeFirestoreValue(entry)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('nullValue' in value) return null;
  return undefined;
}

function decodeDocument(document) {
  if (!document) return null;
  return {
    data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)])),
    updateTime: document.updateTime,
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function makeToken() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function toBase64UrlJson(value) {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function getServiceAccessToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new InvitationError('Staff invitations are not configured on the trusted server.', 503);
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new InvitationError('Staff invitations are not configured on the trusted server.', 503);
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new InvitationError('Staff invitations are not configured on the trusted server.', 503);
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = toBase64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = toBase64UrlJson({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
  });
  const unsigned = `${header}.${claims}`;
  const pem = serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  let keyBytes;
  try {
    keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const assertion = `${unsigned}.${encodeBase64Url(new Uint8Array(signature))}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) throw new Error('OAuth token request failed');
    const payload = await response.json();
    if (typeof payload.access_token !== 'string' || !payload.access_token) throw new Error('OAuth token missing');
    return payload.access_token;
  } catch (error) {
    if (error instanceof InvitationError) throw error;
    throw new InvitationError('The trusted server could not authenticate with Firebase.', 503);
  }
}

function projectId(env) {
  return env.FIREBASE_PROJECT_ID || PROJECT_ID_FALLBACK;
}

function documentUrl(env, path) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents/${path}`;
}

async function serviceFirestoreGet(env, path, accessToken) {
  const response = await fetch(documentUrl(env, path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new InvitationError('The trusted server could not read the invitation records.', 503);
  return decodeDocument(await response.json());
}

async function serviceFirestoreQuery(env, collection, field, value, accessToken) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: encodeFirestoreValue(value),
          },
        },
        limit: 1,
      },
    }),
  });
  if (!response.ok) throw new InvitationError('The trusted server could not verify staff eligibility.', 503);
  const results = await response.json();
  const document = Array.isArray(results) ? results.find((entry) => entry.document)?.document : null;
  return decodeDocument(document);
}

async function serviceFirestoreCommit(env, writes, accessToken) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = Number(payload.error?.code || response.status);
    if ([409, 412].includes(code) || payload.error?.status === 'FAILED_PRECONDITION' || payload.error?.status === 'ALREADY_EXISTS') {
      throw new InvitationError('The invitation changed while this request was being processed. Refresh and try again.', 409);
    }
    throw new InvitationError('The trusted server could not save the invitation.', 503);
  }
  return response.json();
}

async function defaultAuthenticateAdmin(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new InvitationError('A Firebase sign-in token is required.', 401);
  if (!env.FIREBASE_WEB_API_KEY) throw new InvitationError('Staff invitations are not configured on the trusted server.', 503);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  if (!response.ok) throw new InvitationError('The Firebase sign-in token is invalid or expired.', 401);
  const identity = (await response.json()).users?.[0];
  if (!identity?.localId || !identity.email) throw new InvitationError('The Firebase sign-in token is invalid or expired.', 401);
  const accessToken = await getServiceAccessToken(env);
  const profile = await serviceFirestoreGet(env, `staffUsers/${encodeURIComponent(identity.localId)}`, accessToken);
  const email = normalizeEmail(identity.email);
  if (!profile || profile.data.status !== 'Active' || profile.data.role !== 'Administrator' || normalizeEmail(profile.data.email) !== email) {
    throw new InvitationError('Only an active SHINE Administrator can manage invitations.', 403);
  }
  return { uid: identity.localId, email, fullName: profile.data.fullName || identity.displayName || email, role: profile.data.role, status: profile.data.status, accessToken };
}

async function defaultLookupIdentity(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new InvitationError('Sign in with the invitation email link before accepting.', 401);
  if (!env.FIREBASE_WEB_API_KEY) throw new InvitationError('Staff invitations are not configured on the trusted server.', 503);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  if (!response.ok) throw new InvitationError('The Firebase sign-in token is invalid or expired.', 401);
  const identity = (await response.json()).users?.[0];
  if (!identity?.localId || !identity.email) throw new InvitationError('The Firebase sign-in token is invalid or expired.', 401);
  return {
    uid: identity.localId,
    email: normalizeEmail(identity.email),
    emailVerified: identity.emailVerified === true,
    createdAt: identity.createdAt,
    displayName: identity.displayName || '',
  };
}

async function defaultFindAuthAccountByEmail(email, env, accessToken) {
  if (!accessToken) throw new InvitationError('Staff invitations are not configured on the trusted server.', 503);
  // Use the privileged Identity Toolkit lookup instead of accounts:createAuthUri.
  // createAuthUri is unsuitable here because email-enumeration protection can
  // hide provider/account existence and must never be disabled for invitations.
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId(env))}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = String(payload.error?.message || '');
    const nestedMessages = Array.isArray(payload.error?.errors)
      ? payload.error.errors.map((entry) => String(entry.message || '')).join(' ')
      : '';
    // The privileged lookup reports USER_NOT_FOUND as a 400 response when no
    // account matches. Treat only that documented condition as "available";
    // permission, configuration, and all other API failures must fail closed.
    if (response.status === 400 && /\bUSER_NOT_FOUND\b/.test(`${apiMessage} ${nestedMessages}`)) return null;
    throw new InvitationError('Firebase could not safely verify whether this email already has an account.', 503);
  }
  if (!Array.isArray(payload.users)) throw new InvitationError('Firebase returned an incomplete account eligibility response.', 503);
  return payload.users.some((user) => normalizeEmail(user.email) === email) ? { exists: true } : null;
}

async function defaultFindStaffByEmail(email, env, accessToken) {
  return serviceFirestoreQuery(env, 'staffUsers', 'email', email, accessToken);
}

async function defaultGetInvitation(id, env, accessToken) {
  return serviceFirestoreGet(env, `staffInvitations/${encodeURIComponent(id)}`, accessToken);
}

async function defaultCreateInvitation(id, data, env, accessToken) {
  const path = `staffInvitations/${encodeURIComponent(id)}`;
  const name = `projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents/${path}`;
  await serviceFirestoreCommit(env, [{
    update: { name, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)])) },
    currentDocument: { exists: false },
  }], accessToken);
  return defaultGetInvitation(id, env, accessToken);
}

async function defaultUpdateInvitation(id, data, updateTime, env, accessToken) {
  const path = `staffInvitations/${encodeURIComponent(id)}`;
  const name = `projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents/${path}`;
  await serviceFirestoreCommit(env, [{
    update: { name, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)])) },
    updateMask: { fieldPaths: Object.keys(data) },
    currentDocument: { updateTime },
  }], accessToken);
  return defaultGetInvitation(id, env, accessToken);
}

async function defaultCommitClaim({ id, invitation, profile, env, accessToken }) {
  const invitePath = `staffInvitations/${encodeURIComponent(id)}`;
  const profilePath = `staffUsers/${encodeURIComponent(profile.uid)}`;
  const inviteName = `projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents/${invitePath}`;
  const profileName = `projects/${encodeURIComponent(projectId(env))}/databases/(default)/documents/${profilePath}`;
  const accepted = {
    ...invitation.data,
    status: 'accepted',
    acceptedAt: nowIso(),
    acceptedUid: profile.uid,
  };
  await serviceFirestoreCommit(env, [
    {
      update: { name: inviteName, fields: Object.fromEntries(Object.entries(accepted).map(([key, value]) => [key, encodeFirestoreValue(value)])) },
      updateMask: { fieldPaths: Object.keys(accepted) },
      currentDocument: { updateTime: invitation.updateTime },
    },
    {
      update: { name: profileName, fields: Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, encodeFirestoreValue(value)])) },
      currentDocument: { exists: false },
    },
  ], accessToken);
  return { profile };
}

function invitationErrorResponse(error) {
  const status = error instanceof InvitationError ? error.status : 503;
  if (status === 500) return new Response(JSON.stringify({ error: 'The invitation request could not be completed.' }), { status: 503 });
  return new Response(JSON.stringify({ error: error.message || 'The invitation request could not be completed.' }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > 16_384) throw new InvitationError('The invitation request is too large.');
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid');
    return payload;
  } catch {
    throw new InvitationError('A valid JSON request body is required.');
  }
}

function makeContinueUrl(env, token) {
  if (!env.FIREBASE_INVITATION_CONTINUE_URL) {
    throw new InvitationError('Staff invitation email delivery is not configured.', 503);
  }
  let url;
  try {
    url = new URL(env.FIREBASE_INVITATION_CONTINUE_URL);
  } catch {
    throw new InvitationError('Staff invitation email delivery is not configured.', 503);
  }
  const allowed = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (url.protocol !== 'https:' || !allowed.includes(url.origin)) {
    throw new InvitationError('The invitation return address is not an approved SHINE app origin.', 503);
  }
  url.searchParams.set('invitationToken', token);
  url.hash = '/accept-invitation';
  return url.toString();
}

async function defaultSendEmail({ email, continueUrl }, env) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY || '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'EMAIL_SIGNIN',
      email,
      continueUrl,
      canHandleCodeInApp: true,
    }),
  });
  if (!response.ok) throw new InvitationError('Firebase could not send the invitation email. You can retry later.', 502);
  const payload = await response.json().catch(() => ({}));
  if (payload.email && normalizeEmail(payload.email) !== email) {
    throw new InvitationError('Firebase returned a different recipient address; the invitation was not confirmed.', 502);
  }
  return { email };
}

export async function handleStaffInvitationRequest(request, env, injected = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/staff-invitations')) return null;
  const method = request.method.toUpperCase();
  if (method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'POST', 'Cache-Control': 'no-store' },
  });

  const deps = {
    now: () => Date.now(),
    generateToken: makeToken,
    hashEmail: (email) => sha256Hex(email),
    hashToken: (token) => sha256Hex(token),
    authenticateAdmin: defaultAuthenticateAdmin,
    lookupIdentity: defaultLookupIdentity,
    getAccessToken: getServiceAccessToken,
    findAuthAccountByEmail: defaultFindAuthAccountByEmail,
    findStaffByEmail: defaultFindStaffByEmail,
    getInvitation: defaultGetInvitation,
    createInvitation: defaultCreateInvitation,
    updateInvitation: defaultUpdateInvitation,
    sendEmail: defaultSendEmail,
    findStaffByUid: async (uid, runtimeEnv, accessToken) => serviceFirestoreGet(runtimeEnv, `staffUsers/${encodeURIComponent(uid)}`, accessToken),
    commitClaim: defaultCommitClaim,
    ...injected,
  };

  try {
    if (url.pathname === '/api/staff-invitations') {
      const admin = await deps.authenticateAdmin(request, env);
      if (!admin) throw new InvitationError('A Firebase sign-in token is required.', 401);
      if (admin.status !== 'Active' || admin.role !== 'Administrator') {
        throw new InvitationError('Only an active SHINE Administrator can manage invitations.', 403);
      }
      const payload = await readJson(request);
      const email = normalizeEmail(payload.email);
      const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
      const role = payload.role;
      const departmentOrTitle = typeof payload.departmentOrTitle === 'string' ? payload.departmentOrTitle.trim().slice(0, 200) : '';
      const phone = typeof payload.phone === 'string' ? payload.phone.trim().slice(0, 100) : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new InvitationError('Enter a valid staff email address.');
      if (!fullName || fullName.length > 200) throw new InvitationError('Enter the staff member’s full name (up to 200 characters).');
      if (!ALLOWED_ROLES.has(role)) throw new InvitationError('Choose Manager, Staff or View Only. Administrator invitations are not available.');
      if (email === PRIMARY_ADMIN_EMAIL) throw new InvitationError('The primary administrator account cannot be invited through this workflow.', 409);

      const accessToken = admin.accessToken || await deps.getAccessToken(env);
      if (await deps.findStaffByEmail(email, env, accessToken)) {
        throw new InvitationError('A SHINE staff profile already exists for this email address.', 409);
      }
      if (await deps.findAuthAccountByEmail(email, env, accessToken)) {
        throw new InvitationError('A Firebase account already exists for this email address. Ask the person to use the approved account-recovery process.', 409);
      }

      const id = await deps.hashEmail(email);
      const existing = await deps.getInvitation(id, env, accessToken);
      const now = deps.now();
      const nowString = new Date(now).toISOString();
      const expiresAt = new Date(now + INVITE_TTL_MS).toISOString();
      let sendWindowStart = now;
      let sendCount = 1;
      if (existing) {
        if (existing.data.status === 'accepted') throw new InvitationError('This invitation has already been accepted.', 409);
        const previousWindow = Date.parse(existing.data.sendWindowStart || '');
        if (Number.isFinite(previousWindow) && now - previousWindow < SEND_WINDOW_MS) {
          sendWindowStart = previousWindow;
          sendCount = Number(existing.data.sendCount || 0) + 1;
          if (sendCount > MAX_SENDS_PER_WINDOW) throw new InvitationError('This invitation has reached its email resend limit. Try again after 24 hours.', 429);
        }
      }
      const token = deps.generateToken();
      const tokenHash = await deps.hashToken(token);
      const invitationData = {
        id,
        email,
        fullName,
        role,
        departmentOrTitle,
        phone,
        status: 'sending',
        tokenHash,
        createdAt: existing?.data.createdAt || nowString,
        expiresAt,
        createdByUid: admin.uid,
        createdByEmail: admin.email,
        createdByName: admin.fullName || admin.email,
        updatedAt: nowString,
        sendWindowStart: new Date(sendWindowStart).toISOString(),
        sendCount,
      };
      let saved;
      if (existing) saved = await deps.updateInvitation(id, invitationData, existing.updateTime, env, accessToken);
      else saved = await deps.createInvitation(id, invitationData, env, accessToken);

      try {
        const continueUrl = makeContinueUrl(env, token);
        await deps.sendEmail({ email, continueUrl, token }, env);
      } catch (error) {
        const failed = { ...saved.data, status: 'delivery_failed', updatedAt: new Date(deps.now()).toISOString() };
        try { await deps.updateInvitation(id, failed, saved.updateTime, env, accessToken); } catch { /* fail closed; never claim delivery */ }
        if (error instanceof InvitationError) throw error;
        throw new InvitationError('Firebase could not send the invitation email. You can retry later.', 502);
      }

      const pending = { ...saved.data, status: 'pending', updatedAt: new Date(deps.now()).toISOString() };
      await deps.updateInvitation(id, pending, saved.updateTime, env, accessToken);
      return new Response(JSON.stringify({ ok: true, status: 'pending', email }), {
        status: 202,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/api/staff-invitations/claim') {
      const payload = await readJson(request);
      const token = typeof payload.token === 'string' ? payload.token.trim() : '';
      if (!token || token.length > 256) throw new InvitationError('A valid invitation token is required.');
      const identity = await deps.lookupIdentity(request, env);
      if (!identity) throw new InvitationError('Sign in with the invitation email link before accepting.', 401);
      const email = normalizeEmail(identity.email);
      if (!identity.emailVerified) throw new InvitationError('Verify the invited email address before accepting the invitation.', 403);
      const id = await deps.hashEmail(email);
      const accessToken = await deps.getAccessToken(env);
      const invitation = await deps.getInvitation(id, env, accessToken);
      if (!invitation || !constantTimeEqual(invitation.data.tokenHash, await deps.hashToken(token))) {
        throw new InvitationError('This invitation link is invalid or has already been replaced.', 404);
      }
      if (invitation.data.status !== 'pending') throw new InvitationError('This invitation is no longer available for acceptance.', 409);
      const now = deps.now();
      if (!Number.isFinite(Date.parse(invitation.data.expiresAt)) || Date.parse(invitation.data.expiresAt) <= now) {
        throw new InvitationError('This invitation has expired. Ask an Administrator to resend it.', 410);
      }
      if (email !== normalizeEmail(invitation.data.email)) throw new InvitationError('The signed-in email does not match the invitation recipient.', 403);
      const authCreatedAt = parseTimestamp(identity.createdAt);
      const inviteCreatedAt = parseTimestamp(invitation.data.createdAt);
      if (!Number.isFinite(authCreatedAt) || !Number.isFinite(inviteCreatedAt) || authCreatedAt <= inviteCreatedAt) {
        throw new InvitationError('This Firebase account existed before the invitation. Ask an Administrator to resolve the existing account safely.', 409);
      }
      if (!ALLOWED_ROLES.has(invitation.data.role)) throw new InvitationError('This invitation has an unsupported role.', 409);
      if (await deps.findStaffByUid(identity.uid, env, accessToken) || await deps.findStaffByEmail(email, env, accessToken)) {
        throw new InvitationError('A SHINE staff profile already exists for this account or email address.', 409);
      }

      const createdAt = new Date(now).toISOString();
      const profile = {
        id: identity.uid,
        uid: identity.uid,
        email,
        fullName: invitation.data.fullName,
        role: invitation.data.role,
        status: 'Active',
        departmentOrTitle: invitation.data.departmentOrTitle || '',
        phone: invitation.data.phone || '',
        createdAt,
        updatedAt: createdAt,
        createdBy: `Invitation by ${invitation.data.createdByName || invitation.data.createdByEmail}`,
        lastLoginAt: createdAt,
      };
      const result = await deps.commitClaim({ id, invitation, profile, env, accessToken });
      return new Response(JSON.stringify({ ok: true, profile: result?.profile || profile }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    throw new InvitationError('Invitation route not found.', 404);
  } catch (error) {
    return invitationErrorResponse(error);
  }
}
