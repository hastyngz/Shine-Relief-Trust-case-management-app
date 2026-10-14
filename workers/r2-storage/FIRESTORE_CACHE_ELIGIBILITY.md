# Firestore cache eligibility audit

This is the initial policy map for the Cloudflare KV work. It is intentionally conservative. A collection is not eligible for KV merely because an active staff member can read it: the implementation must also prove that the current caller is authorized, account for permission revocation, handle writes from every client, and preserve any live subscription behavior.

## Do not serve from KV in the initial rollout

These collections contain individual, sensitive, restricted, financial, audit, or user-specific information. Continue to read them from Firestore with its rules or the existing authorized server endpoint until a collection-specific permission and invalidation design is reviewed:

- girls, households, educationalFollowUps, healthFollowUps, familyFollowUps
- safeguardingCases, safeguardingAuditLogs, caseReviews, caseGoals, caseActions, caseActionAuditLogs, historicalCaseRecords
- staffUsers, contacts, people, interactions
- employeeSalaryHistory, employeeAuditLogs, employees, payrollRecords
- expenses, rentPayments, budgets, annualBudgets, procurementLists, projectProjections, whatIfScenarios
- attachments, reportHistory, reportExports, importAudits, restrictedImportSources
- staffConversations, staffMessages, staffNotifications, userNotificationPreferences
- aiAuditLogs, aiSettings, intelligenceSuggestions

This list is deliberately broad. Contact details and audit data remain private even when the current Firestore rules allow all active staff to read them.

## Possible candidates for a later, narrow pilot

- marketPrices
- forecastSettings
- staffAnnouncements

Firestore rules currently allow active staff to read these collections, but writes and freshness requirements differ. They are only *candidates*, not approved for caching yet. Before a pilot, confirm every app read and write path, whether any screen depends on real-time updates, and how the Worker verifies the current active staff account on every request. Do not cache these until the client is actually routed through the Worker and invalidation behavior is tested.

## Why the current app cannot gain savings from the KV binding alone

The React app reads Firestore directly through Firebase client SDK calls, including `getDocs`, `getDoc`, and `onSnapshot`. The Worker currently handles R2 storage and AI requests, not general Firestore data access. Adding KV reads to the Worker without routing actual app reads through it would be a disconnected cache and would not reduce Firestore usage.

## Required pilot acceptance checks

1. Cache miss reads from the authoritative source and only stores an approved, validated response.
2. Cache hits authenticate the caller and check current staff status before returning data; cache contents never grant access.
3. Restricted records, role decisions, ID tokens, and permission results are never cached as authoritative data.
4. All app write paths update a version or invalidate the appropriate entry; TTL is only a backstop.
5. KV outages fall back safely to Firestore without weakening authorization.
6. Real-time screens retain their current subscription behavior.
7. Tests cover active/inactive users, all roles, permission changes, hit/miss/expiry, writes, deletion, and KV failure.
8. Compare Firestore read metrics before and after a real deployment; report measured results only.

## Current status

The KV binding is configured and a static access inventory script is available as `npm run audit:firestore-access`. No application reads are routed through KV yet, and no cost reduction or production deployment is claimed.


## Call-site trace (2026-10-14)

The first candidate trace rules out a quick cache in front of the existing app:

- `marketPrices` is subscribed through the shared `handleCollection` / `onSnapshot` pipeline in `src/services/firestoreSync.ts`. Its create/update and delete functions write directly to Firestore in `persistMarketPriceToFirestore` and `deleteMarketPriceFromFirestore`. A KV response added only to the Worker would not replace that subscription or save its ongoing reads.
- `forecastSettings` is also subscribed through the same `onSnapshot` pipeline. Its write function `persistForecastSettingsToFirestore` writes directly to Firestore, and manager/admin permissions differ from the read permissions. A cache hit must not bypass the current role check, and changing this path safely would require a coordinated read/write design.
- The existing Worker authenticates Firebase tokens and checks the current staff profile, but it has no general Firestore collection-data route. Its current Firestore REST helper is used for attachment metadata and authorization, not a safe general-purpose collection API.
- `staffAnnouncements` has an active-staff read rule and admin-only create rule (with limited read-marker updates), but it is not wired into the central collection subscription list shown in `firestoreSync.ts`. It needs its own caller/read-path investigation before it can be considered.

**Decision:** Do not add a proxy for `marketPrices` or `forecastSettings` yet. Doing so would add complexity without removing the current live Firestore listeners, and could cause stale or permission-inappropriate data. The next implementation step is to identify a real one-shot, non-sensitive read path with low freshness requirements and route that exact call through the Worker, with authenticated access and write invalidation. Until then, this remains an audit/configuration change, not an active read cache.
