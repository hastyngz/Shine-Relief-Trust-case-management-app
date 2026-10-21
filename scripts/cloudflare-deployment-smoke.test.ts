import assert from 'node:assert/strict';

const appUrl = (process.env.SMOKE_APP_URL || 'https://shine-relief-trust-cms.web.app').replace(/\/$/, '');
const workerUrl = (process.env.SMOKE_WORKER_URL || 'https://shine-relief-r2-storage-api.shine-relief-trust-cms.workers.dev').replace(/\/$/, '');

async function run() {
  const appResponse = await fetch(appUrl);
  assert.equal(appResponse.status, 200, 'Firebase Hosting should serve the application');
  const html = await appResponse.text();
  const scriptPath = [...html.matchAll(/<script[^>]+src="([^"]+)/g)]
    .map((match) => match[1])
    .find((src) => src.startsWith('/assets/'));
  assert.ok(scriptPath, 'The app HTML should reference a built JavaScript asset');

  const bundleResponse = await fetch(new URL(scriptPath, appUrl));
  assert.equal(bundleResponse.status, 200, 'The deployed JavaScript asset should be available');
  const bundle = await bundleResponse.text();
  assert.ok(bundle.includes(workerUrl), 'The deployed frontend should point to the Cloudflare Worker');
  for (const route of ['/api/ai/chat', '/api/ai/transcribe', '/api/ai/analyze-document']) {
    assert.ok(bundle.includes(route), `The deployed frontend should include ${route}`);
  }

  const origin = new URL(appUrl).origin;
  const preflight = await fetch(`${workerUrl}/api/ai/chat`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(preflight.status, 204, 'Worker should accept the app-origin CORS preflight');
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

  const aiResponse = await fetch(`${workerUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Smoke test' }),
  });
  assert.equal(aiResponse.status, 401, 'AI route should require Firebase authentication');
  assert.match(aiResponse.headers.get('content-type') || '', /application\/json/);

  const storageResponse = await fetch(`${workerUrl}/api/storage/object?path=smoke-test`, {
    headers: { Origin: origin },
  });
  assert.equal(storageResponse.status, 401, 'Storage route should require Firebase authentication');
  assert.match(storageResponse.headers.get('content-type') || '', /application\/json/);

  console.log('Cloudflare deployment smoke tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});