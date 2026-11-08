import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { handleAIRequest } from './aiBackend';
import { handleStaffInvitationRequest } from './invitations.mjs';
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

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function getInventoryQuantityPrecisionError(value, unit) {
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const measuredUnits = new Set(['kg', 'kilogram', 'kilograms', 'litre', 'litres', 'liter', 'liters', 'l']);
  const countableUnits = new Set(['bag', 'bags', 'piece', 'pieces', 'bottle', 'bottles', 'box', 'boxes', 'pack', 'packs', 'tray', 'trays', 'unit', 'units']);
  if (measuredUnits.has(normalizedUnit)) {
    return Math.abs(value * 100 - Math.round(value * 100)) > 1e-8
      ? 'Measured stock quantities may have no more than two decimal places.'
      : undefined;
  }
  if (countableUnits.has(normalizedUnit)) {
    return Number.isInteger(value)
      ? undefined
      : 'Countable stock quantities must be whole numbers.';
  }
  return 'This inventory unit is not recognised. An Administrator must review the unit before stock can be moved.';
}

function validateInventoryMovementPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError('A stock movement is required.');
  const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
  if (!validId(payload.id) || !validId(payload.itemId)) throw new ApiError('A valid item and movement ID are required.');
  if (!['Received', 'Issued', 'Adjustment'].includes(payload.type)) throw new ApiError('This stock movement type is not supported.');
  if (!isValidCalendarDate(payload.date)) {
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
  if (payload.locationId !== undefined && (typeof payload.locationId !== 'string' || !/^loc_[^/]{1,84}$/.test(payload.locationId) || /[\u0000-\u001f\u007f]/.test(payload.locationId))) throw new ApiError('A valid managed inventory location is required.');
  if (payload.sourceType !== undefined && payload.sourceType !== 'procurementReceipt') throw new ApiError('This stock movement source type is not supported.');
  if (payload.sourceType === undefined && (payload.sourceId !== undefined || payload.sourceLineIndex !== undefined)) {
    throw new ApiError('Procurement source fields require a supported source type.');
  }
  if (payload.sourceType === 'procurementReceipt' && (
    payload.type !== 'Received' ||
    typeof payload.sourceId !== 'string' || !validId(payload.sourceId) ||
    !Number.isInteger(payload.sourceLineIndex) || payload.sourceLineIndex < 0 || payload.sourceLineIndex > 9999
  )) throw new ApiError('A valid procurement list and line reference are required.');
  if (payload.sourceDeliveryId !== undefined && (payload.sourceType !== 'procurementReceipt' || !validId(payload.sourceDeliveryId))) {
    throw new ApiError('A valid procurement delivery ID is required.');
  }
  if (payload.sourceType === 'procurementReceipt' && payload.sourceDeliveryId !== undefined &&
      (typeof payload.reference !== 'string' || !payload.reference.startsWith(`Delivery ${payload.sourceDeliveryId} ·`) ||
       !payload.reference.includes(`procurement ${payload.sourceId} · line ${payload.sourceLineIndex + 1}`))) {
    throw new ApiError('The delivery reference does not match the procurement list line.');
  }
  if (payload.sourceType === 'procurementReceipt' && payload.sourceDeliveryId === undefined &&
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
    sourceDeliveryId: payload.sourceDeliveryId,
    locationId: payload.locationId,
  };
}

function normalizeInventoryLocationName(value) {
  return value.trim().toLowerCase();
}

function inventoryLocationDocumentId(normalizedName) {
  return `loc_${normalizedName}`;
}

function inventoryLocationBalanceDocumentId(itemId, locationId) {
  return `bal_${itemId.length}_${itemId}_${locationId}`;
}

