import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  checkRateLimit,
  createRateLimiter,
  getClientKey,
  getRateLimitConfig,
  resetRateLimit,
  type RateLimitConfig,
} from '../src/server/rateLimit';

// ---------------------------------------------------------------------------
// Task 6: rate limiting on the AI, storage and safeguarding endpoints.
// ---------------------------------------------------------------------------

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config: RateLimitConfig = { name: 'test-ai', limit: 3, windowMs: 60_000 };

// 1. The limit is reached after `limit` requests, then blocked with Retry-After.
resetRateLimit();
const t0 = 1_000_000;
assert.equal(checkRateLimit(config, 'uid:alice', t0).allowed, true);
assert.equal(checkRateLimit(config, 'uid:alice', t0).allowed, true);
const third = checkRateLimit(config, 'uid:alice', t0);
assert.equal(third.allowed, true);
assert.equal(third.remaining, 0);

const blocked = checkRateLimit(config, 'uid:alice', t0);
assert.equal(blocked.allowed, false, 'the fourth request in the window is blocked');
assert.equal(blocked.retryAfterSeconds, 60, 'Retry-After reflects the window');
assert.equal(blocked.remaining, 0);

// 2. The limit resets once the window elapses.
assert.equal(checkRateLimit(config, 'uid:alice', t0 + 60_000).allowed, true, 'the window resets after windowMs');

// 3. Limits are per key: another user is unaffected.
resetRateLimit();
checkRateLimit(config, 'uid:alice', t0);
checkRateLimit(config, 'uid:alice', t0);
checkRateLimit(config, 'uid:alice', t0);
assert.equal(checkRateLimit(config, 'uid:alice', t0).allowed, false);
assert.equal(checkRateLimit(config, 'uid:bob', t0).allowed, true, 'another uid keeps its own window');

// 4. The key is the uid when authenticated, otherwise the forwarded IP.
assert.equal(getClientKey({ headers: {} } as any, 'abc'), 'uid:abc');
assert.equal(
  getClientKey({ headers: { 'x-forwarded-for': '41.87.1.9, 10.0.0.1' }, ip: '10.0.0.1' } as any),
  'ip:41.87.1.9',
);
assert.equal(getClientKey({ headers: {}, ip: '192.168.1.5' } as any), 'ip:192.168.1.5');

// 5. The middleware returns HTTP 429 with Retry-After and a friendly message.
resetRateLimit();
function fakeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    headers,
    statusCode: 0,
    body: undefined as any,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { res.statusCode = code; return res; },
    json(payload: any) { res.body = payload; return res; },
  };
  return res;
}

const limiter = createRateLimiter({ name: 'test-mw', limit: 2, windowMs: 30_000 }, { resolveUid: () => 'uid:carol' });
const req = { headers: {}, socket: {}, ip: '127.0.0.1' } as any;

let nextCalls = 0;
const next = () => { nextCalls += 1; };
await limiter(req, fakeRes(), next);
await limiter(req, fakeRes(), next);
assert.equal(nextCalls, 2, 'allowed requests reach the handler');

const limitedRes = fakeRes();
await limiter(req, limitedRes, next);
assert.equal(nextCalls, 2, 'the limited request does not reach the handler');
assert.equal(limitedRes.statusCode, 429);
assert.equal(limitedRes.headers['retry-after'], '30');
assert.equal(limitedRes.headers['x-ratelimit-limit'], '2');
assert.match(limitedRes.body.error, /Too many test-mw requests/);
assert.match(limitedRes.body.reply, /Please wait 30 seconds/, 'AI clients read the friendly reply');
assert.equal(limitedRes.body.success, false);

