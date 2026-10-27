# Import-audit source-data migration — task report

**Report date:** 2026-10-20  
**Branch:** `Replit`  
**Reviewed implementation commit:** `2731f8c92e20dbf0ce908a48d27bb3e8b8e58ece`  
**Follow-up test-fixture commit:** `72ad42b68de1ec1e1a1fa2d4b78125d7c472c2c8`  
**Rules hardening commit:** `2c3177d10f5ac409b8601623700cf7982f21acee`  
**Rules regression-test commit:** `5f20a04b37cefede7eee9c862e46bc1109bcf891`  
**Status:** IMPLEMENTED BUT NOT FULLY VERIFIED

## Executive summary

The source-data separation migration, Firestore access gate, regression suite, and operator runbook are present. The latest available GitHub Actions run for the implementation commit failed. The migration-specific test and Firestore rules emulator test passed in that run, but an existing offline-sync test failed because its restricted-source collision fixture did not grant the persistence helper permission to read the restricted document. I committed a narrow test-fixture correction on `Replit`; that follow-up commit still needs CI verification. The same run's browser E2E job had two failures unrelated on their face to the migration test: the compliance supplier-quote list was not visible, and the offline-write test could not find the Edit Profile button. Those need diagnosis before declaring the branch green.

No production migration, production dry run, production data change, or Firestore rules deployment was performed by this review. Do not deploy the new rules or run production apply until the release conditions below are satisfied and the owner explicitly approves.

## Scope reviewed

