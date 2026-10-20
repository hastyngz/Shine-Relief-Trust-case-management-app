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

## Next actions

1. Check GitHub Actions for follow-up commit `72ad42b68de1ec1e1a1fa2d4b78125d7c472c2c8`; do not mark the test correction verified until its run finishes.
2. If the offline test now passes, investigate the two E2E failures using their Playwright error contexts and setup. Check whether the E2E Firestore fixture creates `importAuditMigrationStatus/sourceDataBoundary` when staff audit-list behaviour is expected.
3. Update this report with exact follow-up CI results and the final branch SHA.
4. Keep production untouched until all release-gate steps and owner approval are complete.

## Instructions for ChatGPT review

- Start with this report and `AGENT_BOARD.md`.
- Recheck the exact `Replit` head and its GitHub Actions run before trusting any status.
- Review the migration helper, CLI, Firestore rules and tests together; the in-memory migration tests do not replace emulator permission tests.
- Confirm whether the two E2E failures are caused by missing emulator completion-marker setup or actual app regressions.
- Do not run production apply or deploy rules without explicit owner approval.

## Review addendum — 2026-10-20

The review continued after the initial report. A further Firestore rules integrity gap was identified and addressed in the two commits listed above: the audit completion marker now requires a non-empty restricted source payload. The current branch head must be checked for CI results; previous run results do not validate these later commits. Production remains untouched and the release gate remains closed.
