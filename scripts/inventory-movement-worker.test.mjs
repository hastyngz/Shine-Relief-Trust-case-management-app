import assert from 'node:assert/strict';
import worker from '../workers/r2-storage/index.mjs';

const originalFetch = globalThis.fetch;
const fields = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fields) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fields(entry)])) } };
};
const decode = (field) => {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(decode);
  if ('mapValue' in field) return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([key, value]) => [key, decode(value)]));
  return undefined;
};
const asFields = (value) => Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fields(entry)]));

const env = {
  FIREBASE_WEB_API_KEY: 'synthetic-test-key',
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-test-access-key',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-test-secret-key',
  CLOUDFLARE_R2_ENDPOINT: 'https://r2.example.invalid',
  CLOUDFLARE_R2_BUCKET_NAME: 'synthetic-test-bucket',
  CORS_ALLOWED_ORIGINS: 'https://shine-relief-trust-cms.web.app',
};
const baseItem = () => ({
  id: 'item-synthetic',
  stockCode: 'SYN-1',
  name: 'Synthetic stock item',
  unit: 'packs',
  location: 'Main Office',
  quantityOnHand: 10,
  movements: [],
  updatedAt: '2026-10-26T10:00:00.000Z',
});
const requestPayload = (overrides = {}) => ({
  id: 'mov_synthetic_123',
  itemId: 'item-synthetic',
  type: 'Received',
  quantity: 3,
  date: '2026-10-26',
  reason: 'Synthetic regression fixture',
  ...overrides,
});
const procurementPayload = (overrides = {}) => requestPayload({
  id: 'prc_proc-synthetic_0',
  reference: 'Procurement proc-synthetic · line 1 · PO PO-SYNTHETIC',
  sourceType: 'procurementReceipt',
  sourceId: 'proc-synthetic',
  sourceLineIndex: 0,
  ...overrides,
});
function setup({ role = 'Staff', item = baseItem(), commitStatuses = [200], existingMovement, procurementList } = {}) {
  let itemReads = 0;
  let commits = 0;
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ localId: 'staff-synthetic', email: 'staff@example.invalid', displayName: 'Synthetic Staff' }] }), { status: 200 });
    }
    if (url.includes('/documents/staffUsers/staff-synthetic')) {
      return new Response(JSON.stringify({ fields: asFields({ email: 'staff@example.invalid', status: 'Active', role, fullName: 'Synthetic Staff' }) }), { status: 200 });
    }
    if (url.includes('/documents/inventoryMovements/')) {
      if (existingMovement) return new Response(JSON.stringify({ fields: asFields(existingMovement) }), { status: 200 });
      return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    }
    if (url.includes('/documents/procurementLists/proc-synthetic')) {
      if (procurementList) return new Response(JSON.stringify({ updateTime: '2026-10-26T10:00:00.000000Z', fields: asFields(procurementList) }), { status: 200 });
      return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    }
    if (url.includes('/documents/inventoryItems/item-synthetic')) {
      itemReads += 1;
      const liveItem = typeof item === 'function' ? item(itemReads) : item;
      return new Response(JSON.stringify({ name: 'projects/shine-relief-trust-cms/databases/(default)/documents/inventoryItems/item-synthetic', updateTime: `2026-10-26T10:00:0${itemReads}.000000Z`, fields: asFields(liveItem) }), { status: 200 });
    }
    if (url.includes('/documents:commit')) {
      const body = JSON.parse(init.body);
      writes.push(body.writes);
      const status = commitStatuses[Math.min(commits, commitStatuses.length - 1)];
      commits += 1;
      return new Response(status === 200 ? JSON.stringify({ writeResults: [{}, {}] }) : JSON.stringify({ error: { code: status, message: 'synthetic commit conflict' } }), { status });
    }
    throw new Error(`Unexpected synthetic network request: ${url}`);
  };
  return { writes, getCounts: () => ({ itemReads, commits }) };
}
async function send(payload, envOverrides = env) {
  return worker.fetch(new Request('https://worker.example.invalid/api/inventory/movement', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer synthetic-id-token',
      Origin: 'https://shine-relief-trust-cms.web.app',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }), envOverrides);
}