async function listInventoryLocations(idToken) {
  const locations = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/shine-relief-trust-cms/databases/(default)/documents/inventoryLocations?${query}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!response.ok) throw new ApiError('Could not load the managed inventory locations.', response.status === 401 ? 401 : 403);
    const payload = await response.json();
    for (const document of payload.documents || []) {
      const fields = decodeFirestoreFields(document.fields);
      locations.push({ ...fields, id: document.name.split('/').pop() });
    }
    pageToken = payload.nextPageToken;
  } while (pageToken && locations.length < 5000);
  return locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function handleInventoryLocations(request, staff, idToken) {
  if (request.method === 'GET') {
    const locations = await listInventoryLocations(idToken);
    return json({ ok: true, locations }, 200);
  }
  if (request.method !== 'POST') throw new ApiError('This inventory location action is not supported.', 405);
  if (!['Administrator', 'Manager'].includes(staff.role)) {
    throw new ApiError('Only active Managers and Administrators may create inventory locations.', 403);
  }
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.name !== 'string') throw new ApiError('Enter a location name.');
  const name = payload.name.trim();
  if (!name || name.length > 80 || name.includes('/') || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiError('Location names must contain 1–80 printable characters.', 400);
  }
  const normalizedName = normalizeInventoryLocationName(name);
  const id = inventoryLocationDocumentId(normalizedName);
  const existing = await firestoreGet(`inventoryLocations/${encodeURIComponent(id)}`, idToken);
  if (existing) throw new ApiError('A location with this name already exists. Names are compared without case and surrounding spaces.', 409);
  const now = new Date().toISOString();
  const location = {
    id, name, normalizedName, isActive: true,
    createdAt: now, createdBy: staff.fullName, createdByUid: staff.uid,
    updatedAt: now, updatedBy: staff.fullName, updatedByUid: staff.uid,
  };
  const fields = Object.fromEntries(Object.entries(location).map(([key, value]) => [key, encodeFirestoreValue(value)]));
  const path = `projects/shine-relief-trust-cms/databases/(default)/documents/inventoryLocations/${encodeURIComponent(id)}`;
  try {
    await firestoreCommit([{
      update: { name: path, fields },
      currentDocument: { exists: false },
    }], idToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new ApiError('A location with this name already exists. Names are compared without case and surrounding spaces.', 409);
    }
    throw error;
  }
  return json({ ok: true, location }, 201);
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
    if (existing.locationId !== payload.locationId && (existing.locationId !== undefined || payload.locationId !== undefined)) {
      throw new ApiError('This movement retry does not match its original managed destination. Stop and request a stock reconciliation.', 409);
    }
    const existingItemDocument = await firestoreGet(itemPath, idToken);
    if (!existingItemDocument) throw new ApiError('The inventory item for this prior movement is no longer available.', 404);
    const existingItem = decodeFirestoreFields(existingItemDocument.fields);
    if (existing.sourceType === 'procurementReceipt' && existing.locationId === undefined) {
      throw new ApiError('This prior procurement receipt has no verified managed destination and cannot be confirmed as complete. Request a stock reconciliation.', 409);
    }
    if (existing.locationId === undefined) {
      if (typeof existingItem.locationId === 'string' && existingItem.locationId.length > 0) {
        throw new ApiError('This movement was recorded before the managed location balance was created. Do not treat it as a completed retry; request a stock reconciliation.', 409);
      }
    } else {
      if (existingItem.locationId !== existing.locationId || payload.locationId !== existing.locationId) {
        throw new ApiError('The prior movement no longer matches the item’s registered destination. Request a stock reconciliation.', 409);
      }
      const locationDocument = await firestoreGet(`inventoryLocations/${encodeURIComponent(existing.locationId)}`, idToken);
      const balanceId = inventoryLocationBalanceDocumentId(payload.itemId, existing.locationId);
      const balanceDocument = await firestoreGet(`inventoryLocationBalances/${encodeURIComponent(balanceId)}`, idToken);
      if (!locationDocument || !balanceDocument) {
        throw new ApiError('The prior managed movement is missing its registered location or balance. Do not treat it as complete; request a stock reconciliation.', 409);
      }
      const location = decodeFirestoreFields(locationDocument.fields);
      const balance = decodeFirestoreFields(balanceDocument.fields);
      const movementIsInItemHistory = Array.isArray(existingItem.movements) &&
        existingItem.movements.some((movement) => movement && movement.id === existing.id);
      if (location.id !== existing.locationId || location.isActive !== true || location.name !== existingItem.location ||
          balance.id !== balanceId || balance.inventoryItemId !== payload.itemId ||
          balance.locationId !== existing.locationId || balance.unit !== existingItem.unit ||
          balance.quantity !== existingItem.quantityOnHand ||
          balance.lastMovementId !== existingItem.lastMovementId ||
          typeof balance.lastMovementId !== 'string' || balance.lastMovementId.length === 0 ||
          !movementIsInItemHistory) {
        throw new ApiError('The prior managed movement cannot be confirmed against the current item and location balance. Request a stock reconciliation.', 409);
      }
      if (existing.sourceType === 'procurementReceipt') {
        const procurementDocument = await firestoreGet(`procurementLists/${encodeURIComponent(existing.sourceId)}`, idToken);
        if (!procurementDocument) throw new ApiError('The prior procurement receipt ledger is missing. Request a stock reconciliation.', 409);
        const procurement = decodeFirestoreFields(procurementDocument.fields);
        const lineIndex = existing.sourceLineIndex;
        const lineMap = procurement.receivedQuantitiesByLine && typeof procurement.receivedQuantitiesByLine === 'object'
          ? procurement.receivedQuantitiesByLine
          : {};
        const legacyReceived = Array.isArray(procurement.receivedQuantities)
          ? Number(procurement.receivedQuantities[lineIndex] || 0)
          : 0;
        const ledgerReceived = Number(lineMap[`line_${lineIndex}`] ?? lineMap[String(lineIndex)] ?? 0);
        if (procurement.id !== existing.sourceId || procurement.status !== 'purchased' ||
            !Number.isInteger(lineIndex) || lineIndex < 0 ||
            !Number.isFinite(ledgerReceived) || !Number.isFinite(legacyReceived) ||
            Math.max(ledgerReceived, legacyReceived) < existing.quantity) {
          throw new ApiError('The prior procurement receipt cannot be confirmed against its receipt ledger. Request a stock reconciliation.', 409);
        }
      }
    }
    return json({ ok: true, duplicate: true, movement: existing }, 200);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let procurementLine;
    let procurementDocumentForReceipt;
    let procurementForReceipt;
    if (payload.sourceType === 'procurementReceipt') {
      procurementDocumentForReceipt = await firestoreGet(`procurementLists/${encodeURIComponent(payload.sourceId)}`, idToken);
      if (!procurementDocumentForReceipt) throw new ApiError('The purchased procurement list was not found on the server.', 404);
      procurementForReceipt = decodeFirestoreFields(procurementDocumentForReceipt.fields);
      const procurement = procurementForReceipt;
      procurementLine = Array.isArray(procurement.items) ? procurement.items[payload.sourceLineIndex] : undefined;
      const receivedQuantitiesByLine = procurement.receivedQuantitiesByLine && typeof procurement.receivedQuantitiesByLine === 'object'
        ? procurement.receivedQuantitiesByLine
        : {};
      const legacyReceived = Array.isArray(procurement.receivedQuantities)
        ? Number(procurement.receivedQuantities[payload.sourceLineIndex] || 0)
        : 0;
      const ledgerReceived = Number(
        receivedQuantitiesByLine[`line_${payload.sourceLineIndex}`] ??
        receivedQuantitiesByLine[String(payload.sourceLineIndex)] ?? 0,
      );
      const alreadyReceived = Math.max(legacyReceived, ledgerReceived);
      const outstanding = Number(procurementLine?.quantity) - alreadyReceived;
      if (procurement.id !== payload.sourceId || procurement.status !== 'purchased' || procurement.receivedAt ||
          !procurementLine || !Number.isFinite(alreadyReceived) || alreadyReceived < 0 ||
          !Number.isFinite(outstanding) || outstanding <= 0 || payload.quantity > outstanding ||
          (payload.sourceDeliveryId === undefined && payload.quantity !== outstanding)) {
        throw new ApiError('This procurement line exceeds the remaining receivable quantity or is already complete.', 409);
      }
    }
    const itemDocument = await firestoreGet(itemPath, idToken);
    if (!itemDocument) throw new ApiError('The inventory item was not found in the synced register. Sync and refresh before retrying.', 404);
    const item = decodeFirestoreFields(itemDocument.fields);
    const isManagedItem = typeof item.locationId === 'string' && item.locationId.length > 0;
    if (payload.sourceType === 'procurementReceipt' && !isManagedItem) {
      throw new ApiError('Procurement stock receipts require a verified managed destination. Complete physical stock verification and location approval for this item first.', 409);
    }
    let managedLocation;
    let managedBalanceDocument;
    let managedBalance;
    let managedBalanceId;
    if (isManagedItem) {
      if (payload.locationId !== item.locationId) {
        throw new ApiError('This stock movement must use the item’s registered location. Refresh the item and retry.', 409);
      }
      const locationDocument = await firestoreGet(`inventoryLocations/${encodeURIComponent(item.locationId)}`, idToken);
      if (!locationDocument) throw new ApiError('The item’s managed inventory location no longer exists. Ask a Manager to review it.', 409);
      managedLocation = decodeFirestoreFields(locationDocument.fields);
      if (managedLocation.id !== item.locationId || managedLocation.isActive !== true || managedLocation.name !== item.location) {
        throw new ApiError('The item’s registered inventory location is inactive or no longer matches its location record.', 409);
      }
      managedBalanceId = inventoryLocationBalanceDocumentId(payload.itemId, item.locationId);
      managedBalanceDocument = await firestoreGet(`inventoryLocationBalances/${encodeURIComponent(managedBalanceId)}`, idToken);
      managedBalance = managedBalanceDocument ? decodeFirestoreFields(managedBalanceDocument.fields) : undefined;
      if (payload.sourceType === 'procurementReceipt' && payload.locationId !== item.locationId) {
        throw new ApiError('Choose the item’s active destination location before receiving procurement stock.', 409);
      }
    } else if (payload.locationId !== undefined) {
      throw new ApiError('This legacy stock item has no verified managed location. Do not assign one during a movement.', 409);
    }
    const unitPrecisionError = getInventoryQuantityPrecisionError(
      payload.type === 'Adjustment' ? payload.countedQuantity : payload.quantity,
      item.unit,
    );
    if (unitPrecisionError) throw new ApiError(unitPrecisionError, 400);
    const previousQuantity = item.quantityOnHand;
    if (!Number.isFinite(previousQuantity) || previousQuantity < 0 ||
        getInventoryQuantityPrecisionError(previousQuantity, item.unit)) {
      throw new ApiError('The inventory record or its recorded quantity precision is invalid. Review it before recording a movement.', 409);
    }
    if (isManagedItem) {
      if (managedBalance) {
        if (managedBalance.id !== managedBalanceId || managedBalance.inventoryItemId !== payload.itemId ||
            managedBalance.locationId !== item.locationId || managedBalance.unit !== item.unit ||
            managedBalance.quantity !== previousQuantity || typeof managedBalance.lastMovementId !== 'string' || managedBalance.lastMovementId.length === 0 || managedBalance.lastMovementId !== item.lastMovementId ||
            getInventoryQuantityPrecisionError(managedBalance.quantity, item.unit)) {
          throw new ApiError('The location balance does not match the inventory register. Stop and request a stock reconciliation before moving stock.', 409);
        }
      } else if (previousQuantity !== 0 || (Array.isArray(item.movements) && item.movements.length > 0) || item.lastMovementId) {
        throw new ApiError('This managed item has stock but no verified location balance. Complete physical stock verification and Manager/Administrator opening-balance approval first.', 409);
      } else if (payload.type !== 'Received') {
        throw new ApiError('The first managed stock balance must come from a recorded receipt. Opening stock must use the separate physical verification and Manager/Administrator approval process.', 409);
      }
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
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0 || nextQuantity > 1_000_000_000 ||
        getInventoryQuantityPrecisionError(nextQuantity, item.unit)) {
      throw new ApiError('The resulting stock balance is outside the allowed range or violates the item unit precision.', 409);
    }

    const now = new Date().toISOString();
    const movementQuantity = payload.type === 'Adjustment' ? Math.abs(nextQuantity - previousQuantity) : payload.quantity;
    const movement = {
      id: payload.id,
      inventoryItemId: payload.itemId,
      unit: item.unit,
      type: payload.type,
      quantity: movementQuantity,
      date: payload.date,
      location: String(item.location || ''),
      ...(isManagedItem ? { locationId: item.locationId } : {}),
      ...(payload.destination ? { destination: payload.destination } : {}),
      ...(payload.reference ? { reference: payload.reference } : {}),
      ...(payload.sourceType ? { sourceType: payload.sourceType, sourceId: payload.sourceId, sourceLineIndex: payload.sourceLineIndex } : {}),
      ...(payload.sourceDeliveryId ? { sourceDeliveryId: payload.sourceDeliveryId } : {}),
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
      unit: item.unit,
      type: movement.type,
      quantity: movement.quantity,
      date: movement.date,
      location: movement.location,
      ...(movement.locationId ? { locationId: movement.locationId } : {}),
      ...(movement.destination ? { destination: movement.destination } : {}),
      ...(movement.reference ? { reference: movement.reference } : {}),
      ...(movement.sourceType ? { sourceType: movement.sourceType, sourceId: movement.sourceId, sourceLineIndex: movement.sourceLineIndex } : {}),
      ...(movement.sourceDeliveryId ? { sourceDeliveryId: movement.sourceDeliveryId } : {}),
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
    const writes = [
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
    ];
    if (isManagedItem) {
      const balanceNow = {
        id: managedBalanceId,
        inventoryItemId: payload.itemId,
        locationId: item.locationId,
        unit: item.unit,
        quantity: nextQuantity,
        ...(managedBalance ? {} : { createdAt: now, createdByUid: staff.uid }),
        updatedAt: now,
        updatedByUid: staff.uid,
        lastMovementId: payload.id,
      };
      const balanceFields = Object.fromEntries(Object.entries(balanceNow).map(([key, value]) => [key, encodeFirestoreValue(value)]));
      writes.push({
        update: {
          name: `projects/shine-relief-trust-cms/databases/(default)/documents/inventoryLocationBalances/${encodeURIComponent(managedBalanceId)}`,
          fields: balanceFields,
        },
        updateMask: { fieldPaths: Object.keys(balanceFields) },
        currentDocument: managedBalanceDocument ? { updateTime: managedBalanceDocument.updateTime } : { exists: false },
      });
    }
    if (payload.sourceType === 'procurementReceipt' && procurementDocumentForReceipt && procurementForReceipt) {
      const receivedQuantitiesByLine = procurementForReceipt.receivedQuantitiesByLine && typeof procurementForReceipt.receivedQuantitiesByLine === 'object'
        ? { ...procurementForReceipt.receivedQuantitiesByLine }
        : {};
      const ledgerKey = `line_${payload.sourceLineIndex}`;
      const legacyReceived = Array.isArray(procurementForReceipt.receivedQuantities)
        ? Number(procurementForReceipt.receivedQuantities[payload.sourceLineIndex] || 0)
        : 0;
      const priorLedger = Number(receivedQuantitiesByLine[ledgerKey] ?? receivedQuantitiesByLine[String(payload.sourceLineIndex)] ?? 0);
      receivedQuantitiesByLine[ledgerKey] = Math.max(legacyReceived, priorLedger) + payload.quantity;
      delete receivedQuantitiesByLine[String(payload.sourceLineIndex)];
      const procurementFields = {
        receivedQuantitiesByLine: encodeFirestoreValue(receivedQuantitiesByLine),
        lastReceiptMovementId: encodeFirestoreValue(payload.id),
        updatedAt: encodeFirestoreValue(now),
        updatedBy: encodeFirestoreValue(staff.fullName),
      };
      writes.push({
        update: {
          name: `projects/shine-relief-trust-cms/databases/(default)/documents/procurementLists/${encodeURIComponent(payload.sourceId)}`,
          fields: procurementFields,
        },
        updateMask: { fieldPaths: Object.keys(procurementFields) },
        currentDocument: { updateTime: procurementDocumentForReceipt.updateTime },
      });
    }
    try {
      await firestoreCommit(writes, idToken);
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
  if (email === PRIMARY_ADMIN_EMAIL && identity.emailVerified !== true) {
    throw new ApiError('Verify the primary Administrator email before accessing SHINE services.', 403);
  }
  const profile = await firestoreGet(`staffUsers/${encodeURIComponent(identity.localId)}`, token);
  const fields = profile?.fields || {};
  const profileEmail = String(valueOf(fields.email) || '').toLowerCase();
  const isPrimaryAdmin = email === PRIMARY_ADMIN_EMAIL && identity.emailVerified === true;
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
  let attachment;
  try {
    attachment = await getAttachment(storagePath, idToken);
  } catch (error) {
    // A failed version-metadata batch can leave an uploaded but unindexed object.
    // Only managers/admins may clean up such an orphan; existing indexed files
    // still require the normal attachment checks below.
    if (error instanceof ApiError && error.status === 404 &&
        ['Administrator', 'Manager'].includes(staff.role)) return;
    throw error;
  }
  if (attachment.versionOf || attachment.supersededBy) {
    throw new ApiError('Document versions are retained as history and cannot be deleted.', 403);
  }
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

  if (url.pathname === '/api/inventory/locations' && ['GET', 'POST'].includes(request.method)) {
    return handleInventoryLocations(request, staff, idToken);
  }

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
      const invitationResponse = await handleStaffInvitationRequest(request, env);
      const response = invitationResponse || await handleRequest(request, env);
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