- `scripts/importAuditSourceMigration.ts`
- `scripts/repair-import-audit-source-data.ts`
- `scripts/import-audit-source-migration.test.ts`
- `src/services/importAuditPersistence.ts`
- `src/services/firestoreSync.ts`
- `firestore.rules`
- `docs/import-audit-source-migration.md`
- `.github/workflows/shine-checks.yml`
- `scripts/offline-sync.test.ts`
- `AGENTS.md` and the latest `AGENT_BOARD.md) entries

## Findings

### Migration behaviour

The migration helper defaults to dry-run mode. It enumerates audit document IDs, checks legacy embedded `sourceData`, validates metadata and JSON-compatible source payloads, checks for a matching destination, and reports counts without printing document IDs or payload contents. Apply mode performs a fresh preflight, refuses to proceed when conflicts, malformed records, or failures exist, and processes each audit/source pair in a Firestore transaction. A destination is created only if absent; a mismatching destination is not overwritten. The audit update removes only the embedded `sourceData` field and adds the restricted-collection marker, preserving other metadata.

The helper performs a full post-apply verification and writes the server-side completion marker only when the scan is clean. A per-record transaction is atomic, but the whole collection migration is not one transaction. The runbook correctly says interrupted work must be resumed after another dry run and review; it does not claim rollback support.

### Access control

The rules keep `importAuditMigrationStatus` inaccessible to client reads/writes and use the marker to gate ordinary staff collection queries. Restricted source data has separate manager/admin read access. Rules and app-side persistence both reject embedded source payloads in ordinary audit metadata. These controls must be tested together with the intended migration state: a missing marker deliberately blocks staff collection queries.

### Migration test coverage

The migration-specific test suite includes dry-run zero-write checks, already-clean records, matching and conflicting destinations, write failures, retry/interruption, concurrent changes, malformed records, list failures, completion-marker failures, explicit project confirmation, idempotency, and redaction of sensitive diagnostic content.

### Additional rules integrity finding and fix

A second code review found that `hasMatchingRestrictedImportSource` checked the destination's ID and metadata but did not require a non-empty `sourceData` map. In principle, a client could pair an audit marked `sourceDataStoredInRestrictedCollection: true` with a matching but empty restricted document. That would make the marker claim stronger than the rules had verified and could hide a missing source payload from the normal retry path.

I hardened the rules in commit `2c3177d10f5ac409b8601623700cf7982f21acee` to require the post-write restricted document to contain a `sourceData` map with at least one key before the audit marker can be created. Commit `5f20a04b37cefede7eee9c862e46bc1109bcf891` adds emulator regression cases for both a missing source payload and an empty map, while retaining the existing valid atomic transaction test. These rule/test changes are **not verified until the latest CI run passes**; they must not be deployed on the basis of code review alone.

### Test-fixture issue found and follow-up

GitHub Actions run [39412020322](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39412020322) ran against implementation commit `2731f8c92e20dbf0ce908a48d27bb3e8b8e58ece`. The `checks` job failed at `scripts/offline-sync.test.ts:240`: the test expected a conflicting restricted source to be detected by `persistImportAuditToFirestore`, but invoked it with default permissions. The helper intentionally reads an existing restricted source only when `canReadImportSourceData` is true. With the default false value, the in-memory test backend could not model the restricted-source conflict read, so the expected rejection did not occur. The Firestore rules test and `test:import-audit-migration` had passed earlier in that same job.

I made a narrow fixture correction in commit `72ad42b68de1ec1e1a1fa2d4b78125d7c472c2c8`: the collision case now explicitly supplies the read/write capability flags, so the test actually exercises the manager/admin conflict-detection path. This change is a test-only adjustment; it does not widen application or Firestore permissions. CI for this follow-up must confirm the fix rather than assuming it passed.

### Browser E2E failures still open

The E2E job in run [39412020322](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39412020322) ended with **6 passed, 2 failed**:
- `e2e/compliance-calendar.spec.ts:36`: “staff can collect a supplier quote when an item price is missing”; the expected task/list locator was not visible.
- `e2e/offline-write-durability.spec.ts:55`: “an edit made while offline is queued, not lost to the local-write echo”; the expected Edit Profile button was not found.

The logs also show repeated denied `importAudits` listener queries in the browser run because the new rules intentionally gate staff list queries until the completion marker exists. I have not established that these denials caused either E2E failure; they may be expected in tests that have not seeded the migration marker. Inspect the E2E setup and failure contexts, then decide whether to seed a synthetic completed marker in the relevant emulator setup or whether a real application regression exists. Do not weaken production rules just to make tests pass.

## Verification record

### Confirmed by GitHub Actions for `2731f8c92e20dbf0ce908a48d27bb3e8b8e58ece`

- Dependency installation: passed.
- TypeScript check (`npm run lint`): passed.
- UI effects/save feedback: passed.
- Firestore listener permissions: passed.
- Firestore rules emulator (`npm run test:rules`): passed.
- Quality, report-writing, early-warning, phase 2 import/AI, migration-specific tests, procurement, payroll and gratuity: passed.
- Offline test suite: **failed** at the collision assertion noted above.
- Later checks in that job (including build) were skipped because the job stops at the first failure.
- Browser E2E: **failed**, 6 passed / 2 failed as detailed above.

**Important:** the above results apply to `2731f8c92e20dbf0ce908a48d27bb3e8b8e58ece`, not the follow-up fixture commit. At report-writing time, the follow-up CI result had not yet been confirmed. No local test execution is claimed in this report.

## Production release gate

Keep production apply and rules deployment blocked until all of the following are documented:

1. Owner approval and confirmed intended Firebase project ID, independently checked against the approved deployment record.
2. Verified backup/export and required restore/integrity check.
3. A reviewed, read-only production dry run with zero conflicts, malformed records, and failures.
4. Explicit owner approval of the reviewed dry-run summary.
5. Approved apply, then a clean full verification scan and confirmed completion marker.
6. Role-specific verification: Staff and View Only can read permitted audit metadata but cannot read restricted source records; Managers/Administrators retain intended access; staff list queries work only after the completion marker.
7. Re-run dry run after apply and retain the redacted summaries with the change record.
8. Successful CI for the current branch head, including migration, Firestore rules and E2E checks; investigate and resolve the two E2E failures.
9. No deployment or production data change is inferred from passing emulator tests.

## Next actions (historical migration review; verification superseded 2026-10-20)

The migration-specific offline/E2E failures described in the original handoff were resolved by the completed migration verification runs recorded below. The production migration/release gate remains closed until the owner approves the confirmed Firebase project, backup/restore evidence, read-only dry run, apply, and post-apply role checks.

## Instructions for ChatGPT review

- Start with this report and `AGENT_BOARD.md`.
- Recheck the exact `Replit` head and its GitHub Actions run before trusting any status.
- Review the migration helper, CLI, Firestore rules and tests together; the in-memory migration tests do not replace emulator permission tests.
- Confirm whether the two E2E failures are caused by missing emulator completion-marker setup or actual app regressions.
- Do not run production apply or deploy rules without explicit owner approval.

## Review addendum — 2026-10-20

The review continued after the initial report. A further Firestore rules integrity gap was identified and addressed in the two commits listed above: the audit completion marker now requires a non-empty restricted source payload. The current branch head must be checked for CI results; previous run results do not validate these later commits. Production remains untouched and the release gate remains closed.

## Review addendum — follow-up test fixes (2026-10-20)

The first test-fixture adjustment exposed one more mismatch: `persistImportAuditToFirestore` intentionally wraps internal errors in the privacy-safe public message `Import audit/source persistence failed. Source data was not logged.`. The test was corrected in commit `4371c2aca3d9d8e5dae16a7b2f1378908a746c1c` to expect that public error and additionally assert that the previously stored restricted payload remains unchanged. It does not expect the internal collision detail to leak through the service boundary.

The E2E global setup was also updated in commit `2da39cd9d0e27d632144250c681366ee14dc3458` to seed the server-only migration-completion marker in the isolated emulator after seeding synthetic fixtures. This represents the post-migration state expected by ordinary staff screens and should stop unrelated test runs from repeatedly logging expected denied `importAudits` list queries. It does not affect production. This setup change is a hypothesis-driven test-environment correction; only the E2E run result can show whether it resolves the two failures.

The latest observed workflow run for commit `4371c2aca3d9d8e5dae16a7b2f1378908a746c1c` was queued/pending at the time of review, while a preceding E2E run was still in progress. The rules hardening, new rules tests, collision assertion correction, and E2E marker setup therefore remain **unverified by a completed run**. Recheck the exact branch head and its Actions run before considering this work verified.


## Verification addendum — latest Replit head (2026-10-20)

The previously pending workflow has now completed successfully for branch-head commit `1ca4f7ff122e4cdb9fcb52f5d20efc02b830d6e5`.

- [GitHub Actions run 39413308201](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39413308201): overall **success**.
- `checks` job: **success**. TypeScript/lint, Firestore listener permissions, Firestore rules emulator, import-audit migration safeguards, offline sync queue, offline performance budget, storage failure handling, inventory, asset export/verification, routing, Firestore access audit and production build all completed successfully.
- `e2e` job: **success**. The Playwright offline end-to-end suite completed successfully after the synthetic migration completion marker was seeded in emulator setup.
- The prior offline collision assertion failure and the two E2E failures are resolved at this tested branch head; this conclusion is based on the completed run, not on cancelled earlier runs.
- The rules regression cases for absent and empty restricted source payloads are included in the successful emulator test step. This confirms the rule/test change against the emulator, not against a deployed production ruleset.

### What this does and does not establish

The migration, security, offline, Phase 5, payroll and backup-restore CI checks passed at the exact code SHA `b28860d2f46e35e7c4b9d2da0cdcdb3afdae13f4`, based on GitHub Actions run [39454754490](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39454754490). No local test execution is claimed. The suite still does not perform a real Android handset/weak-signal manual test, production Firebase role verification, production dry run, production apply, backup/restore rehearsal, or rules deployment. `test:deployment-smoke` remains outside ordinary CI because it defaults to live Firebase Hosting and Cloudflare Worker endpoints; only run it after selecting an approved staging target.

**Production release gate remains closed.** No production data or rules were changed. The required owner approval, confirmed project, verified backup, reviewed zero-issue dry run, approved apply, full verification and production role-specific checks remain outstanding.


## Follow-up permission and sensitive-data review — 2026-10-20

### Findings corrected on `Replit`

- **High — general database backup exposure:** the Header exposed Cloud & Data to all roles, and the modal exposed a full JSON database download and bulk cloud-sync action. The control is now administrator-only in both the Header and modal, with handler-level guards. General backups exclude safeguarding attachment metadata.
- **High — staff payroll scope:** the payroll dashboard previously calculated summaries from the full local employee and payroll collections even though staff are only allowed to read their own payroll documents. A viewer-scoping helper now limits staff to records whose `employeeId` matches their authenticated UID and to a self-only employee profile; when the manager-only employee roster is unavailable, the profile can be derived from that staff member's own payroll record. Manager/admin data remains unfiltered.
- **High — health-record display paths:** the dashboard's scheduled follow-ups/recent-activity list, Search Modal and Reports export centre had paths that could render medical information without consistently checking health-record permissions. They now gate the relevant lists and exports on `canViewHealthRecords`; case-review search is similarly gated on `canViewCaseReviews`.
- **High — Phase 5 case intelligence:** summaries and suggestions now use permission-filtered data. The filtering removes health follow-ups for users without access, strips the health field from case reviews when the reviewer lacks health access, and excludes medical/prescription and legacy safeguarding attachments from general intelligence summaries.
- Added synthetic regression assertions for the Phase 5 data filter and payroll visibility helper, a backup safeguard test, and a Playwright test asserting that ordinary staff cannot see the database-backup control or medical CSV exports.

### Verification and remaining limits

- GitHub Actions run [39454754490](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39454754490) completed successfully at code SHA `b28860d2f46e35e7c4b9d2da0cdcdb3afdae13f4`. Both `checks` and `e2e` jobs passed, including the expanded Phase 5, payroll and backup checks plus the new restricted-export E2E scenario.
- This is a targeted code-level permission review, not a claim of exhaustive security certification. The production Firebase role configuration, real-device shared-account/cache behaviour and Android weak-signal use still require controlled verification.
- No production migration, production data write or Firestore rules deployment was performed. The import-audit production release gate remains closed pending owner approval and the documented backup, dry-run, apply and post-apply checks.


## 2026-10-20 — Final CI verification for sensitive-data permission review

- Current verified code head at the time of this report: `f0566bc4a8bbc5a28fd6f294d5f0e2242987feba` on the `Replit` branch.
- GitHub Actions run [39455566650](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39455566650) completed successfully on that exact SHA. Both `checks` and `e2e` jobs passed.
- The checks job passed TypeScript, UI feedback, Firestore listener and emulator rules tests, Phase 5 operational/case intelligence and rules tests, import-audit migration safeguards, payroll/gratuity, offline queue/performance/storage, inventory, asset, routing, Firestore access audit, and the production build. The Playwright offline E2E job passed, including the restricted backup/medical-export browser scenario present on this branch.
- Scope covered by the permission review: administrator-only database backup/bulk-sync controls and handler guards; safeguarding attachment metadata exclusion from general backup/intelligence paths; health/case-review permission filters in dashboard, search, reports and Phase 5 summaries; staff-scoped payroll records and modal state cleanup after payroll-processing permission is revoked.
- This confirms automated checks on the branch, not exhaustive security certification. No local device test, production rules deployment, production data migration, or production deployment-smoke request was performed. The deployment smoke script remains intentionally excluded from CI because its defaults target live services.
- Remaining owner-controlled release work: review and approve any production migration separately; confirm backup/restore and dry-run evidence; and conduct controlled Android/shared-device and weak-signal checks before relying on those behaviours in the field.


## 2026-10-21 — Case-action list-query authorization hardening

### Confirmed defect

The Firestore rules syntax correction from 2026-10-20 compiled, but the emulator exposed a separate query-level access defect. In diagnostic run [39539524203](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39539524203), a server-backed query authenticated as the synthetic View Only user and constrained only by `assignedStaffId == viewer` returned all three seeded IDs: `action-1`, `action-health`, and `action-safeguarding`. Direct reads of the restricted health and safeguarding documents were denied in the same test. This was a real emulator-observed list-query exposure, not a cache-only false alarm. The test fixtures contained synthetic data only.

### Changes committed on `Replit`

- Commit `b465462e53f2818a8bc9dd346819a4cf3c3e6020` splits `caseActions` single-document `get` from collection `list` authorization. Single-document reads retain the legacy missing-`sourceType` default. List rules use direct `resource.data.sourceType` field access so Firestore can enforce that list queries exclude health-follow-up and safeguarding actions unless the requester has the corresponding permission.
- The existing listener query pattern (`sourceType not-in` for users missing both permissions, or `sourceType !=` for users missing one) remains unchanged. No UI, authentication, offline-sync, or production configuration was altered in this fix.
- `caseActionAuditLogs` mixes action types and its query cannot constrain the referenced action's `sourceType`. Listing is therefore limited to managers/administrators who also have safeguarding-view permission; direct `get` remains scoped to the referenced action and the requester's permission/assignment.
- The rules tests now use `getDocsFromServer`, assert that the allowed normal-action query returns the seeded manual action, and assert that an unfiltered staff list query fails. Synthetic audit-log fixtures cover permitted normal-action reads, denied health/safeguarding reads, and restricted list access. The ordinary action fixtures now include the required `sourceType: 'manual'`, avoiding a vacuous `not-in` test (Firestore excludes documents missing that field).

### Verification

- [GitHub Actions run 39539762174](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39539762174) completed **successfully** on code SHA `b465462e53f2818a8bc9dd346819a4cf3c3e6020`. Both `checks` and Playwright `e2e` jobs passed, including the Firestore rules emulator tests and production build.
- The diagnostic run above intentionally failed after printing the restricted synthetic document IDs; that failure established the pre-fix behaviour. The succeeding run is the evidence for the fix.
- This validates the current rules against the emulator. It does **not** mean rules were deployed to production or production records were inspected or changed.

### Additional high-priority follow-up found during the broader review

The local app database is stored under a shared browser key (`shine_relief_trust_prod_v1`) and is initially loaded before the authenticated user's Firestore snapshot replaces it. The current `filterRestrictedCachedData` helper removes health/safeguarding records, but does not scope cached case actions by `assignedStaffId`. Some client paths (including case-action view/search/report exports and girl-profile action history) rely on the listener having already replaced stale data. A manager-to-staff account switch or long offline session therefore deserves a dedicated shared-device regression test and a non-destructive, offline-safe view/cache isolation fix. Manager-only employee/planning records and restricted import-source payloads also warrant review in that same work. This is a finding, **not a change claimed complete in this commit**; I have not cleared those caches because a destructive filter could remove useful manager cache during offline account switching.

A related data-availability risk remains: Firestore `!=`/`not-in` queries exclude legacy case-action documents that lack `sourceType`. The application model now requires this field for new actions, but any production backfill must be assessed and approved separately. No production dry run, data mutation, rules deployment, or live-service test was performed.

### Candid reflection and next actions

The initial cache explanation for the failed query was incorrect; forcing server reads still returned restricted documents. The useful correction was to reproduce the actual returned IDs, then make the list rule explicitly query-compatible and add tests for the mixed audit-log collection. Next, address role-scoped stale-cache display/export paths with synthetic manager-to-staff and offline/reconnect tests, and plan a separately approved legacy `sourceType` backfill if needed.

## 2026-10-21 — Non-destructive cached case-action visibility scoping

### Goal and findings

Follow-up to the 2026-10-21 Firestore list-query fix: the browser stores the whole local database under the shared key `shine_relief_trust_prod_v1`, and the initial React state is created from that cache before the active account's Firestore listeners have replaced it. The earlier review correctly avoided clearing this shared cache because doing so could discard offline work or another authorized user's useful cached data. However, client views must not treat the cache as if it were already scoped to the newly authenticated account.

### Changes on `Replit`

- Added `filterCaseActionsForStaff` in `src/services/healthRecordAccess.ts`. It scopes non-manager/admin case actions to the active UID, hides health and safeguarding actions when the corresponding permission is absent, and returns a filtered view without mutating the input array or shared offline cache.
- Applied the helper to `CaseActionsView.tsx`, `SearchModal.tsx`, `Dashboard.tsx`, and `Reports.tsx`. The comprehensive report modal now receives the filtered action list, so cached tasks assigned to a different staff member do not enter its report preview/export path through this prop.
- Updated `AppViewSwitch.tsx` and `App.tsx` to scope girl-profile action history, the AI assistant's case-action context, and operational intelligence analysis to the current user's action visibility. The app passes only the UID and permissions needed for that view filter.
- Extended `scripts/health-access.test.ts` with synthetic cross-account fixtures. Assertions cover a staff member seeing only their assigned ordinary action, a manager seeing team actions while still respecting safeguarding permission, a missing UID failing closed for non-managers, and the source array remaining unchanged.

### Verification status

- Focused automated regression coverage was added to the existing `test:health-access` script. I did not run the test locally in this environment; GitHub Actions on the final commit is the required verification source. Do not treat a pending run as a pass.
- No production Firestore rules were deployed and no production records were read or changed. No Android handset or weak-signal test was performed.

### Remaining risks — deliberately not claimed fixed

- This is a **non-destructive UI/context filter for case actions**, not complete browser-cache isolation. The shared localStorage key still contains a merged cache, including potentially manager-only employee/planning records and restricted import-source payloads. Their complete account-switch/offline visibility lifecycle still needs a separate audit and regression-tested solution.
- The helper does not replace Firestore authorization; rules remain the authoritative boundary. Every new view, export, AI input, or background analysis that consumes cached records must use the same scope or consume already-authorized server data.
- The existing `filterRestrictedCachedData` path still persists a reduced cache for health/safeguarding restrictions. This change did not redesign that persistence path because doing so safely requires accounting for the per-record offline queue and server snapshot baseline.

### Candid reflection and next action

The safer immediate move was to filter the user-facing action projections rather than deleting records from a shared offline cache. The test now checks both the visible result and that the original cache array survives unchanged. This reduces the known case-action exposure but is not a substitute for user-scoped local persistence; the next priority is a full inventory of reads/writes of the shared cache, especially HR/planning and restricted import data, with manager-to-staff and offline/reconnect tests before changing cache storage semantics.


## 2026-10-21 — Central non-destructive permission-scoped UI projection

### Why this additional change was necessary

Reviewing the previous cache-filtering effect against `src/services/offlineSync.ts:recordOfflineChanges` and `computeChangeEntries` exposed a more serious interaction: the effect wrote a reduced database to localStorage and replaced React's main database state. Since the queue computes removals against the last confirmed baseline, removing permission-hidden rows from that state could be interpreted as record deletions and queued for sync. That is incompatible with SHINE's offline-data preservation requirement.

### Changes on `Replit`

- Replaced the destructive filter-and-save effect in `src/App.tsx` with a memoized `viewDb` projection. The main `db` state remains the full local/sync state used by the offline queue; only UI-facing views and global modals receive the filtered projection. The projection is never written back to localStorage.
- Expanded `filterRestrictedCachedData` in `src/services/healthRecordAccess.ts` to hide manager/admin-only `employees`, `whatIfScenarios` and `projectProjections` from non-management UI sessions; hide `restrictedImportSources` unless import-source access is granted; and restrict non-management `payrollRecords` to the authenticated UID's `employeeId`.
- The same projection filters case actions by active staff UID and health/safeguarding permissions. Dedicated case-action display can still respect explicit safeguarding permission, while general search, reports/exports, AI context and operational intelligence continue to exclude safeguarding-linked actions entirely.
- Extended `scripts/health-access.test.ts` with synthetic HR, planning, restricted import and payroll records. It checks staff visibility, manager visibility, own-payroll-only filtering, and that projecting a staff view does not mutate the original cache used by a later authorized manager session.

### Verification status

- Regression assertions are in the existing `test:health-access` suite. I have not run the suite locally in this environment. GitHub Actions for the final branch head is the verification source; the result must be checked before this is called verified.
- No production data, rules, or deployment settings were changed. No real Android or weak/no-signal field test was performed.

### Remaining limits

- The UI projection prevents these records from being handed to ordinary view components, but it is **not full per-account local-storage isolation**: the shared raw cache still contains previously cached data at rest, and the app still uses the same localStorage key across accounts. A future storage partitioning design must preserve the per-record queue, conflict state, confirmed snapshot baseline, and pending offline edits.
- This is client-side display/context scoping, not an authorization boundary. Firestore rules and authenticated server checks remain authoritative. Audit any newly added consumer of raw `db` before using it in UI, search, export, notifications or AI.
- No production migration/backfill for legacy case actions missing `sourceType` was attempted.

### Candid reflection and next action

The key improvement is keeping permission-filtered display data separate from the full database used to calculate offline changes. That avoids turning a user's lack of permission into an apparent deletion. The remaining difficult part is the shared cache itself: the next phase should map all raw-cache consumers and then design account-scoped persistence without silently discarding another authorized user's offline work. Do not deploy based on a green UI test alone.


### 2026-10-21 follow-up — projection coverage and cache-preservation assertions

- The final view projection is now also used for operational-intelligence calculations, with safeguarding-linked actions excluded from that general context. This prevents suggestion counts/content from being derived from cross-staff cached actions or safeguarding tasks.
- The synthetic access test now asserts that the original cached health rows, case actions, payroll rows, employee records and restricted import-source payload remain unchanged after a filtered view is produced. Manager projection assertions confirm those cached rows remain available to a later authorized session in memory.
- The final code changes are on `Replit`; no local execution is claimed. Check the GitHub Actions run for the exact final branch SHA before treating the change as verified. The shared localStorage key remains a documented residual risk, and the client projection is not a substitute for server/rules authorization.


### 2026-10-21 final review note — report CSV and legacy action records

- A final consumer audit found that the Case Management Reports table and its standalone “Outstanding actions CSV” still referenced `db.caseActions` directly, and the management report panel received the unfiltered database. These paths now use `visibleCaseActions` / `reportDb`, so staff assignment scoping and the rule excluding safeguarding-linked actions apply to the table, CSV, comprehensive report and management report inputs.
- Non-manager case-action projections now fail closed for legacy records with a missing `sourceType`. Such records are already omitted by the Firestore `!=`/`not-in` list-query pattern; this prevents a stale manager cache from reintroducing untyped actions into a staff view. Only managers with both health and safeguarding permissions can inspect cached legacy records; managers lacking either sensitive-record permission also fail closed on untyped actions. A production backfill remains a separately approved task.
- Final verification remains pending until the CI run for the latest exact `Replit` SHA completes. Do not interpret cancelled intermediate runs as failures of the final code or as passes.


## 2026-10-21 — Phase 5 intelligence safeguarding boundary

### Additional consumer gap found

A final scan of the operational-intelligence path found that `Phase5OperationsView` uses `filterCaseIntelligenceData` before producing case summaries, suggestions and quality issues, but that helper previously left `caseActions` and medical historical records untouched. The app-level pending-count path was already scoped, but the Phase 5 screen could still derive a suggestion/quality issue from a cached safeguarding-linked action when the current account had safeguarding permission. This conflicted with the rule that safeguarding-linked details stay out of general intelligence and AI-style summaries.

### Changes

- `filterCaseIntelligenceData` now excludes safeguarding-linked actions for every user, excludes health-follow-up actions and medical history when health access is absent, and keeps case-review health fields permission-scoped.
- `buildIntelligentCaseSummary` excludes safeguarding-linked actions even if called with a raw database.
- `detectIntelligenceSuggestions` and `scanDataQuality` defensively skip safeguarding-linked actions even if a future caller forgets to pass a filtered projection.
- `scripts/health-access.test.ts` now checks the Phase 5 projection for health-permission behavior and asserts that direct suggestion generation and quality scans do not emit a synthetic safeguarding action title from raw cached data.

### Verification and remaining risk

- The new regression cases are part of the workflow's `test:health-access` step; exact-head CI still must finish successfully before this change is called verified. Intermediate runs cancelled by branch concurrency are not verification.
- No production data, Firestore rules or deployment configuration was changed. Shared localStorage remains a residual account-isolation risk; UI filtering does not encrypt or partition cached records at rest.

### Candid reflection

Filtering the app's main view projection was not enough on its own: a secondary service could be called directly with a broader database. The defense-in-depth filter and direct service tests make the policy harder to bypass accidentally in future Phase 5 changes.


### 2026-10-21 final defense-in-depth note

The shared intelligence service now also fails closed on **untyped legacy case actions**, not only explicitly tagged safeguarding actions. This applies to the filtered Phase 5 projection, intelligent case summaries, suggestion generation and data-quality scans. The regression fixture contains synthetic safeguarding and untyped actions and asserts that neither title appears in general intelligence output. This does not backfill or alter production records; any legacy data repair remains a separately approved operation.


## 2026-10-21 — Newly identified high-priority follow-up: offline queue account ownership

### Finding

The cache audit continued into `src/services/offlineSyncDb.ts`, `src/services/offlineSync.ts` and `OfflineChangeEntry` in `src/types.ts`. The per-record queue, conflict list and last-synced baseline currently use global browser keys (`shine_relief_trust_offline_queue_v2`, `shine_relief_trust_sync_conflicts_v1`, `shine_relief_trust_last_synced_v1`). An `OfflineChangeEntry` records collection/record/operation/data/baseline/hash/queued time, but **does not store the UID that queued it**. `recordOfflineChanges` compares against one global baseline, and `flushPendingOfflineSnapshots` flushes the entire queue using whichever authenticated actor is current when the flush happens.

### Risk

On a shared field device, a manager can make offline edits, then a staff member can sign in before the queue flushes. The staff session may attempt the manager's queued edits under the staff actor, causing avoidable authorization failures/conflicts and potentially attributing a conflict to the wrong user. The conflict list and baseline are also global. This is a separate, high-priority account-isolation/data-integrity risk; it was discovered during audit and **has not been changed** in this task.

### Safe next-step design (not implemented)

1. Add explicit owner UID to new queue entries and key queue/baseline/conflicts by authenticated UID.
2. Flush and resolve only entries owned by the current UID; preserve manager entries when staff logs in, and vice versa.
3. Design a non-destructive migration/quarantine for legacy entries with no owner UID. Do not guess the owner from the current login, silently discard them, or replay them as another user.
4. Add regression tests for manager-offline-edit → staff-login → reconnect, staff-offline-edit → manager-login, conflict attribution, browser reload, and weak/no-signal recovery.
5. Only after queue/baseline/conflict migration is proven should per-account local database persistence be designed; keep the current non-destructive UI projection in place meanwhile.

### Status

No queue entries, baselines, conflicts or production records were modified. This issue is documented as a follow-up because an incomplete migration could lose offline edits or replay them under the wrong identity.


### 2026-10-21 — CI result after Phase 5 regression fixture correction

- The earlier run failed in `scripts/phase5-case-intelligence.test.ts` because two synthetic ordinary actions omitted `sourceType`, while the new production guard intentionally excludes untyped legacy actions from general intelligence. The fixture now labels those synthetic ordinary actions as `sourceType: 'manual'`; the fail-closed behavior remains intact.
- GitHub Actions run **39547948977** passed both `checks` and `e2e` on code SHA `976090063f5b4746aba52e27a71107d57cfbe94d`. This confirms the code and regression fix at that SHA; it does not verify subsequent commits until their own runs finish.
- The offline queue/baseline/conflict account-ownership issue remains open and unchanged. The safe follow-up still requires owner-scoped queue entries, per-user baselines and conflict lists, a non-destructive quarantine for unowned legacy entries, and account-switch/reconnect tests. No legacy entries were migrated or replayed from this review.


## 2026-10-21 — Prevent offline queue replay without an authenticated actor

### Why this change was made

The online/reconnect event can run during sign-out or an account transition. Before this change, `flushPendingOfflineSnapshots` accepted a missing actor and still attempted to flush the device-wide queue. That is unsafe for a queue that is not yet partitioned by owner UID.

### Changes

- `src/services/offlineSync.ts`: fail closed before migration or cloud writes when no actor UID is supplied, or when the panel's placeholder UID `unknown` is supplied.
- `scripts/offline-sync.test.ts`: added a regression assertion that a flush without an authenticated actor reports no flush and preserves queued edits. Existing tests that intentionally exercise authenticated queue flushing now provide a synthetic actor.
- No new dependencies, production migration, Firestore rule changes, deploy, or production-data operations.

### Verification

GitHub Actions run **39551971808** completed successfully on exact code SHA `665bd8d7e1c00c1bd52a1782a8ac6ba7f3a572a3`:

- `checks`: passed, including TypeScript, offline queue tests, security-rule emulator tests and production build.
- `e2e`: passed; all 9 Playwright E2E tests passed, including offline app-shell, conflict handling, offline write durability, and sensitive-data access.
- Run: https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39551971808

### Remaining risk — not solved by this guard

The offline queue, sync baseline and conflict list still use global browser keys. A signed-in user B could still attempt to flush entries queued during user A's session because queue entries do not yet carry owner UIDs. This commit prevents **unauthenticated** replay only; it does not claim account isolation is complete. Next work must implement owner-scoped queue/baseline/conflict state, preserve/quarantine legacy unowned entries without guessing ownership, and test manager/staff account switches and reconnect behavior before any local DB migration.

### Candid reflection

This guard closes one clear unsafe path without pretending to solve the broader issue. The full ownership migration is higher risk because a mistaken rewrite could silently lose legitimate offline edits, so it needs a cohesive implementation and targeted tests rather than a queue-only change.


# Offline account isolation — readiness checkpoint and design

**Report date:** 2026-10-21  
**Branch:** `Replit`  
**Reviewed head:** `bf8540d164df53b66c95ec3bd58bf61908b99295`  
**Status:** Existing automated checks green; account isolation still incomplete; design recorded before implementation.

## Current verified baseline

The branch head was re-read from GitHub. Workflow run [39552221577](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/39552221577) completed successfully on the exact head SHA `bf8540d164df53b66c95ec3bd58bf61908b99295`. Both `checks` and `e2e` jobs passed. The checks job completed TypeScript, health-access, Firestore listener/rules emulator, quality, import/AI, Phase 5, migration safeguards, procurement, payroll, offline queue/performance/keying, storage failures, app-shell, routing, access audit and production build steps. The E2E job's offline end-to-end tests also passed.

## Confirmed remaining risk

This green run does not prove account isolation. Code review reconfirmed that the local database, sync baseline, queue and conflict list use shared browser keys; queued entries have no owner UID; and conflict resolution does not currently enforce an actor/owner match. The current authenticated-actor flush guard blocks unauthenticated replay but does not prevent a different signed-in account from acting on a shared queue. The app also initializes its in-memory database before auth has resolved. Do not use shared-device account switching with real sensitive records as a release acceptance test yet.

## Design and next work

Added `docs/offline-sync-account-isolation-design.md` with the staged design, safety invariants, legacy quarantine trade-off, implementation stages and acceptance tests. Implementation is to proceed in small stages: UID-scoped local workspace; UID-scoped queue/baseline/conflicts with owner checks; safe handling of unowned legacy state; then full regression/E2E verification.

Legacy unowned bytes must be preserved, not automatically attributed, rendered, replayed or deleted. Normal online snapshots may repopulate the signed-in user's scoped workspace after authorization and durable local persistence. No new dependencies are planned.

## Boundaries and checks

- No code, Firestore rules, Storage rules or production data changed in this checkpoint.
- No production deployment, migration, live-service smoke test, or Android/weak-signal device test was performed.
- Automated checks are green on the reviewed head; the account-isolation feature is not yet implemented.
- The app can be explored in a controlled test environment with synthetic data, but it is not yet safe to certify shared-device account switching for real sensitive records.


# 2026-10-26 — Account-scoped local workspace implementation

## Goal and code changes

Started the previously documented account-isolation fix on branch `Replit`. The intent is to prevent one signed-in account on a shared field device from reading another account's cached database or replaying its queued edits.

- Added `src/services/accountWorkspace.ts` to track the active authenticated UID and derive UID-scoped localStorage and IndexedDB names.
- `src/utils/storage.ts` now reads and writes the local database using a UID-scoped key. It no longer deletes or adopts the old unscoped legacy cache. Without an authenticated workspace, browser writes fail closed and reads return a fresh initial database.
- `src/services/offlineSyncDb.ts` now uses per-UID IndexedDB databases and localStorage fallback keys for the per-record queue and conflicts.
- `src/services/offlineSync.ts` now scopes baselines, pending snapshot state and reset-recovery locks by UID, stamps new queue entries with `ownerUid`, rejects a flush whose actor UID differs from the active workspace, and refuses to flush entries with missing/mismatched ownership. Conflict resolution also requires the active UID to match the actor.
- `src/contexts/AuthContext.tsx` switches the active workspace before publishing the new authenticated user. `src/App.tsx` reloads the scoped database and guards the rendered view, cached projection, Firestore listener callback and offline diffing against stale in-memory state during account switches.
- Updated the offline queue and sync regression tests with synthetic UIDs and account-switch assertions.

## Legacy-data handling

The former unscoped cache and legacy localStorage queue/snapshot/conflict keys are not assigned to the next account. The legacy bytes are preserved. Restore inspection now treats non-empty or unreadable unowned legacy queue/snapshot/conflict state as pending/unavailable, blocking destructive restore instead of pretending the state is empty. The old unscoped IndexedDB database is not migrated or replayed by the new code. A reviewed recovery workflow for unowned legacy edits remains a follow-up; do not manually test recovery using real beneficiary records.

## Verification status and limits

- The current implementation was committed directly to `Replit`; `main` was not changed. The latest workflow was still pending when this report was prepared; only the run matching the final SHA can verify the changes. Report any failing checks and fix them before calling this implementation verified.
- Added automated coverage for separate IndexedDB queues across synthetic UIDs, separate sync baselines, mismatched actor rejection, and preservation/quarantine of unowned legacy localStorage state. The exact-head CI result must be checked.
- No new dependencies were added. No Firestore/Storage rules were loosened. No production migration, live deployment, production data operation, live-service smoke test, or physical Android/weak/no-signal test was performed.
- **Not yet a release certification:** the account-scoped local cache/queue implementation is a substantial safety step, but the end-to-end workflow still needs exact-SHA CI success and manual Android testing. In particular, legacy unowned IndexedDB state requires a safe recovery process, and a shared-device account switch should not be declared fully field-verified until tested with synthetic data on the actual target device.

## Next steps

1. Wait for the workflow on the final SHA; inspect and fix failures rather than relying on earlier cancelled runs.
2. Finish review of all consumers of raw cached `db`, especially asynchronous callbacks and non-UI operations, to ensure none can use stale data during account transitions.
3. Verify restore/reset semantics and legacy quarantine tests.
4. Build and provide a controlled test version after CI passes; ask the owner to test using synthetic records first. Then perform Android/weak-signal acceptance checks.


## 2026-10-26 follow-up — async account-switch race review

A second review traced async operations across account changes. Queue persistence now pins the UID that started the operation instead of looking up a potentially different active UID after an await. Recording offline diffs and migrating scoped snapshots stop if the active account changes; a flush leaves its original queue intact if the account changes while Firestore is processing; reset recovery stops before subsequent writes when the account changes; and the UI avoids showing a stale account's cached queue count. The App also prevents a late Firestore listener callback from persisting a snapshot after the active UID changes.

The code head before this documentation-only update is `7c4430c2c6b5f966953f907d7ebad0582e447402`. GitHub Actions has been repeatedly cancelled by subsequent pushes during implementation; the workflow on the final report-updated head must complete before this is called verified. Do not treat the older cancelled runs as passes. No local test execution is claimed from this environment.


## 2026-10-26 final implementation checkpoint before CI

Final code hardening after the previous report addendum:
- Queue reads/writes pin the UID that initiated the operation. Async queue persistence cannot redirect an old user's entries into a new user's IndexedDB/localStorage store if auth changes during an await.
- Snapshot migration checks that the original UID is still active before clearing its scoped snapshot. Reset recovery pauses if the active UID changes between steps.
- Flush leaves the original queue intact if account identity changes during Firestore processing, rather than writing queue state under the new account.
- The UI resets selected records, in-progress forms, import state, modal/search state and navigation on UID change. The app guards the cache projection, listener callback and offline diff effect while the database owner does not match the active user.
- Latest code SHA before this documentation-only update: `c9ac80368bf57b4664918819125d406bf7080629`.

The code changes are complete enough for automated verification, but are **not yet declared verified**. The workflow on the final documentation-updated SHA must pass TypeScript, offline/storage regressions, the remaining check suite, production build and E2E. No local execution is claimed. Use only synthetic records until CI and real-device acceptance are complete. The unowned legacy IndexedDB queue remains preserved and unreplayed; its explicit recovery workflow remains open.


## 2026-10-26 additional hardening — conflict owner and legacy IndexedDB

The prior E2E run exposed a test harness assumption: the helper only looked for Firebase Auth's user in localStorage, while the SDK may persist auth state in IndexedDB. Updated the synthetic E2E helper to check both supported browser persistence locations. This fixes the test's UID discovery path without changing application authentication.

New conflicts now carry `ownerUid`. The resolver refuses a conflict with missing/mismatched owner; the conflict panel disables unowned resolutions and explains that the state is preserved for recovery. The conflict-resolved audit is now attempted only after local resolution returns success, avoiding a false audit event for a denied resolution. Unit tests assert the wrong synthetic UID cannot resolve the original account's conflict.

A second legacy-state gap was addressed: the old unscoped IndexedDB database (`shine_relief_trust_offline`) is now inspected before destructive restore. It is not opened when absent, and it is never migrated or replayed. Non-empty or unreadable legacy state blocks restore. The IndexedDB regression test creates a synthetic unowned legacy queue, verifies it is classified as pending, then deletes only that test fixture and verifies absence.

The current CI run must be checked on the final SHA. The last completed exact code run before these fixes had a passing checks job (including TypeScript and production build) but failed E2E because three tests could not discover the signed-in emulator UID; that failure is not counted as a pass. No local test execution, live-service smoke test, production migration/deployment or physical Android test is claimed.


## 2026-10-26 reset lifecycle guard

Review of the full destructive-reset path found an account-switch race: the cloud clear is asynchronous, so a new account could become active before the reset writes its local seed database. The reset flow now captures the initiating UID, checks it immediately after the cloud-clear await, and passes that UID through the queue/baseline cleanup so it cannot clear another account's workspace. The prior global recovery marker is cleared only after the explicit reset, empty queue and new scoped baseline all persist. Added a synthetic test that rejects cleanup if the active UID changes. No reset was run against production; exact-head CI is required.


## 2026-10-26 auth observer ordering

Hardened App startup for the possible ordering where the login action updates React's currentUser before Firebase's onAuthStateChanged callback has set the active workspace UID. The app now listens to shine_workspace_changed, reloads the database from the actual active UID, and records the actual workspace owner instead of assuming it equals currentUser.uid. Until they match, the render guard continues to hold. This avoids a seed/empty cache being mislabeled as an authenticated workspace or the first scoped Firestore snapshot being missed.


## 2026-10-26 attachment metadata account boundary

A broader privacy review found an in-memory coalescing map in attachmentService.ts keyed only by health-record permission. If account A's report attachment request was still pending when account B opened a report with the same permission, B could receive A's promise result. The request cache is now keyed by authenticated UID plus permission, and metadata loading checks the active UID before returning results. Exact-head CI and Android acceptance remain required.


Attachment follow-up: the same UID check now protects report-image loading, attachment metadata used by exports, and late girl/household attachment listener callbacks. These callbacks check the UID again after asynchronous URL preparation before invoking the UI callback. This is defense in depth only; the existing R2/Firestore authorization remains authoritative.


## 2026-10-26 strict queue ownership

A further review found that the queue persistence helper was unconditionally stamping the current UID onto all entries. That could convert a stale/mismatched entry into an apparently owned entry. Queue persistence now rejects any missing or mismatched owner instead of re-attributing it. Newly computed diffs and Keep mine conflict entries explicitly carry the active UID; if a pre-existing scoped queue contains an entry without a verified owner, automatic diff persistence pauses and raises a visible storage warning while preserving that queue. The lower-level IndexedDB/localStorage persistence function also validates ownership. Tests use explicit synthetic owner UIDs.


## 2026-10-26 legacy database-cache restore gate

The legacy quarantine review now includes the old whole-database localStorage key as well as legacy queues, conflicts, snapshots and IndexedDB. A valid old database cache can contain local edits that were never represented in the former queue, so its presence blocks destructive restore; malformed cache state returns unavailable. The old cache remains untouched and is never rendered or attributed to a new UID. Added a synthetic restore-inspection regression.


## 2026-10-26 baseline-safe snapshot migration

Updated the scoped legacy snapshot migration to meet the strict queue ownership rules. It now requires a confirmed baseline for the active UID, refuses to merge into a queue with missing/mismatched owners, stamps only the diff it derives from the UID-scoped snapshot with that known UID, and leaves the snapshot untouched if it cannot prove a safe diff. This avoids a missing baseline turning an entire database snapshot into queued writes. Synthetic tests cover both successful migration and the no-baseline preservation path.


## 2026-10-26 confirmed-baseline gate

A final sync-safety review found that recordOfflineChanges still promoted the current local database to a baseline when no confirmed server baseline existed. That could mark unconfirmed local state as synced and make future diffs unsafe. The fallback is removed: offline diffing now warns and preserves the queue until a confirmed baseline exists. The UI stays in a non-editing secure-workspace state while no baseline is available, with a clear instruction to connect once; offline use resumes after a durable baseline exists. saveIncomingCloudSnapshot now treats a baseline persistence failure as failure and emits the storage warning instead of marking the workspace ready. Tests assert that a local snapshot without a baseline is not queued or adopted as confirmed.


CI follow-up: the run on SHA 93598024dc61907f8797e5299952844cd3374fc8 passed E2E but failed the offline queue test because the new owner-mismatch assertion referenced the procurement fixture before initialization. The assertion has been moved after the fixture is created; this is a test-order correction, not an application behavior change. The next exact-head CI result is still required.


## 2026-10-26 Firestore cache isolation

A critical shared-device edge case was found: the Firestore SDK's in-memory cache is not partitioned by the app's Firebase UID. After account A signs out, a cached snapshot could be delivered to account B's listener; if it were copied into B's UID-scoped localStorage, B could see A's records when B already had a baseline. The App now ignores snapshots that are from cache or have pending writes, and saveIncomingCloudSnapshot rejects them defensively. Only a durable, server-confirmed snapshot can update the active local database and baseline. Offline use continues from the current UID's own local database; a new account without a confirmed baseline stays on the safe loading screen. Added synthetic regression coverage for unconfirmed snapshots not changing the cache or baseline.


Snapshot confirmation is now fail-closed for missing metadata too. Only explicit Firestore metadata with fromCache=false and hasPendingWrites=false can be accepted as a confirmed baseline; absent/incomplete metadata no longer defaults to trusted. The regression test reflects this stricter rule.


## 2026-10-26 conflict-resolution durability follow-up

Review of the account-isolation changes found a data-recovery defect in `src/services/offlineSyncDb.ts`: `writeConflicts` caught and suppressed storage errors, while `resolveSyncConflict` removed the conflict before persisting the chosen queue state. A quota/storage failure could therefore produce false success and lose the visible recovery record.

The fix makes conflict persistence fail loudly, changes resolution ordering so the selected queue state is persisted first, and only then removes the conflict. If conflict-list persistence fails, the conflict remains available for a retry; for Keep mine, the queued edit is durable, and for Keep theirs, the queue removal is durable. A synthetic regression forces conflict-list storage failure and verifies the caller receives an error and the conflict remains visible. This intentionally prioritizes recoverability over hiding a partial local operation.

No production data/rules/deployment changed. CI must pass on the resulting exact SHA; Android/weak-signal manual testing remains outstanding.


## 2026-10-26 queue-read account-switch race

A further review found `loadQueue()` captured the current UID before an asynchronous IndexedDB/localStorage read but did not verify it after the await. An account switch during the read could return the first account's queue to a caller executing in the next session. The queue loader now rejects the stale result before publishing it to memory or returning it. Added a synthetic regression that seeds an isolated queue for UID B, starts a read for UID A, switches back to B before the read resumes, and verifies the stale read is rejected. No production data or authorization rules changed. Exact-head CI remains the release gate; Android/weak-signal testing remains outstanding.


## 2026-10-26 authentication profile race hardening

During the shared-device account-isolation review, `AuthContext.loadStaffProfile` was found to allow overlapping asynchronous profile requests to complete out of order. A slow read for UID A could finish after UID B signed in and overwrite B's in-memory staff profile/role. The loader now checks that Firebase's current authenticated UID still matches the requested user after asynchronous reads and writes and before publishing the profile; account-specific profile linking/bootstrap writes are guarded too. This is client-side stale-request protection only and does not change Firestore authorization. Exact-head CI is required; no production data/rules/deployment or Android device test was performed.


## 2026-10-26 conflict visibility and account-switch display guard

A review found that a localStorage read failure was caught and converted to an empty array. That could make the UI state “No sync conflicts” while saved recovery records were unreadable. Conflict reads now throw on unavailable storage, missing workspace, malformed data, or read failure. The panel reports that conflict state could not be verified and does not clear its in-memory conflict list.

The panel also checks the authenticated UID before and after its asynchronous refresh and only renders conflict details whose owner UID matches the current user. Unowned or mismatched entries are represented by a generic recovery notice without record IDs or data, avoiding accidental disclosure during a shared-device account switch. A synthetic regression asserts storage read failures reject rather than returning an empty conflict list.

No production records, Firestore/Storage rules, deployment, or live services were changed. The exact resulting SHA CI is the verification gate; physical Android/weak-signal testing remains outstanding.


## 2026-10-26 corrupt-cache / stale-baseline safeguard

Review found `getDatabase()` returned the seed-shaped fallback after JSON parsing failed, while an older confirmed baseline could still cause the app to treat that fallback as editable data. A subsequent offline diff could interpret the missing records as deletions. The storage layer now marks corrupt-cache recovery required and emits the persistent storage warning; the app does not enable editing from an existing baseline while this flag is set. Only a server-confirmed snapshot that is durably written along with its baseline clears the gate. Added synthetic coverage for corrupt JSON, blocked state, and successful confirmed recovery. This does not delete the old baseline before the confirmed server copy arrives.


## 2026-10-26 verification checkpoint — account-isolation hardening

**Code SHA verified:** eccc7bc89d13a9f7abea4cd467aa8b867c20fb8d  
**GitHub Actions run:** 40320219667 — completed successfully. Both the checks job and offline e2e job passed. The checks job includes TypeScript, Firestore rules/listener-permission emulator tests, offline sync and queue tests, local storage failure handling, Firestore access audit, and the production build.

This pass covers the account-isolation changes committed up to the code SHA above, including queue ownership, stale queue-read protection, conflict persistence failure handling, auth profile race guards, and corrupt-cache recovery gating. It does not establish real-device behaviour or live-service readiness. No deployment, production data migration, production rules change, or Android/weak-signal test was performed. To make this testable on the user's Android phone, an approved staging deployment/preview URL is still needed; do not deploy to production as a workaround.


## 2026-10-26 background sync when conflict metadata cannot be read

After conflict-list reads were changed to fail closed, the background flush path needed a controlled recovery branch: a read failure after Firestore detects a conflict must not become an unhandled rejected promise from startup/connectivity handlers. At that point the queue already retains the conflicted entries, so the flush returns an incomplete result and leaves them queued for retry when local storage is readable. A synthetic regression forces the conflict-list read to fail during a repeated conflict and asserts the flush does not report success or drop the queued edit.

No live services, production data, security rules or deployment changed. Verification remains tied to the exact current branch SHA and CI.


## 2026-10-26 — Prevent offline queue loss during IndexedDB schema upgrade

Review of the UID-scoped offline queue found that `openDb` recreated the object store on version change before reading it. That would delete the only IndexedDB copy of queued edits in an existing v1 `shine_relief_trust_offline_v3::uid:<uid>` database; the localStorage fallback is not a reliable recovery path.

The upgrade now reads existing rows within the version-change transaction, recreates the store with the composite `collection/recordId` key, and writes the migrated rows before the transaction can complete. Missing owner UID is filled only because the database itself is scoped to the authenticated UID; an explicit owner mismatch, malformed key, or duplicate composite key aborts the upgrade instead of guessing or overwriting. The regression test creates a synthetic v1 database, queues a record, opens it through the v2 code, and asserts the record and owner survive. CI has not yet been checked for this patch; no production data or deployment was touched.


### Follow-up: fail closed on unsafe migration

Review found that an aborted unsafe migration would still fall back to an empty localStorage queue and could appear to have no pending edits. Added a distinct migration error path that surfaces a storage warning and propagates the failure rather than presenting an empty queue. The test seeds a synthetic foreign-owner row and verifies the upgrade fails while the original v1 row remains readable. Exact-head CI remains pending.


## Verification outcome — IndexedDB queue migration

Exact code SHA: `2e9c2c1b5c6f33267b6973fdbf8f496b31903e55`. GitHub Actions run `40325409483` completed successfully: both the `checks` and `e2e` jobs passed. The checks job ran TypeScript, the existing regression suites (including offline queue, local storage failure handling, Firestore emulator rules and access audit), and the production build. The Playwright offline end-to-end job passed. The new synthetic IndexedDB schema-upgrade and unsafe-owner regression tests are included in `npm run test:offline-queue`.

This is automated CI evidence only. No production deployment, production data/rules change, live Firebase smoke test, or physical Android/weak-network test was performed. Account-isolation browser coverage is now present; user acceptance on an approved staging/test environment remains the next validation step.


### Queue recovery error boundary

Because the UI invokes startup/connectivity flushes without awaiting them, an unsafe schema migration error could otherwise become an unhandled promise rejection. `flushPendingOfflineSnapshots` now catches errors from the legacy-snapshot migration and queue read only, returns an incomplete flush result, and leaves the persisted queue untouched. The existing storage warning remains the user-facing recovery signal; this is not treated as a successful flush. Exact-head CI is pending.


# Salary-history offline persistence — task report

**Report date:** 2026-10-26  
**Branch:** `Replit`  
**Code SHA verified:** `6a82e651fd379c42f90836877f048b963572ab2a`  
**Verification run:** [SHINE app checks #786](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40377058116)  
**Status:** IMPLEMENTED; AUTOMATED CHECKS AND E2E PASSED

## Scope and observed defect

`EmployeeContractPanel` wrote salary history directly with `setDoc`, outside the shared per-record offline queue. It then wrote the audit event separately. A network interruption could leave an uncertain partial result, block the UI on server acknowledgement, and make pending salary entries unavailable after reopening the panel. The collection is confidential HR data and must remain outside the shared `AppDatabase` snapshot, which is readable by broader staff roles.

## Changes made

- Added `queueOfflineRecordsForSync` in `src/services/offlineSync.ts`. It accepts only the append-only salary-history and employee-audit collections, writes multiple records to the authenticated UID-scoped per-record queue in one durable queue update, rejects workspace changes and conflicting duplicate IDs, and does not copy HR data into the shared operational database snapshot.
- Updated `EmployeeContractPanel` to queue the salary-history record and deterministic `employeeAuditLogs` event together before showing local success. It attempts the normal conflict-aware flush immediately, reports queued vs synced state, and merges pending salary-history queue entries into the view after reopening.
- Updated `syncChangeEntriesToFirestore` so existing salary-history and employee-audit documents are append-only during queue replay: an identical existing document is an idempotent retry; a different existing document becomes a conflict and is not overwritten. Confidential HR IDs and payloads are redacted from offline-sync error logs.
- Kept salary/HR-audit conflicts out of the general case-action audit collection. The conflict remains in the UID-scoped local conflict store. The conflict UI explains the append-only rule, disables “Keep mine” for those records, and allows “Keep theirs” without creating a cross-domain audit entry.
- Added synthetic regression coverage for durable salary+audit queueing, successful sync, identical retry, preservation of a conflicting server salary, prevention of overwrite resolution, and preventing salary conflict identifiers from leaking into the general case-action audit collection.

## Verification results

GitHub Actions run **#786** checked code SHA `6a82e651fd379c42f90836877f048b963572ab2a`:
- **Checks job: passed.** This includes `npm run lint` (TypeScript), the scripted regression suites including `npm run test:offline`, Firestore rules/access audits, and the production build.
- **E2E job: passed.** The workflow's offline browser end-to-end tests completed successfully.
- During an earlier run, TypeScript found one collection-allowlist type mismatch. I fixed it by explicitly typing the allowlist as `Set<string>`; the final run #786 then passed both jobs.
- Local shell cloning was unavailable, so verification was performed through GitHub Actions. No real employee/payroll data was used.

## Remaining risks and next actions

1. No physical Android or weak-signal acceptance test was performed. Before using real HR data, test a synthetic salary save while offline, close/reopen the panel, reconnect, and confirm exactly one salary record and one audit event reach Firestore.
2. Exercise a permission-denied save and same-ID conflict on a test account. The queue preserves the pending record; an append-only duplicate cannot be overwritten and must be resolved by keeping the server record or entering a new salary record with a fresh ID.
3. The implementation is verified on code SHA `6a82e65`. Subsequent documentation-only commits do not change the code tested by run #786.


# Inventory transaction safety — implementation report (in progress)

**Report date:** 2026-10-26  
**Branch:** `Replit`  
**Latest handoff/documentation commit:** `d58be2fec0f83b75f6c071e805bcfef083eac8a4`  
**Status:** IMPLEMENTATION STARTED; EXACT-HEAD CI NOT YET VERIFIED

## Scope

Add a secured, atomic server-backed transaction path for inventory receipts, issues and physical stocktakes, distinct from Manus's read-only inventory snapshot audit. No production deployment or production data write was performed.

## Changes made

- `workers/r2-storage/index.mjs`: added authenticated POST handler for inventory movements. The handler checks the authenticated active staff role, validates the request, reads the current item, computes the new balance on the server, rejects an issue larger than the available balance, uses the Firestore document `updateTime` as a write precondition, and commits the inventory balance/history update and a create-only `inventoryMovements/{id}` record in one Firestore commit. It retries recognized precondition conflicts up to four attempts and checks existing movement IDs for idempotent retries with the same actor/item/request fingerprint.
- `src/services/r2StorageClient.ts`: added the client request helper for the Worker route.
- `src/components/InventoryView.tsx`: Receive, Issue and Stocktake actions now call the server endpoint instead of saving a locally computed stock balance. Offline submissions show an explicit error and do not claim that stock was saved. Confirmed results update the local cache without dispatching a new generic snapshot write.
- `src/types.ts`: added optional previous/new balance values to movement entries and `lastMovementId` to inventory items.
- `firestore.rules`: inventory balance/history changes now require a linked movement record in the same atomic write; movement documents cannot be updated or deleted. Newly created inventory items must start at zero stock, so opening stock must be entered using Receive after the item syncs.
- Added `scripts/inventory-movement-worker.test.mjs` for synthetic endpoint checks and `scripts/inventory-transaction-rules.test.ts` for Firestore rules checks. Registered them in `package.json` and `.github/workflows/shine-checks.yml`.

## Verification evidence and limits

- The tests have been added to CI, but I have **not obtained a trustworthy result for the exact current branch head**. Do not interpret this report as proof that the new tests or rules pass.
- The environment used here could read and update repository files through GitHub integration, but I did not run the repository test suite in a local checkout.
- No physical Android/weak-signal test has been performed for this feature.
- Existing item creation now requires a zero opening balance. Users must wait for sync and then record opening stock with Receive. This is an intentional safety restriction until a fully atomic item-plus-opening-movement creation workflow is implemented.
- Offline movements are rejected clearly rather than queued. That avoids false success and unsafe snapshot sync, but it does not yet meet a seamless offline-first movement workflow.
- The retry key is currently retained in component state, so it protects retries while the view remains mounted but is not yet durably restored after a full app restart. A request whose response was lost must not be blindly resubmitted after a restart; first inspect server movement history.
- Verify Firestore REST error mapping for update-time precondition failures on the actual emulator/CI run. The Worker retries recognized conflict responses; unrecognized error shapes may surface as a failure instead of retrying.

## Required next steps before calling this complete

1. Obtain exact-head CI evidence for `npm run test:inventory-movement-worker`, `npm run test:inventory-rules`, `npm run lint`, `npm run build`, and the full browser E2E job. Fix any failures and re-check the final SHA.
2. Add durable per-user pending-request persistence and safe restoration of the same idempotency key after app restart.
3. Verify the full queue interaction: stale local snapshots must conflict rather than overwrite a server-confirmed movement; metadata-only edits must still sync.
4. Review the rules and Worker independently for atomicity, role denial, immutable audit entries, stale-write retry and legacy records without a movement array.
5. Run the synthetic Android/weak-signal checklist in an approved isolated staging project. Do not deploy or use real inventory records until checks pass.

## Current completion assessment

This is a substantial implementation slice, **not a verified end-to-end feature yet**. The most important positive change is that existing-item stock movements no longer use the ordinary full-record save path; the remaining work is to verify the security rules and Worker transaction behavior, close the restart/offline workflow gaps, and prove the integrated behavior with CI and staging evidence.


## Verification update — 2026-10-26

The malformed date-validation regex was corrected after the first synthetic Worker test failed. The resulting inventory code SHA `a2582d3135cc6ee1b9d5fd15b2df8415f2994ca3` passed [SHINE app checks #840](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40391912914): **checks passed and E2E passed**. The checks job reached and passed both new inventory tests, then completed TypeScript, the existing regression suites, Firestore access audit and build. The first run's Worker-test failure was due to the malformed date regex, not a production incident.

The pass verifies automated behavior on code SHA `a2582d3135cc6ee1b9d5fd15b2df8415f2994ca3`. Documentation-only commits after that SHA do not change the code under test. It does not establish Android, weak-signal, staging or production acceptance. The remaining retry persistence and offline queue gaps listed above are still open, so the broader offline-first inventory workflow is not complete.


## Durable retry follow-up — 2026-10-26

The retry-persistence gap identified above has now been addressed for uncertain network outcomes. Added a per-user local pending-request record, validation when loading it, restoration of the same form and idempotency key after app reload, and clearing after confirmed success or a definitive HTTP 4xx rejection. Added `scripts/inventory-pending-retry.test.ts` and registered it in CI.

**Verification:** exact code SHA `17896ad88910452842ef49ee2b54d2dbf411834c` passed [SHINE app checks #850](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40392565913): both the full `checks` job and Playwright E2E succeeded. The checks job included TypeScript, the Worker transaction test, durable retry persistence test, Firestore inventory transaction rules test, the existing regression suites, Firestore access audit and build. This is automated CI evidence, not physical-device acceptance.

**Still not complete:** when the device is already offline before the user submits, the UI rejects the action without queueing it. The durable pending record covers requests that were sent or attempted but whose outcome is uncertain; it is not yet a full offline-first queue for new stock movements. A physical Android/weak-signal test is also outstanding. Production data and deployments remain untouched.


## Inventory offline-pending follow-up — 2026-10-27

**Code SHA:** `eba72adb4ff8b4ce902d53f113fbd6bff7d7fa43`. **CI:** run #869; checks and Playwright offline E2E passed.

The inventory screen now persists one pending Receive/Issue/Stocktake request per signed-in user before showing offline-pending status. It explicitly says the server balance has not changed. After reconnect, staff manually submit the same form again; the same idempotency key is reused. The pending form restores after reload. A different or malformed pending request cannot be overwritten, and storage failures fail closed. Stocktake now clears persisted retry state after definitive HTTP 4xx responses. Focused retry tests cover cross-user isolation, duplicate restore, overwrite protection, malformed state and storage write failure.

The exact code SHA passed the checks job and Playwright offline E2E. Checks included TypeScript, inventory Worker transaction tests, Firestore inventory rules emulator tests, existing regression tests, access audit and production build. This is CI evidence only; no physical Android/weak-signal test was performed.

**Remaining limitation:** only one outstanding request per user; manual retry is required after reconnect. There is no multi-entry FIFO queue or automatic reconnect flush. No production deployment or production data writes were made.


# Inventory pending FIFO queue — implementation checkpoint

**Date:** 2026-10-27  
**Branch:** `Replit`  
**Status:** Implementation submitted for exact-head CI; do not treat as verified until the run completes.

The one-entry localStorage record is upgraded to a bounded (100-entry) per-user FIFO queue. Reads accept the legacy single-object format, while new writes persist arrays. Queue entries are validated; duplicate IDs or malformed storage fail closed; distinct transactions append without overwriting; and only the current head can be removed. The inventory UI reports the pending count, preserves the original idempotency key for a head retry, queues later transactions behind the head, and states that queued movements do not alter the authoritative server balance. Each movement remains subject to the existing authenticated Worker endpoint and server validation.

The synthetic test covers FIFO order, same-ID idempotency, payload overwrite rejection, out-of-order removal denial, legacy format compatibility, malformed/duplicate queue failure, per-user isolation and storage quota failure. Exact commit and CI outcomes must be appended after the workflow run. No production deployment, live data write or physical Android/weak-signal test was performed.


# Inventory FIFO rejection recovery — 2026-10-27

Code review found that a definitive HTTP 4xx was clearing the oldest pending transaction automatically. That could discard the user's intent and make later queued requests appear ready without explicit review. The fix preserves the rejected entry at the FIFO head, marks it for review in the UI, and offers an explicit discard action; only that action removes the local entry. Uncertain network/5xx outcomes retain the same request ID and payload for safe retry. Exact-head CI must pass before this fix is considered verified. No server permission/rules changes, production data writes or deployment.


## Inventory FIFO rejection recovery — verification outcome

**Code commit:** `4d3940333252d348d4926eddcde617beae87e736`  
**GitHub Actions:** run #885 — **checks: passed; offline E2E: passed**.

The checks job completed successfully, including TypeScript/lint, the focused inventory queue persistence test, inventory Worker transaction tests, Firestore inventory rules tests, broader regression checks and production build. The Playwright offline E2E job also passed on the exact code SHA. A definitive HTTP 4xx no longer clears the FIFO head automatically; the request stays queued until the staff member explicitly chooses “Discard rejected transaction.” Network/5xx uncertainty retains the same request ID for safe retry.

**Known limitation:** the rejected/review marker is component state, not a persisted queue status. After a reload the request remains in the queue and the form restores; retrying it will reproduce a definitive rejection and show the review/discard action again. Persisting the review marker is a possible follow-up. No production deployment/data writes or physical Android/weak-signal test occurred.


## Inventory rejection status persistence follow-up — 2026-10-27

The prior UI recovery fix passed exact-head run #885 (checks and offline E2E). This follow-up stores the `needs-review` status on the queue head, validates it at the storage boundary, restores the review/discard UI after reload, and adds focused tests for head-only marking, idempotency and preserving later queue entries. This additional code commit requires its own exact-head CI run. No production deployment or data writes.
