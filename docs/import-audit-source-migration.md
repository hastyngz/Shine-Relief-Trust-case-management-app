# Import-audit source-data migration runbook

**Purpose:** prepare legacy `importAudits` documents for the restricted `restrictedImportSources` data boundary.

**Production status:** this migration has not been run against production data by the development agent. Do not infer production readiness from a passing build or emulator tests.

## Why this is required

Older audit documents may embed the original imported rows in `importAudits/{auditId}.sourceData`. The revised Firestore rules deny ordinary staff access to those legacy documents until the embedded field is removed. Firestore rules do not filter query results, so a staff query that includes a denied legacy document may fail as a whole.

The migration copies the source object to `restrictedImportSources/{auditId}` and removes `sourceData` from the audit document. It does not delete the audit metadata or intentionally log source contents.

## Before running anything

1. Schedule a maintenance window and notify SHINE administrators. Do not deploy the stricter Firestore rules before the migration is verified.
2. Confirm the intended Firebase project with the project owner and an authorised Firebase administrator. Use the project's established Admin SDK credentials; never paste credentials or private keys into chat, source control, command history, screenshots or logs.
3. Take and verify an appropriate production Firestore backup/export using the organisation's approved process.
4. Run from a trusted checkout of the intended `Replit` commit, with the project's normal environment configured. Do not use real production data in a local fixture or copy production source rows into test files.
5. Ensure no concurrent import or audit-retention job is rewriting legacy audit records during the migration window.

## Stage 1 — dry run (read-only)

From the repository root, run:

```sh
npx tsx scripts/repair-import-audit-source-data.ts
```

Without `--apply`, the script is in dry-run mode and does not write or delete Firestore fields. Record only the summary counts in the change record; do not copy source data into notes.

Review these counts:

- **Audits with embedded sourceData eligible for repair:** records the script examined as repairable, including rows whose restricted copy already matches.
- **Restricted source records already matching:** rows that appear safe to retry idempotently.
- **Conflicts or malformed records:** records that must be investigated before proceeding.

A non-zero conflict count sets a failing process exit code. **Do not proceed to apply while conflicts remain.** The script intentionally avoids printing source contents. A record ID may appear in a diagnostic to identify the item that needs authorised investigation; keep that output within the approved administrative environment.

## Stage 2 — apply

Only after an authorised reviewer has accepted the dry-run counts and all conflicts have been resolved, run:

```sh
npx tsx scripts/repair-import-audit-source-data.ts --apply
```

The script uses a transaction for each audit/source pair. Matching pre-existing restricted copies are treated as safe retries; a different source payload or metadata is treated as a conflict and must not be overwritten.

The migration is **not one transaction across the entire collection**. If the apply run exits non-zero, some earlier records may already have been repaired. Do not attempt a blind rollback or delete either copy. Re-run the dry run, review the remaining counts, resolve conflicts with an authorised reviewer, and apply again only when safe. The intended repair is idempotent for matching records.

## Stage 3 — verify before deploying rules

1. Run the dry-run command again. Confirm no legacy records remain eligible and no conflicts are reported.
2. Using authorised role-specific test accounts, verify ordinary staff can query/read normal audit metadata and cannot read `restrictedImportSources`.
3. Verify a manager/administrator can access the restricted source through the intended workflow.
4. Verify a synthetic new import writes audit metadata and restricted source data separately, and that a failed source/audit write is reported as a failure rather than a successful import.
5. Run the Firestore rules emulator suite and the repository's required CI checks on the exact commit planned for deployment.
6. Only then deploy the revised Firestore rules. Record the commit, project identifier (not credentials), dry-run/apply counts, operator, reviewer and verification outcome.

If verification fails, stop the deployment and keep the rules/data state under review. Do not weaken the rules to make legacy records readable. Escalate conflicts or unexpected data shapes to the authorised Firebase administrator.

## Scope and limitations

- This procedure moves embedded source objects; it does not repair unrelated import failures or make a multi-record import transactional.
- The migration has not been executed against production by the development agent.
- Do not connect or activate Cloudflare KV as part of this procedure; KV caching is intentionally deferred.
