# Cloudflare KV caching implementation notes

## Current status
This Worker currently authenticates Firebase users and serves private R2 storage and AI routes. The app's Firestore listeners are implemented separately in the frontend, so adding a KV binding to this Worker alone will not reduce those Firestore reads.

## Safety requirements before enabling caching
- Do not cache authentication, role/permission decisions, or user-specific responses in shared KV.
- Do not cache girls' records, household records, health or family follow-ups, safeguarding cases, staff contacts, payroll, expenses, or payment data.
- Only cache explicitly approved, non-sensitive shared reference data or aggregate data that contains no personal information.
- Authenticate and authorize each request before returning data; never treat a KV hit as authorization.
- Use a short TTL, versioned keys, and a clear invalidation strategy. Cache failures must fall back safely to the source of truth.
- Add tests for authorization, cache miss/hit, expiry, invalidation, and KV unavailable behavior.
- Measure Firestore reads before and after routing a real eligible read path through the Worker. Do not claim savings until measured.

## Cloudflare setup
A KV namespace must be created in Cloudflare and its namespace ID added as a Worker binding in `wrangler.toml` before code can use it. The namespace ID is configuration, not a secret. Do not put Cloudflare API tokens or R2 credentials in source control.

## Next engineering step
Inspect the app's actual data access patterns and identify a specific non-sensitive read path before implementing an endpoint. The existing direct Firestore `onSnapshot` listeners are real-time subscriptions and should not be blindly replaced with stale KV responses.