try {
  {
    const mock = setup();
    const response = await send(requestPayload());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.quantityOnHand, 13);
    assert.equal(mock.writes.length, 1);
    assert.equal(mock.writes[0].length, 2, 'balance and immutable movement must be committed atomically');
    assert.equal(mock.writes[0][0].currentDocument.updateTime, '2026-10-26T10:00:01.000000Z');
    assert.equal(decode(mock.writes[0][0].update.fields.quantityOnHand), 13);
    assert.equal(decode(mock.writes[0][1].update.fields.previousQuantity), 10);
    assert.equal(decode(mock.writes[0][1].update.fields.newQuantity), 13);
    assert.deepEqual(mock.writes[0][1].currentDocument, { exists: false });
  }

  {
    const mock = setup({ item: (read) => ({ ...baseItem(), quantityOnHand: read === 1 ? 10 : 12 }) , commitStatuses: [409, 200] });
    const response = await send(requestPayload());
    const body = await response.json();
    assert.equal(response.status, 200, 'a stale item update should be retried against the newer balance');
    assert.equal(body.quantityOnHand, 15);
    assert.equal(mock.writes.length, 2);
    assert.equal(mock.writes[1][0].currentDocument.updateTime, '2026-10-26T10:00:02.000000Z');
  }

  // The Worker must reject impossible calendar dates before reading or writing stock.
  for (const invalidDate of ['2026-02-29', '2026-02-31', '31/10/2026', '']) {
    const mock = setup();
    const response = await send(requestPayload({ date: invalidDate }));
    assert.equal(response.status, 400, `invalid movement date should be rejected: ${invalidDate || '(empty)'}`);
    assert.equal(mock.writes.length, 0, 'invalid dates must never change stock');
    assert.equal(mock.getCounts().itemReads, 0, 'invalid dates should be rejected before reading the item');
  }

  {
    const mock = setup({ item: { ...baseItem(), quantityOnHand: 2 } });
    const response = await send(requestPayload({ type: 'Issued', quantity: 3 }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Insufficient stock/);
    assert.equal(mock.writes.length, 0, 'insufficient stock must never attempt a commit');
  }

  {
    const payload = requestPayload();
    const mock = setup({ role: 'View Only' });
    const response = await send(payload);
    assert.equal(response.status, 403);
    assert.equal(mock.writes.length, 0, 'view-only role must be rejected before a write');
  }

  {
    const payload = requestPayload();
    const fingerprintPayload = { id: payload.id, itemId: payload.itemId, type: payload.type, quantity: payload.quantity, countedQuantity: undefined, date: payload.date, destination: undefined, reference: undefined, reason: payload.reason };
    const fingerprint = JSON.stringify(Object.fromEntries(Object.entries(fingerprintPayload).filter(([, value]) => value !== undefined)));
    const mock = setup({ existingMovement: { id: payload.id, inventoryItemId: payload.itemId, recordedByUid: 'staff-synthetic', requestFingerprint: fingerprint, newQuantity: 13 } });
    const response = await send(payload);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).duplicate, true);
    assert.equal(mock.writes.length, 0, 'a retried movement ID must not create a second stock change');
  }

  {
    const mock = setup({ procurementList: {
      id: 'proc-synthetic', status: 'purchased', purchaseOrderReference: 'PO-SYNTHETIC',
      items: [{ description: 'Synthetic stock item', quantity: 3, unit: 'packs' }],
    } });
    const response = await send(procurementPayload());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.movement.sourceType, 'procurementReceipt');
    assert.equal(body.movement.sourceId, 'proc-synthetic');
    assert.equal(body.movement.sourceLineIndex, 0);
    assert.equal(decode(mock.writes[0][1].update.fields.sourceId), 'proc-synthetic');
    assert.equal(decode(mock.writes[0][1].update.fields.sourceLineIndex), 0);
    assert.equal(decode(mock.writes[0][0].update.fields.movements)[0].inventoryItemId, 'item-synthetic');
  }

  {
    const mock = setup({ procurementList: {
      id: 'proc-synthetic', status: 'purchased', purchaseOrderReference: 'PO-SYNTHETIC',
      items: [{ description: 'Synthetic stock item', quantity: 3, unit: 'packs' }],
    } });
    const response = await send(procurementPayload({
      id: 'prcd_12345678_0', quantity: 1, sourceDeliveryId: 'delivery_12345678',
      reference: 'Delivery delivery_12345678 · DN-SYNTHETIC · procurement proc-synthetic · line 1',
    }));
    const body = await response.json();
    assert.equal(response.status, 200, 'partial deliveries should be accepted when within the outstanding quantity');
    assert.equal(body.movement.sourceDeliveryId, 'delivery_12345678');
    assert.equal(mock.writes[0].length, 3, 'stock balance, movement, and cumulative procurement receipt must commit atomically');
    assert.deepEqual(decode(mock.writes[0][2].update.fields.receivedQuantitiesByLine), { line_0: 1 });
  }

  {
    const mock = setup({ procurementList: {
      id: 'proc-synthetic', status: 'purchased', purchaseOrderReference: 'PO-SYNTHETIC',
      receivedQuantities: [2],
      items: [{ description: 'Synthetic stock item', quantity: 3, unit: 'packs' }],
    } });
    const response = await send(procurementPayload({
      id: 'prcd_87654321_0', quantity: 2, sourceDeliveryId: 'delivery_87654321',
      reference: 'Delivery delivery_87654321 · DN-OVER · procurement proc-synthetic · line 1',
    }));
    assert.equal(response.status, 409, 'cumulative receipt quantity must not exceed the ordered quantity');
    assert.equal(mock.writes.length, 0);
  }

  {
    const mock = setup();
    const response = await send(procurementPayload({ type: 'Issued' }));
    assert.equal(response.status, 400, 'procurement provenance is restricted to receipt movements');
    assert.equal(mock.writes.length, 0);
  }

  {
    const mock = setup();
    const response = await send(requestPayload({ sourceId: 'proc-synthetic' }));
    assert.equal(response.status, 400, 'orphan source fields are rejected');
    assert.equal(mock.writes.length, 0);
  }

  {
    const mock = setup({ procurementList: {
      id: 'proc-synthetic', status: 'purchased', items: [{ description: 'Synthetic stock item', quantity: 4, unit: 'packs' }],
    } });
    const response = await send(procurementPayload());
    assert.equal(response.status, 409, 'the Worker requires the full quantity recorded on the purchased line');
    assert.equal(mock.writes.length, 0);
  }

  {
    const mock = setup({ procurementList: {
      id: 'proc-synthetic', status: 'purchased', items: [{ description: 'Synthetic stock item', quantity: 3, unit: 'boxes' }],
    } });
    const response = await send(procurementPayload());
    assert.equal(response.status, 409, 'the Worker rejects unit conversion assumptions');
    assert.equal(mock.writes.length, 0);
  }

  {
    const payload = procurementPayload();
    const fingerprintPayload = {
      id: payload.id,
      itemId: payload.itemId,
      type: payload.type,
      quantity: payload.quantity,
      countedQuantity: undefined,
      destination: undefined,
      reference: payload.reference,
      reason: payload.reason,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      sourceLineIndex: payload.sourceLineIndex,
    };
    const fingerprint = JSON.stringify(Object.fromEntries(Object.entries(fingerprintPayload).filter(([, value]) => value !== undefined)));
    const existingMovement = {
      id: payload.id, inventoryItemId: payload.itemId, recordedByUid: 'staff-synthetic',
      requestFingerprint: fingerprint, sourceType: 'procurementReceipt', sourceId: 'proc-synthetic',
      sourceLineIndex: 0, date: '2026-10-25', quantity: 3,
    };
    const mock = setup({ existingMovement });
    const response = await send(payload);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.duplicate, true);
    assert.equal(body.movement.date, '2026-10-25', 'the first accepted server receipt date remains authoritative');
    assert.equal(mock.writes.length, 0);
  }

  console.log('Inventory movement Worker transaction tests passed.');
} finally {
  globalThis.fetch = originalFetch;
}
