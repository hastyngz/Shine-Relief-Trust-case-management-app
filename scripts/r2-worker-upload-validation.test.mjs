import assert from 'node:assert/strict';
import worker from '../workers/r2-storage/index.mjs';

const originalFetch = globalThis.fetch;
const observedFetches = [];
globalThis.fetch = async (input) => {
  const url = String(input);
  observedFetches.push(url);
  if (url.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
    return new Response(JSON.stringify({
      users: [{ localId: 'synthetic-staff-uid', email: 'worker-test@example.invalid', displayName: 'Synthetic Staff' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('firestore.googleapis.com/v1/projects/shine-relief-trust-cms/databases/(default)/documents/staffUsers/')) {
    return new Response(JSON.stringify({
      fields: {
        email: { stringValue: 'worker-test@example.invalid' },
        status: { stringValue: 'Active' },
        role: { stringValue: 'Staff' },
        fullName: { stringValue: 'Synthetic Staff' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected network request during a rejected upload: ${url}`);
};

const env = {
  FIREBASE_WEB_API_KEY: 'synthetic-test-key',
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-test-access-key',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-test-secret-key',
  CLOUDFLARE_R2_ENDPOINT: 'https://r2.example.invalid',
  CLOUDFLARE_R2_BUCKET_NAME: 'synthetic-test-bucket',
  CORS_ALLOWED_ORIGINS: 'https://shine-relief-trust-cms.web.app',
};

async function upload(contentType, body) {
  return worker.fetch(new Request('https://worker.example.invalid/api/storage/object', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer synthetic-id-token',
      Origin: 'https://shine-relief-trust-cms.web.app',
      'Content-Type': contentType,
      'X-Storage-Path': 'attachments/girl/GIRL-SYNTHETIC/att_123_test12_receipt.pdf',
      'X-Storage-Target-Type': 'girl',
      'X-Storage-Target-Id': 'GIRL-SYNTHETIC',
    },
    body,
  }), env);
}

try {
  const spoofedPdf = await upload('application/pdf', new TextEncoder().encode('<html>not a PDF</html>'));
  assert.equal(spoofedPdf.status, 415);
  assert.match((await spoofedPdf.json()).error, /does not match its declared file type/);
  assert.equal(spoofedPdf.headers.get('Access-Control-Allow-Origin'), 'https://shine-relief-trust-cms.web.app');

  const unsupportedSvg = await upload('image/svg+xml', new TextEncoder().encode('<svg></svg>'));
  assert.equal(unsupportedSvg.status, 415);
  assert.match((await unsupportedSvg.json()).error, /Attachments must be JPEG, PNG, WebP, or PDF/);

  assert.equal(observedFetches.length, 4, 'only the synthetic Firebase identity/profile reads should occur; rejected uploads must never reach R2');
  console.log('R2 Worker upload validation tests passed.');
} finally {
  globalThis.fetch = originalFetch;
}
