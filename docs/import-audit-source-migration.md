# Import-Audit Source-Data Migration Runbook

**Purpose:** move legacy `importAudits/{auditId}.sourceData` to the restricted `restrictedImportSources/{auditId}` collection without exposing source rows to ordinary staff.

**Production status:** no production dry run, apply, data verification, role test, or rules deployment was performed for this task. The production release gate remains closed.

## Why this is required

The Firestore rules allow ordinary active staff to read audit metadata only when the audit document has no `sourceData` field. Rules do not filter query results; one inaccessible legacy document can make an otherwise permitted collection query fail. The emulator confirmed a broad query could return a legacy document even while a direct read was denied, so ordinary staff collection queries are additionally gated until the migration writes a server-only completion marker after a clean full-collection verification. Managers and administrators retain their existing access. Restricted source records remain readable only by managers and administrators.

The migration derives the destination ID from the Firestore audit document ID, not a possibly absent or stale embedded `id`. It copies the established fields `id`, `auditId`, `fileName`, `importedAt`, and `sourceData`. It preserves all other audit metadata and removes only `sourceData`.

## Prerequisites and project confirmation

1. Obtain explicit approval from the repository owner and schedule a maintenance window. Pause imports and any audit-retention or rewrite jobs for the duration.
2. Confirm the intended Firebase project ID with the owner and an authorised Firebase administrator using the approved deployment record/console. Compare it with `projectId` in `firebase-applet-config.json`; the script refuses a different value. Do not infer that the repository's configured project is production.
3. Use the existing Admin SDK authentication path from `src/server/firebaseAdmin.ts`: either the approved `FIREBASE_SERVICE_ACCOUNT_JSON` environment setting or Application Default Credentials. Never print, copy, commit, or send credential values. The migration validates project arguments before loading Firebase Admin.
4. Run from a trusted checkout of the reviewed `Replit` commit. Record the commit SHA and the confirmed project ID (not credentials).
5. Create an approved Firestore backup before any apply. An operator may use the organisation's scheduled backup/export process or, where approved, a command shaped like:

	```sh
	gcloud firestore export "gs://<APPROVED_BACKUP_BUCKET>/<UNIQUE_BACKUP_PREFIX>" --project="<CONFIRMED_PROJECT_ID>"
	```

	Confirm the export operation completed successfully, verify the expected backup objects and retention/access controls, and perform a restore/integrity check in a separate secured test project if policy requires it. Do not download source records to an unprotected workstation or use them in fixtures. A backup is not verified merely because an export command started.

## Stage 1: read-only dry run

Set `CONFIRMED_PROJECT_ID` only after the confirmation above. From the repository root:

```sh
npx tsx scripts/repair-import-audit-source-data.ts --project "$CONFIRMED_PROJECT_ID"
```

No `--apply` means dry run. The script issues no writes, requires the explicit project to match the configured Firebase project, and prints counts only, with no document IDs or source contents.

Interpret the summary:

- **Records examined:** audit documents inspected.
- **Records requiring repair:** valid legacy embedded payloads, including records whose restricted destination already matches.
- **Already-correct records:** documents with no embedded `sourceData`.
- **Conflicts:** a missing audit at transaction time or an existing destination whose full expected shape differs.
- **Malformed records:** source data is absent/empty/wrong-shaped, metadata is invalid, data is not JSON-compatible, the audit ID disagrees, or the destination would exceed the migration's conservative size limit.
- **Failures:** collection/document reads or transactions failed.
- **Apply status:** only a zero-conflict, zero-malformed, zero-failure dry run is eligible for review; it is not production approval.

The command exits non-zero on conflicts, malformed records, or failures. Do not apply unless the owner/reviewer has reviewed the counts and all conflicts are resolved. Investigate a conflict through an authorised administrative workflow, comparing the audit and restricted destination without copying payloads into logs or this repository. Preserve both records until an authorised decision is made; never choose one by overwriting.

## Stage 2: explicit apply

Apply requires both `--apply` and `--confirm-project`, with the same project ID supplied to `--project`. It also requires the project's configured ID to match. Run only after owner approval of the dry-run report and verified backup:

```sh
npx tsx scripts/repair-import-audit-source-data.ts --project "$CONFIRMED_PROJECT_ID" --apply --confirm-project "$CONFIRMED_PROJECT_ID"
```

The command performs a fresh collection preflight and writes nothing if any preflight conflict, malformed record, or failure exists. For each eligible audit, a Firestore transaction rereads both documents, creates the destination only if absent, rejects any differing destination, and removes only the embedded field. A matching destination is retained. Firestore transaction retries protect against concurrent changes; a changed audit is reread, not overwritten from the initial scan. The post-apply summary rescans the whole collection. Only a zero-residual, zero-conflict, zero-malformed, zero-failure verification writes `importAuditMigrationStatus/sourceDataBoundary` through Admin SDK; this enables ordinary staff collection queries. A failed or incomplete apply leaves the gate closed.

The transaction makes the source creation and audit-field removal atomic for each pair, not for the entire collection. If the process is interrupted, previously committed pairs remain migrated and unprocessed pairs remain intact. Do not attempt rollback: no rollback procedure has been implemented or tested, and deleting either copy could destroy the only valid source. Rerun the dry run, review all counts, resolve any conflicts, and repeat the approved apply command. Matching destinations make this retry idempotent.

## Stage 3: verify data and access before rules deployment

1. Run the dry-run command again. Require `Records requiring repair: 0`, `Conflicts: 0`, `Malformed records: 0`, and `Failures: 0`. Verify the apply summary says `Ordinary staff audit queries enabled: yes`. Keep the apply and post-apply summaries with the approved change record; do not include source data.
2. Through approved role-specific accounts in the intended environment, verify Staff and View Only users can query and read the cleaned audit metadata but cannot read or query `restrictedImportSources`. Verify Manager and Administrator access to restricted source records and permitted audit metadata. Confirm the status marker is not readable or writable by client roles.
3. Verify the normal import flow creates separate audit/source documents, a retry with a matching source does not replace source rows, a mismatched source is rejected, and a persistence failure is surfaced as failure. Use synthetic data for automated tests; do not create a production import just for testing.
4. Run the rules emulator suite and all required local checks on the exact reviewed commit. A local emulator result is not production role verification.
5. After owner approval of the complete dry-run, backup, apply, integrity and role-access evidence, an authorised operator may deploy the reviewed rules:

	```sh
	npx firebase deploy --only firestore:rules --project "$CONFIRMED_PROJECT_ID"
	```

6. Verify the deployed rules/version and role behavior in the confirmed project. Record the commit, project ID, backup reference, counts, operator/reviewer, and evidence in the approved operational record.

If a check fails, stop deployment and keep the system under review. Do not weaken rules to make a query pass. The project owner must approve the dry-run report and production apply separately; this runbook is not that approval.

## Scope and limitations

- This migration handles legacy source data only; it does not make broader multi-record import workflows transactional.
- The app's current import persistence writes the restricted source and metadata audit together in a client Firestore transaction. `importService.ts` awaits persistence before returning success; local persistence failure is reported separately because it occurs after the cloud transaction.
- The code, tests and runbook can be prepared locally without production access. Production execution and role verification remain operator responsibilities.
- Do not connect or activate Cloudflare KV as part of this procedure; KV caching is intentionally deferred.
