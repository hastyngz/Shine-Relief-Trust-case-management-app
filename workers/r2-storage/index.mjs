import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { handleAIRequest } from './aiBackend';
import { getStorageUploadValidationError } from '../../src/services/storageUploadValidation.ts';

const VALID_TARGETS = new Set([
  'girl', 'household', 'educationalFollowUp', 'healthFollowUp', 'familyFollowUp',
  'householdActivity', 'programme', 'programmeLog', 'importBatch', 'rentPayment', 'expense',
]);
const PRIMARY_ADMIN_EMAIL = 'hastingszidanamot@gmail.com';

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Storage-Path, X-Storage-Target-Type, X-Storage-Target-Id, X-Storage-Category',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function valueOf(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('mapValue' in field) return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([key, value]) => [key, valueOf(value)]));
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(valueOf);
  return undefined;
}

async function firestoreGet(path, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent('shine-relief-trust-cms')}/databases/(default)/documents/${path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new ApiError('Firestore denied access to the requested storage metadata.', response.status === 401 ? 401 : 403);
  return response.json();
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
  throw new ApiError('The inventory movement contains an unsupported value.');
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, valueOf(value)]));
}

async function firestoreCommit(writes, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/shine-relief-trust-cms/databases/(default)/documents:commit';
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = Number(payload.error?.code || response.status);
    const state = String(payload.error?.status || '');
    const message = String(payload.error?.message || '');
    const lowerMessage = message.toLowerCase();
    const conflict = code === 409 || code === 412 || state === 'FAILED_PRECONDITION' || state === 'ALREADY_EXISTS' || lowerMessage.includes('precondition') || lowerMessage.includes('already exists');
    throw new ApiError(code === 403 ? 'Firestore rules rejected this inventory movement.' : 'The inventory transaction could not be committed.', conflict ? 409 : code === 403 ? 403 : code === 401 ? 401 : code >= 500 ? 503 : 400);
  }
  return response.json();
}

function validateInventoryMovementPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError('A stock movement is required.');
  const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
  if (!validId(payload.id) || !validId(payload.itemId)) throw new ApiError('A valid item and movement ID are required.');
  if (!['Received', 'Issued', 'Adjustment'].includes(payload.type)) throw new ApiError('This stock movement type is not supported.');
  if (typeof payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !Number.isFinite(Date.parse(`${payload.date}T00:00:00Z`))) {
    throw new ApiError('Enter a valid movement date.');
  }
  if (typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.trim().length > 1000) throw new ApiError('A reason of up to 1,000 characters is required.');
  if (payload.type === 'Adjustment') {
    if (!Number.isFinite(payload.countedQuantity) || payload.countedQuantity < 0 || payload.countedQuantity > 1_000_000_000) throw new ApiError('The counted stock quantity must be zero or greater.');
  } else if (!Number.isFinite(payload.quantity) || payload.quantity <= 0 || payload.quantity > 1_000_000_000) {
    throw new ApiError('Enter a quantity greater than zero.');
  }
  for (const key of ['destination', 'reference']) {
    if (payload[key] !== undefined && (typeof payload[key] !== 'string' || payload[key].length > 250)) throw new ApiError(`The ${key} field is too long or invalid.`);
  }
  if (payload.sourceType !== undefined && payload.sourceType !== 'procurementReceipt') throw new ApiError('This stock movement source type is not supported.');
  if (payload.sourceType === undefined && (payload.sourceId !== undefined || payload.sourceLineIndex !== undefined)) {
    throw new ApiError('Procurement source fields require a supported source type.');
  }
  if (payload.sourceType === 'procurementReceipt' && (
    payload.type !== 'Received' ||
    typeof payload.sourceId !== 'string' || !validId(payload.sourceId) ||
    !Number.isInteger(payload.sourceLineIndex) || payload.sourceLineIndex < 0 || payload.sourceLineIndex > 9999
  )) throw new ApiError('A valid procurement list and line reference are required.');
  if (payload.sourceType === 'procurementReceipt' &&
      (typeof payload.reference !== 'string' || !payload.reference.startsWith(`Procurement ${payload.sourceId} · line ${payload.sourceLineIndex + 1}`))) {
    throw new ApiError('The receipt reference does not match the procurement list line.');
  }
  return {
    id: payload.id,
    itemId: payload.itemId,
    type: payload.type,
    quantity: payload.quantity,
    countedQuantity: payload.countedQuantity,
    date: payload.date,
    destination: payload.destination?.trim() || undefined,
    reference: payload.reference?.trim() || undefined,
    reason: payload.reason.trim(),
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    sourceLineIndex: payload.sourceLineIndex,
  };
}