// 6. A failing uid resolver falls back to the IP rather than crashing.
resetRateLimit();
const ipLimiter = createRateLimiter({ name: 'test-ip', limit: 1, windowMs: 10_000 }, {
  resolveUid: () => { throw new Error('no token'); },
});
const ipReq = { headers: {}, socket: {}, ip: '10.1.2.3' } as any;
let ipNext = 0;
await ipLimiter(ipReq, fakeRes(), () => { ipNext += 1; });
const ipLimited = fakeRes();
await ipLimiter(ipReq, ipLimited, () => { ipNext += 1; });
assert.equal(ipNext, 1, 'unauthenticated callers are limited by IP');
assert.equal(ipLimited.statusCode, 429);

// 7. Configurable limits via environment, with safe defaults.
const defaults = getRateLimitConfig({} as NodeJS.ProcessEnv);
assert.equal(defaults.ai.limit, 20, 'AI defaults to 20/minute');
assert.equal(defaults.storage.limit, 60, 'storage defaults to 60/minute');
assert.equal(defaults.safeguarding.limit, 60, 'safeguarding defaults to 60/minute');
const custom = getRateLimitConfig({ SHINE_AI_RATE_LIMIT: '5', SHINE_STORAGE_RATE_LIMIT: '100' } as NodeJS.ProcessEnv);
assert.equal(custom.ai.limit, 5);
assert.equal(custom.storage.limit, 100);
assert.equal(custom.safeguarding.limit, 60, 'unset limits keep their default');
const invalid = getRateLimitConfig({ SHINE_AI_RATE_LIMIT: 'not-a-number' } as NodeJS.ProcessEnv);
assert.equal(invalid.ai.limit, 20, 'invalid limits fall back to the default');

// 8. server.ts wires the limiters onto the right routes and leaves health open.
const server = readFileSync(join(root, 'server.ts'), 'utf8');
assert.ok(/app\.post\('\/api\/ai\/chat', aiLimiter/.test(server), 'AI chat is limited');
assert.ok(/app\.post\('\/api\/ai\/transcribe', aiLimiter/.test(server), 'AI transcribe is limited');
assert.ok(/app\.post\('\/api\/ai\/analyze-document', aiLimiter/.test(server), 'AI document analysis is limited');
assert.ok(/app\.put\('\/api\/storage\/object', storageLimiter/.test(server), 'storage upload is limited');
assert.ok(/app\.get\('\/api\/storage\/object', storageLimiter/.test(server), 'storage download is limited');
assert.ok(/app\.get\('\/api\/storage\/download-url', storageLimiter/.test(server), 'storage download URLs are limited');
assert.ok(/app\.delete\('\/api\/storage\/object', storageLimiter/.test(server), 'storage delete is limited');
for (const route of [
  "app.get('/api/safeguarding/cases'",
  "app.get('/api/safeguarding/count'",
  "app.get('/api/safeguarding/cases/:caseId'",
  "app.post('/api/safeguarding/cases'",
  "app.get('/api/safeguarding/cases/:caseId/files'",
  "app.put('/api/safeguarding/cases/:caseId/files/:fileId'",
  "app.get('/api/safeguarding/cases/:caseId/files/:fileId'",
]) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.ok(new RegExp(`${escaped}, safeguardingLimiter`).test(server), `${route} is limited`);
}
assert.ok(/app\.get\('\/api\/health', \(req, res\)/.test(server), 'health stays unlimited');

// 9. Rate limiting must not touch the offline sync flush path (it is not an HTTP route).
assert.ok(!/api\/sync/.test(server), 'there is no HTTP sync endpoint that a limiter could throttle');

// 10. The AI assistant surfaces the friendly 429 message instead of a generic failure.
const aiView = readFileSync(join(root, 'src/components/AIAssistant/AIAssistantView.tsx'), 'utf8');
assert.ok(/response\.status === 429/.test(aiView), 'the AI view handles 429');
assert.ok(/Retry-After/.test(aiView), 'the AI view reads Retry-After');

console.log('Rate limit tests passed: limit reached, limit reset, per-uid keys, 429 + Retry-After, env config, route wiring.');
