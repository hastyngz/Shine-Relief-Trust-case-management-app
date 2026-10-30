# Cloudflare KV caching implementation notes

## Required scope
The target is to cover the app's full Firestore data-access surface, not only one reference collection. This includes reads across all collections and queries used by the app, plus a coordinated write/invalidation path so updates made by one staff member do not leave other staff seeing stale data.

## Current status
The Worker currently authenticates Firebase users and serves private R2 storage and AI routes. The app's Firestore listeners and many reads/writes are implemented separately in the frontend, so adding a KV binding to this Worker alone will not reduce those Firestore reads. The KV binding is configured in `workers/r2-storage/wrangler.toml`, but cache code and app integration have not yet been implemented. A repeatable static inventory script now exists at `scripts/audit-firestore-access.mjs`; run it with `npm run audit:firestore-access` from the project root before deciding which paths can safely be routed through a cache.

## Security and consistency requirements
- Authenticate every request and check current staff status, role, and relevant permissions before returning cached data. A cache hit must never grant access.
- Cache keys for private data must be scoped to the authenticated user and the exact authorized query; never use a shared key for private records across users or roles.
- Cover all collections in the data-access audit, but apply per-data-type cache policies. Sensitive records (girls, households, health, family follow-ups, safeguarding, staff contacts, payroll, expenses, payments, audit logs, messages and notifications) require strict isolation, short lifetimes, permission checks, and deliberate invalidation; some real-time or high-risk reads may need source revalidation rather than serving potentially stale KV data.
- Do not cache authentication tokens, role decisions, or permission decisions as authoritative results.
- Coordinate writes from all app clients through a cache-aware write path, or ensure every existing write path reliably invalidates/version-bumps affected cache entries. Direct Firestore writes that bypass invalidation can leave stale cache entries.
- Preserve live-update behavior where the app relies on Firestore `onSnapshot`; do not silently replace real-time subscriptions with stale cached responses.
- KV is eventually consistent. Treat cached results as potentially stale; do not use KV as the source of truth or for transactional/atomic decisions.
- Use short TTLs, versioned keys, safe cache-miss fallback to Firestore, and fail safely when KV is unavailable.
- Add tests for each role and restricted permission, user/role cache isolation, cache hit/miss, expiry, write invalidation, KV outage, and live-update behavior.
- Measure Firestore reads before and after routing actual app data access through the cache. Do not claim savings until measured.

## Cloudflare setup
A KV namespace is bound in Wrangler as `KV` using namespace ID `91b798c7acfc4ad4829bf1dd5c609a68`. The namespace ID is configuration, not a secret. Do not put Cloudflare API tokens or R2 credentials in source control.

## Engineering sequence
1. Audit every Firestore read, query, listener, and write across the app.
2. Design authenticated Worker data endpoints and a compatibility layer for app callers.
3. Route reads through the cache-aware layer with collection-specific policies and per-user keys.
4. Route or invalidate writes and preserve real-time updates.
5. Add tests, run TypeScript and production builds, and compare Firestore read metrics.
6. Deploy only after the tests and permission review pass.

## One-shot read review (2026-10-14)

A follow-up review of the explicit `getDoc` / `getDocs` helpers in `src/services/firestoreSync.ts` did not reveal a safe first KV target:

- `getEmployeeSalaryHistory` and `getEmployeeSalaryHistoryForStaff` read restricted salary-history records. Do not cache these in the first implementation.
- `getReportHistory` reads report metadata scoped by the caller or manager/admin role. It is not a good first target because report visibility is user/role-dependent and new report entries are written directly to Firestore.
- `getStaffUserDoc` and `getStaffUserByEmail` are used for staff identity/access-related information and must remain source-validated.
- The broad `getDocs` calls inside full-database restore/clear operations are administrative maintenance paths, not user-facing repeated reads to cache.
- The shared operational collections, including market prices and forecast settings, use live `onSnapshot` listeners; a separate cached GET would not remove those reads.

**Result:** No safe, worthwhile first cache target is approved from these reviewed call sites. Do not ship a decorative KV helper or claim savings. The next useful engineering step is a deliberate data-access abstraction that preserves Firestore listener semantics and authorization, then migrate one explicitly chosen collection end-to-end (reads, writes, invalidation and tests) rather than adding a disconnected cache route.