async function handleInventoryMovement(request, staff, idToken) {
  if (!['Administrator', 'Manager', 'Staff'].includes(staff.role)) throw new ApiError('Your SHINE role cannot record stock movements.', 403);
  const payload = validateInventoryMovementPayload(await request.json().catch(() => null));
  const fingerprintPayload = { ...payload };
  if (payload.sourceType === 'procurementReceipt') delete fingerprintPayload.date;
  const fingerprint = JSON.stringify(fingerprintPayload);
  const itemPath = `inventoryItems/${encodeURIComponent(payload.itemId)}`;
  const movementPath = `inventoryMovements/${encodeURIComponent(payload.id)}`;

  const existingMovement = await firestoreGet(movementPath, idToken);
  if (existingMovement) {
    const existing = decodeFirestoreFields(existingMovement.fields);
    if (existing.recordedByUid !== staff.uid || existing.inventoryItemId !== payload.itemId || existing.requestFingerprint !== fingerprint) {
      throw new ApiError('This movement ID has already been used for a different request.', 409);
    }
    return json({ ok: true, duplicate: true, movement: existing }, 200);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let procurementLine;
    if (payload.sourceType === 'procurementReceipt') {
      const procurementDocument = await firestoreGet(`procurementLists/${encodeURIComponent(payload.sourceId)}`, idToken);
      if (!procurementDocument) throw new ApiError('The purchased procurement list was not found on the server.', 404);
      const procurement = decodeFirestoreFields(procurementDocument.fields);
      procurementLine = Array.isArray(procurement.items) ? procurement.items[payload.sourceLineIndex] : undefined;
      if (procurement.id !== payload.sourceId || procurement.status !== 'purchased' || procurement.receivedAt || !procurementLine || procurementLine.quantity !== payload.quantity) {
        throw new ApiError('This procurement line is not eligible for a full-quantity inventory receipt.', 409);
      }
    }
    const itemDocument = await firestoreGet(itemPath, idToken);
    if (!itemDocument) throw new ApiError('The inventory item was not found in the synced register. Sync and refresh before retrying.', 404);
    const item = decodeFirestoreFields(itemDocument.fields);
    const previousQuantity = item.quantityOnHand;
    if (!Number.isFinite(previousQuantity) || previousQuantity < 0) {
      throw new ApiError('The inventory record is invalid. Review it before recording a movement.', 409);
    }
    if (procurementLine && procurementLine.unit !== item.unit) {
      throw new ApiError('The procurement and inventory units do not match. Convert the quantity explicitly before posting.', 409);
    }
    const nextQuantity = payload.type === 'Received'
      ? previousQuantity + payload.quantity
      : payload.type === 'Issued'
        ? previousQuantity - payload.quantity
        : payload.countedQuantity;
    if (payload.type === 'Issued' && payload.quantity > previousQuantity) {
      throw new ApiError(`Insufficient stock: only ${previousQuantity} ${String(item.unit || 'units')} are recorded.`, 409);
    }
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0 || nextQuantity > 1_000_000_000) {
      throw new ApiError('The resulting stock balance is outside the allowed range.', 409);
    }

    const now = new Date().toISOString();
    const movementQuantity = payload.type === 'Adjustment' ? Math.abs(nextQuantity - previousQuantity) : payload.quantity;
    const movement = {
      id: payload.id,
      inventoryItemId: payload.itemId,
      type: payload.type,
      quantity: movementQuantity,
      date: payload.date,
      location: String(item.location || ''),
      ...(payload.destination ? { destination: payload.destination } : {}),
      ...(payload.reference ? { reference: payload.reference } : {}),
      ...(payload.sourceType ? { sourceType: payload.sourceType, sourceId: payload.sourceId, sourceLineIndex: payload.sourceLineIndex } : {}),
      reason: payload.reason,
      recordedBy: staff.fullName,
      recordedByUid: staff.uid,
      createdAt: now,
      previousQuantity,
      newQuantity: nextQuantity,
      requestFingerprint: fingerprint,
    };
    const embeddedMovement = {
      id: movement.id,
      inventoryItemId: payload.itemId,
      type: movement.type,
      quantity: movement.quantity,
      date: movement.date,
      location: movement.location,
      ...(movement.destination ? { destination: movement.destination } : {}),
      ...(movement.reference ? { reference: movement.reference } : {}),
      ...(movement.sourceType ? { sourceType: movement.sourceType, sourceId: movement.sourceId, sourceLineIndex: movement.sourceLineIndex } : {}),
      reason: movement.reason,
      recordedBy: movement.recordedBy,
      recordedByUid: movement.recordedByUid,
      createdAt: movement.createdAt,
      previousQuantity,
      newQuantity: nextQuantity,
    };
    const itemFields = {
      quantityOnHand: encodeFirestoreValue(nextQuantity),
      movements: encodeFirestoreValue([...(Array.isArray(item.movements) ? item.movements : []), embeddedMovement]),
      lastMovementId: encodeFirestoreValue(payload.id),
      updatedAt: encodeFirestoreValue(now),
      updatedBy: encodeFirestoreValue(staff.fullName),
      updatedByUid: encodeFirestoreValue(staff.uid),
    };
    const movementFields = Object.fromEntries(Object.entries(movement).map(([key, value]) => [key, encodeFirestoreValue(value)]));
    try {
      await firestoreCommit([
        {
          update: {
            name: `projects/shine-relief-trust-cms/databases/(default)/documents/${itemPath}`,
            fields: itemFields,
          },
          updateMask: { fieldPaths: Object.keys(itemFields) },
          currentDocument: { updateTime: itemDocument.updateTime },
        },
        {
          update: {
            name: `projects/shine-relief-trust-cms/databases/(default)/documents/${movementPath}`,
            fields: movementFields,
          },
          currentDocument: { exists: false },
        },
      ], idToken);
      return json({ ok: true, duplicate: false, quantityOnHand: nextQuantity, movement }, 200);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      const retriedMovement = await firestoreGet(movementPath, idToken);
      if (retriedMovement) {
        const existing = decodeFirestoreFields(retriedMovement.fields);
        if (existing.recordedByUid === staff.uid && existing.inventoryItemId === payload.itemId && existing.requestFingerprint === fingerprint) {
          return json({ ok: true, duplicate: true, movement: existing }, 200);
        }
        throw new ApiError('This movement ID has already been used for a different request.', 409);
      }
      if (attempt === 3) throw new ApiError('Stock changed while saving. Refresh the register and retry; no success was reported.', 409);
    }
  }
  throw new ApiError('The inventory transaction could not be confirmed.', 503);
}

async function authenticate(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError('A Firebase sign-in token is required.', 401);

  const verification = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  if (!verification.ok) throw new ApiError('The Firebase sign-in token is invalid or expired.', 401);
  const identity = (await verification.json()).users?.[0];
  if (!identity?.localId) throw new ApiError('The Firebase sign-in token is invalid or expired.', 401);

  const email = String(identity.email || '').toLowerCase();
  const profile = await firestoreGet(`staffUsers/${encodeURIComponent(identity.localId)}`, token);
  const fields = profile?.fields || {};
  const profileEmail = String(valueOf(fields.email) || '').toLowerCase();
  const isPrimaryAdmin = email === PRIMARY_ADMIN_EMAIL;
  if (!profile && !isPrimaryAdmin) throw new ApiError('This account is not registered as SHINE staff.', 403);
  if (profile && valueOf(fields.status) !== 'Active') throw new ApiError('This SHINE staff account is inactive or suspended.', 403);
  if (profileEmail && profileEmail !== email) throw new ApiError('The staff profile does not match the authenticated account.', 403);

  const role = valueOf(fields.role) || (isPrimaryAdmin ? 'Administrator' : '');
  if (!['Administrator', 'Manager', 'Staff', 'View Only'].includes(role)) {
    throw new ApiError('The staff profile has no valid SHINE role.', 403);
  }
  const permissions = valueOf(fields.safeguardingPermissions) || {};
  return {
    uid: identity.localId,
    email,
    fullName: valueOf(fields.fullName) || identity.displayName || email,
    role,
    canViewCaseReviews: role === 'Administrator' || role === 'Manager' || valueOf(fields.canViewCaseReviews) === true,
    canViewHealthRecords: role === 'Administrator' || role === 'Manager' || valueOf(fields.canViewHealthRecords) === true,
    canEditHealthRecords: role === 'Administrator' || role === 'Manager' || valueOf(fields.canEditHealthRecords) === true,
    safeguardingPermissions: permissions,
  };
}

function safeStoragePath(value) {
  if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new ApiError('A valid storage path is required.');
  }
  return value;
}

function getAttachmentId(storagePath) {
  const match = storagePath.match(/^attachments\/[^/]+\/[^/]+\/(att_\d+_[a-z0-9]{6})_/i);
  if (!match) throw new ApiError('The attachment path is invalid.');
  return match[1];
}

async function getAttachment(storagePath, idToken) {
  const attachmentId = getAttachmentId(storagePath);
  const document = await firestoreGet(`attachments/${encodeURIComponent(attachmentId)}`, idToken);
  if (!document) throw new ApiError('Attachment metadata was not found.', 404);
  const fields = document.fields || {};
  if (valueOf(fields.storagePath) !== storagePath) throw new ApiError('Attachment metadata does not match the storage path.', 403);
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, valueOf(value)]));
}

async function authorizeRead(staff, storagePath, idToken) {
  const report = storagePath.match(/^reports\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (report) {
    if (staff.uid !== report[1] && !['Administrator', 'Manager'].includes(staff.role)) {
      throw new ApiError('You are not authorized to access this report.', 403);
    }
    return;
  }
  await getAttachment(storagePath, idToken);
}

async function authorizeDelete(staff, storagePath, idToken) {
  const attachment = await getAttachment(storagePath, idToken);
  const restrictedHealth = attachment.targetType === 'healthFollowUp' || ['Medical Document', 'Prescription'].includes(attachment.category);
  if (restrictedHealth && !staff.canEditHealthRecords) throw new ApiError('You are not authorized to delete this health attachment.', 403);
  if (attachment.targetType === 'safeguardingCase') {
    const caseDocument = await firestoreGet(`safeguardingCases/${encodeURIComponent(attachment.targetId)}`, idToken);
    if (!caseDocument) throw new ApiError('Safeguarding record was not found.', 404);
    const record = Object.fromEntries(Object.entries(caseDocument.fields || {}).map(([key, value]) => [key, valueOf(value)]));
    const canWrite = staff.role === 'Administrator' || staff.safeguardingPermissions.canEdit === true || (record.authorizedStaffUids || []).includes(staff.uid);
    if (!canWrite) throw new ApiError('You are not authorized to delete this safeguarding attachment.', 403);
    return;
  }
  const uploadedBy = attachment.uploadedBy || {};
  if (staff.role !== 'Administrator' && staff.role !== 'Manager' && uploadedBy.uid !== staff.uid) {
    throw new ApiError('You are not authorized to delete this attachment.', 403);
  }
}

function getS3Client(env) {
  return new S3Client({
    region: 'auto',
    endpoint: env.CLOUDFLARE_R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });
}

async function handleRequest(request, env) {
  if (!env.FIREBASE_WEB_API_KEY || !env.CLOUDFLARE_R2_ACCESS_KEY_ID || !env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || !env.CLOUDFLARE_R2_ENDPOINT || !env.CLOUDFLARE_R2_BUCKET_NAME) {
    throw new ApiError('R2 storage API is not configured.', 503);
  }
  const staff = await authenticate(request, env);
  const url = new URL(request.url);
  const idToken = request.headers.get('Authorization').slice('Bearer '.length);
  const client = getS3Client(env);

  if (url.pathname.startsWith('/api/ai/')) return handleAIRequest(request, env, staff);

  if (url.pathname === '/api/inventory/movement' && request.method === 'POST') {
    return handleInventoryMovement(request, staff, idToken);
  }

  if (url.pathname === '/api/storage/object' && request.method === 'PUT') {
    if (staff.role === 'View Only') throw new ApiError('Your role cannot upload files.', 403);
    const storagePath = safeStoragePath(request.headers.get('X-Storage-Path') || '');
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    const body = await request.arrayBuffer();
    if (!body.byteLength || body.byteLength > 50 * 1024 * 1024) throw new ApiError('Choose a file smaller than 50 MB.');

    const report = storagePath.match(/^reports\/([^/]+)\/([^/]+)\/[^/]+$/);
    if (report) {
      if (report[1] !== staff.uid) throw new ApiError('Reports can only be uploaded to your own archive.', 403);
    } else {
      const attachmentPath = storagePath.match(/^attachments\/([^/]+)\/([^/]+)\/[^/]+$/);
      const targetType = request.headers.get('X-Storage-Target-Type');
      const targetId = request.headers.get('X-Storage-Target-Id');
      if (!attachmentPath || !VALID_TARGETS.has(attachmentPath[1]) || attachmentPath[1] !== targetType || attachmentPath[2] !== targetId) {
        throw new ApiError('The attachment path is invalid.');
      }
      const category = request.headers.get('X-Storage-Category') || '';
      if ((targetType === 'healthFollowUp' || ['Medical Document', 'Prescription'].includes(category)) && !staff.canEditHealthRecords) {
        throw new ApiError('You are not authorized to upload health attachments.', 403);
      }
    }
    const validationError = getStorageUploadValidationError(storagePath, contentType, new Uint8Array(body));
    if (validationError) throw new ApiError(validationError, 415);
    await client.send(new PutObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: storagePath,
      Body: new Uint8Array(body),
      ContentType: contentType,
      CacheControl: 'private, no-store',
    }));
    return new Response(null, { status: 204 });
  }

  if (url.pathname === '/api/storage/download-url' && request.method === 'GET') {
    const storagePath = safeStoragePath(url.searchParams.get('path') || '');
    await authorizeRead(staff, storagePath, idToken);
    const fileName = url.searchParams.get('download') === '1' ? url.searchParams.get('name') : null;
    const safeFileName = fileName?.replace(/[\r\n"]/g, '_');
    const command = new GetObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: storagePath,
      ...(safeFileName ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}` } : {}),
    });
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 20 * 60 });
    return json({ url: signedUrl }, 200);
  }

  if (url.pathname === '/api/storage/object' && request.method === 'GET') {
    const storagePath = safeStoragePath(url.searchParams.get('path') || '');
    await authorizeRead(staff, storagePath, idToken);
    const result = await client.send(new GetObjectCommand({ Bucket: env.CLOUDFLARE_R2_BUCKET_NAME, Key: storagePath }));
    if (!result.Body) throw new ApiError('The requested file is unavailable.', 404);
    const bytes = await result.Body.transformToByteArray();
    return new Response(bytes, {
      headers: { 'Content-Type': result.ContentType || 'application/octet-stream', 'Cache-Control': 'private, no-store' },
    });
  }

  if (url.pathname === '/api/storage/object' && request.method === 'DELETE') {
    const storagePath = safeStoragePath(url.searchParams.get('path') || '');
    await authorizeDelete(staff, storagePath, idToken);
    await client.send(new DeleteObjectCommand({ Bucket: env.CLOUDFLARE_R2_BUCKET_NAME, Key: storagePath }));
    return new Response(null, { status: 204 });
  }

  throw new ApiError('R2 API route not found.', 404);
}

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);
    const origin = request.headers.get('Origin');
    if (origin && !cors) return json({ error: 'This origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors || {} });
    try {
      const response = await handleRequest(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors || {})) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error('R2 storage Worker error:', error);
      return json({ error: error.message || 'Storage request failed.' }, status, cors || {});
    }
  },
};
