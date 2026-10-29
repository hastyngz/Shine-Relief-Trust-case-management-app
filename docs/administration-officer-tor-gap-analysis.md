# Administration Officer ToR — SHINE implementation gap analysis

**Scope:** Code-level review of the existing `Replit` branch. This document distinguishes implemented entry points from complete end-to-end workflows. A route or screen is not proof that the underlying workflow is fully integrated, secure, or production-verified.

## Existing foundations confirmed in code

| ToR responsibility | Existing implementation | Status and limits to preserve |
|---|---|---|
| Inventory and stores | `src/components/InventoryView.tsx`, `src/utils/inventory.ts`, `InventoryItem` / `InventoryMovement` types, local database persistence and normal sync path | **Partially implemented; online stock transaction path CI-verified.** Item registration starts at zero stock. Existing-item Receive, Issue and Stocktake requests now use an authenticated Worker route that computes the balance server-side and atomically commits the balance/history update with a create-only movement document. Firestore rules prevent ordinary updates to stock balance/history and make movement documents immutable. Synthetic Worker and rules tests, TypeScript, the full checks job and browser E2E passed on code SHA `17896ad88910452842ef49ee2b54d2dbf411834c` (Actions #850). New submissions begun while offline are rejected rather than queued; physical Android/weak-signal acceptance remains outstanding. Existing-item location edits remain blocked without a transfer ledger. Location-to-location transfers and formal issue/adjustment approvals are not implemented. Stock-code uniqueness remains a local check. |
| Asset register | `src/components/AssetRegisterView.tsx`, `AssetRecord` / `AssetHistoryEntry` types, maintenance dialog and asset export tests | **Partially implemented.** Asset records include tags, category, cost, location, assignee, condition/status, warranty/service dates and history. A per-asset physical verification action now records who checked it, date, outcome, observed location/condition and a history entry without silently changing the register. The dashboard counts assets located this year and registered active assets not checked this year. Asset-tag uniqueness is currently client-checked; physical-verification save failures need a clearly recoverable UI state and tests so an observation is not lost or falsely reported as recorded. This denominator is only the assets already registered in SHINE; organisation-wide campaigns to identify unregistered property and independently verify the complete asset population remain outstanding. |
| Procurement | `ProcurementList` / `ProcurementListItem` / `ProcurementQuote` types and existing planning workflow | **Partial; two reliability gaps corrected and browser-covered.** Lists and quote capture exist. Procurement list creation/updates now use SHINE's per-record offline queue rather than a parallel direct Firestore write, and staff can collect supplier quotes when an item's price is missing or unclear. `e2e/compliance-calendar.spec.ts` covers the missing-price quote flow. Price selection and approval are not automated. A full request → delegated approval → quote comparison/selection rationale → purchase order → partial delivery/receipt → finance handover workflow is not established by the current UI. Do not mark a purchase as paid merely because goods arrived. |
| Staff and personnel | Staff management, employee records, payroll, contracts and salary history | **Existing foundations; partial ToR coverage.** Reuse the same employee identity and link payroll to the employee profile. Attendance, leave, onboarding checklists, training/policy acknowledgements and structured performance reviews still need assessment/implementation. Sensitive HR documents must not become visible to every staff role. |
| Meetings and follow-up | Meeting records, minutes/transcription fields, extracted action IDs, schedules, workplans and operations view | **Existing foundations; integration to verify.** Ensure meeting decisions create traceable tasks/action items with owner, deadline, evidence, status and history rather than duplicate task stores. |
| Reporting | Reports/export, report builder, programme/workplan/budget data | **Existing foundations; partial administrative reporting.** A monthly Administration Officer report should draw from actual records, show missing data, and never fabricate completed work or imply that incomplete records are complete. |
| Document ingestion / filing | Existing import workflow, private R2 attachment storage and `src/components/DocumentsFilingView.tsx` | **Phase 1 index implemented; full filing still partial.** The new index searches accessible existing attachments by filename, caption, category, date, uploader and linked record; it downloads through the authenticated storage client and links supported records back into SHINE. It reuses the existing attachment store, excludes safeguarding attachments and respects health-record query permissions. It is not yet a complete organisation-wide filing register: staff/contracts, procurement, assets, meetings and finance targets are not all supported by the attachment model; title/reference/expiry/confidentiality metadata and controlled version history remain to be implemented. |
| Compliance calendar | `src/components/ComplianceCalendarView.tsx`, optional compliance metadata on existing `ScheduleItem` records and existing schedule persistence/sync | **Phase 1 implemented, with conflict-aware offline writes, explicit local-save failure handling and browser coverage.** Staff can register an obligation, assign an active staff owner, set category/priority/recurrence/due date, filter/search records, mark work in progress, record completion notes/evidence, and retain an event history. Schedule helpers report whether local persistence succeeded; on failure, the compliance form stays open and does not show a success notice. `scripts/storage-failures.test.ts` covers the failure/recovery result and `e2e/compliance-calendar.spec.ts` exercises staff registration and completion in the production-built browser app. Schedule creation/updates/deletions now rely on SHINE's per-record offline queue rather than issuing a parallel direct `setDoc`, so the queue's baseline/conflict checks can protect the record. Independent manager verification is not yet enabled because existing shared schedule write permissions do not enforce manager-only verification at the database boundary; the UI explicitly discloses this limitation. The embedded history is operational context, not an immutable server-authenticated audit log, so it is not sufficient alone as formal audit evidence. Overdue/due-within-30-days indicators are calculated from device-local date-only values. Recurrence is recorded but does not yet auto-create the next occurrence; notifications, contract/staff-document links and recurring task generation remain outstanding. Since the shared schedule collection is readable by all active staff, do not put confidential HR, financial or child-related details in these general obligations. |
| Suppliers | Supplier names are currently available in inventory/procurement fields | **Partial.** A reusable supplier/service-provider register with quotation/purchase history, documents, delivery performance and declared conflicts is not established. |
| Finance administration | Budgets, expenses, payroll, procurement lists and financial reports | **Partial.** Missing-document checks, commitments vs actuals vs unpaid invoices, and a properly reconciled petty-cash workflow need explicit models and permissions. A targeted code review also found the monthly budget cards group all records by month number and do not apply the active period/category filters used by headline totals; monthly and headline figures can therefore describe different scopes. Define the financial-year model and align or explicitly label the dashboard scopes before using it as a formal management report. Never count internal stock issues as new expenditure. |
| Transport and logistics | General schedules and operational planning | **Gap.** No confirmed dedicated vehicle/driver register, trip log, odometer/fuel, service and repair workflow. |
| Safeguarding administration | Existing safeguarding APIs/rules and per-staff permissions | **Sensitive existing foundation.** New administration search, AI, reports and exports must not bypass the existing authorization boundary. Add policy/training acknowledgement tracking and a restricted referral/reporting route without giving general administration staff investigation powers. |
| Organisational performance | Existing management/quality/reporting views | **Partial.** ToR indicators require explicit, agreed denominators, reporting periods, exclusions and source records. Asset coverage must compare verified physical assets with registered assets, not simply count database rows. |

## Additional cross-cutting reliability findings (2026-10-16)

### Local persistence and offline/cloud consistency — high priority

A targeted code inspection found that the persistence architecture is not yet uniform across the application:

- `src/utils/storage.ts` core girl/household/follow-up create, update and delete helpers call `saveDatabase(db)` without checking its `{ ok }` result, then start separate direct Firestore operations. Many Phase-2 record helpers follow a similar pattern through `addPhase2Record` and update helpers.
- Inventory and asset helpers check local-save results; compliance schedule helpers return an explicit `savedLocally` result and avoid a parallel direct write. These are better patterns, but must not be copied mechanically without respecting each domain's existing semantics.
- The Firestore snapshot listener in `src/App.tsx` attempts `saveDatabase(cloudDb, false)` and then updates React state with the cloud snapshot regardless of whether local persistence succeeded. Storage warnings are surfaced, but the implications for subsequent reloads and offline changes need explicit tests.
- `importDatabaseJSON` synchronizes the validated backup to Firestore before checking local save success, then returns `true` even if `saveDatabase` fails. `clearAllDatabase` also ignores the local save result after cloud deletion. These operations need defined partial-failure semantics before they are changed, because a naive ordering change could produce a different kind of inconsistency.
- **Restore mapping fix committed:** the backup normalizer previously omitted `assets` and `caseGoals` despite those collections being part of the app database. `normalizeImportedDatabase` now preserves both and defaults them to empty arrays for older backups; regression assertions were added. The new test has not yet been run in this session, so verification remains pending. This does not resolve the separate partial-failure semantics above.
- The same unchecked local-save plus direct-Firestore pattern also appears in workplan create/update/delete, payroll create/update/delete and employee updates. This extends the risk into HR and operational planning; any migration must preserve role boundaries, payroll history, offline replay and conflict handling.

**Required approach:** do not introduce a global in-memory fallback or bulk rewrite without testing snapshot reconciliation, queue baselines, offline creates/updates/deletes, conflict handling, health/safeguarding permissions, backup recovery and retry behaviour. Build a domain-by-domain migration matrix and explicit outcome states first. For import/reset, distinguish local persistence from cloud completion and protect recoverability. Treat this as a reliability risk, not as proof that every operation currently loses data.

## Implementation sequence

### Workstream 1 — Documents & Filing (Phase 1 index delivered; continue)
1. **Delivered:** searchable index over existing report-eligible attachments, metadata-only loading, authenticated file download, supported linked-record navigation, refresh/loading/error/empty states and route regression coverage.
2. Keep the existing private R2 store; do not copy file bytes or introduce a parallel upload path.
3. Extend target types and attachment authorization for procurement, assets, staff/contracts, meetings, reports and finance only after defining their role-specific rules and validating server-side access.
4. Add title/reference/owner/confidentiality/optional expiry metadata with a migration-safe model and audit trail.
5. Add version history only with explicit retention semantics; never silently replace an approved policy or destroy the previous version.
6. Keep safeguarding outside general search and health records permission-filtered. Do not broaden collection reads to make the index appear complete.
7. Add tests for authorization, missing/deleted files, metadata search, linked-record navigation, mobile layout and offline/error states.

### Workstream 2 — Compliance & Deadlines
- Reuse the existing schedule/calendar and staff identity where possible.
- Track obligation type, responsible person, due date, recurrence, priority, status, evidence, completion and verification.
- Generate reminders/tasks without treating a reminder as an approval or an organisational decision.
- Link contract reviews, training/policy acknowledgements, report deadlines, stocktakes and asset servicing.

### Workstream 3 — Procurement and supplier integration
- Add request and delegated-approval stages, quotation records and selection rationale, purchase order reference, receipt/variance evidence, and finance handover.
- Keep requesting, approving, receiving and payment confirmation separate where practical.
- Link received inventory to the procurement receipt exactly once; distinguish inventory movement from expenditure/payment.
- Preserve the existing procurement-list workflow and migrate/extend its records compatibly.

### Workstream 4 — Administrative reports and performance indicators
- Produce a period-based report from real source records with missing-data indicators.
- Add configurable, management-approved KPI definitions and denominators.
- Export registers to existing supported formats; protect restricted data in every export.
- Include an audit trail and clear “not verified / incomplete” states.

### Workstream 5 — Transport, logistics and broader HR workflows
- Implement only after checking the existing models for overlap.
- Reuse employee/contact, schedule, document, task and notification infrastructure.
- Apply role-based access and retain history for edits, approvals and reconciliation.

## Cross-cutting acceptance criteria

- Read `AGENTS.md` and the relevant skills before each substantial change.
- Keep work on the existing `Replit` branch; do not change `main`, create a branch or open a pull request unless explicitly requested.
- Do not weaken Firestore/Storage/server authorization; UI hiding is not security.
- Preserve local-first/offline queue and conflict semantics. Financial/inventory actions must not double-process after retries.
- Keep child and safeguarding data out of general-purpose search, exports, analytics and external AI services unless specifically authorized by the existing security model.
- Separate requester, approver, receiver and payer responsibilities where applicable.
- Add focused regression tests; run `npm run lint`, relevant `test:*` scripts and `npm run build` before claiming verification. Report manual Android/browser checks separately.
- Do not populate the app with illustrative example stock, assets, staff, deadlines or KPI results as if they were real SHINE records.


## Additional reliability findings (2026-10-16, continued)

### Operational reset coverage
- The Firestore reset previously maintained a hand-written list that did not include several live operational modules, including contacts, employees and salary history, meetings, feeding logs, market prices, forecasting/scenario settings, AI settings/suggestions, and assets. A reset could finish without removing all operational records.
- Added `src/services/firestoreResetPolicy.ts` as the explicit list used by the reset service, added the omitted operational collections, and added `scripts/firestore-reset-policy.test.ts` to the storage CI step.
- The UI now describes the reset as an operational-data reset rather than claiming every Firestore collection is cleared. Its confirmation lists the major data areas affected and identifies the preserved staff access/messaging, safeguarding and designated audit/report-history collections. Some operational history and import records are still removed, so this must remain an explicit, admin-confirmed destructive operation.
- A further offline-safety gap was found: pending per-record edits and legacy whole-database snapshots could replay after a reset and recreate deleted records. A successful reset now clears the persisted queue and legacy snapshots, resets the in-memory queue and establishes the reset database as the new sync baseline. Queue state is only updated in memory after the durable queue write succeeds.
- Failure semantics remain partial rather than transactional. If Firestore deletion succeeds but local reset persistence fails, the operation now reports an error and preserves queued edits rather than claiming success; cloud data may already have been deleted, so the admin must repair local storage and retry. Multi-collection Firestore deletion cannot be rolled back by this helper.
- GitHub Actions run 386 passed for commit `5e5b128` before this additional queue-reset change. The queue reset regression test and latest code require a fresh CI run; do not treat the current commit as verified yet.

### Remaining backup and reset failure semantics
- Backup restoration now exposes explicit outcomes for invalid backups, cloud synchronization failure, cloud success/local-save failure, offline-queue cleanup failure, and full success. The administrator UI shows the actual failure category rather than labelling every failure an invalid file.
- Restore writes to Firestore before replacing local storage so a cloud permission/network error does not first destroy the device's existing local copy. Firestore uses multiple batches, however, so a reported cloud failure can still follow earlier successful batches; inspect cloud records before retrying.
- A restore only reports full success after local persistence and cleanup of per-record offline edits and legacy snapshots. It refuses to start if the offline queue contains pending edits or cannot be inspected, preventing old queued edits from replaying over restored data. If queue cleanup fails after local/cloud writes, the UI explicitly warns that the restored database exists but pending edits may still be present.
- Reset still performs destructive cloud work before checking whether local persistence succeeded, and multi-collection deletion cannot be rolled back. To reduce the resulting risk, reset now writes a durable recovery marker before deleting cloud records. Queue replay is paused while that marker exists and resumes only after local reset, queue clearing and baseline reset all succeed. If the marker cannot be written, destructive reset aborts before cloud deletion.
- This recovery lock blocks the normal queued replay path, not every independent direct-write path. The application still needs a stronger global recovery/read-only state for partial reset failures; do not describe this as a transaction or full rollback.
- Regression coverage for restore orchestration uses injected cloud/local persistence functions, and offline-sync tests exercise queue blocking while reset recovery is required. GitHub Actions run 38883455857 passed TypeScript, storage/offline queue tests, security/quality checks, production build and offline end-to-end tests.


### Incoming Firestore snapshot local-save guard
- The listener callback now applies a cloud snapshot to the React state and advances the confirmed baseline only after `saveDatabase(cloudDb, false)` succeeds. Previously it ignored the save result and replaced the in-memory state regardless, so a quota/storage failure could make the UI move on as if the snapshot had been persisted.
- Regression coverage forces the local snapshot write to fail and checks that the local database and sync baseline remain unchanged.
- Remaining limitation: the local database and baseline are separate storage keys; baseline-write failure after a successful database save still deserves a two-phase recovery design.

### Case-entry failure feedback
- Core girl, household, education/health/family follow-up, rent and household-activity handlers now catch local persistence errors and show operation-specific feedback. They do not proceed to success navigation/toasts when a synchronous save fails.
- Girl profile school/class changes may write education-history entries before the profile itself is saved. If a later save fails, the UI warns staff to review the related history and profile before retrying; this remains a multi-record, non-transactional workflow.
- Verification status: pending the current GitHub Actions run. Real-device quota/storage failures and the form's exact recovery experience still need manual Android verification.

### Reset seed isolation
- The administrator reset now returns a private cloned seed database instead of the shared `INITIAL_DATABASE` singleton. This aligns reset behaviour with the earlier fallback isolation fix and prevents post-reset UI mutations from contaminating the shared seed object.
- Verification: included in the next GitHub Actions run; do not treat this small follow-up as verified until checks complete.

### Seed fallback isolation
- `getDatabase()` now returns a JSON-cloned seed database when no local record exists, when called outside a browser, or when reading stored JSON fails. This avoids handing mutation helpers the shared `INITIAL_DATABASE` object when storage is unavailable; a failed save can no longer alter that singleton and make a later read appear to contain unsaved changes.
- Regression coverage removes the stored database, forces local persistence to fail, mutates the returned fallback, and confirms a subsequent fallback read does not contain that mutation.
- Remaining risk: malformed/unreadable local JSON still falls back to seed data instead of offering a recovery/export flow for the damaged stored payload.

### Core CRUD local-save failure handling
- A targeted sweep of legacy CRUD helpers now checks the local persistence result before starting their direct Firestore writes. It covers girl and household records, follow-ups, rent/expenses/activities, budgets, workplans, procurement list updates, case-management history, people, meetings, feeding and market-price records, AI settings and early-years records. Delete helpers that return booleans report `false` and skip cloud deletion if the local save fails.
- Regression tests simulate local-storage failures for girl create/delete and workplan create/update/delete. A persistent storage warning is still the primary user-facing signal for these legacy callers; caller-specific retry messaging needs a follow-up audit.
- This does not convert all legacy direct writes to the per-record queue, nor does it make cloud writes atomic. Offline/conflict behaviour and cloud failure recovery still need a per-domain migration and tests.
- Verification status: this commit's GitHub Actions run is pending; do not treat these changes as verified until the run completes.

### Payroll and employee local-save integrity
- Payroll create/update and employee updates now check the device save result before starting their Firestore write. If local storage rejects the save, the operation throws a clear actionable error and the payroll form remains open; the employee contract/profile caller can surface the update failure. Payroll delete returns `false` and skips cloud deletion when local persistence fails, and the UI shows a retry message.
- Regression tests simulate local storage failures for payroll creation and employee updates to verify they stop before the cloud-write step.
- Remaining issue: this is a targeted domain fix, not a global persistence guarantee. Older girl, household, follow-up, budget, workplan, meeting and other CRUD helpers still contain unchecked saves. Continue migrating one domain at a time with caller-level error handling and offline/conflict regression tests.
- Verification: latest commit needs its own GitHub Actions run.

### Fail-closed offline queue inspection and baseline persistence
- Restore now checks the persisted queue rather than trusting only a cached/in-memory count. The inspector checks IndexedDB plus its localStorage fallback and returns `unavailable` for malformed or inaccessible queue state; malformed legacy snapshot data also blocks restore. This avoids silently treating a damaged queue as empty.
- The reset-recovery marker blocks automatic queue replay. A backup restore may be retried when the persisted queue is readable; if queued edits remain, the admin UI requires explicit confirmation before discarding them during recovery. Corrupt or unreadable queue state still blocks restore.
- Reset queue cleanup now requires the new last-synced baseline to be durably persisted before it removes the recovery marker. If baseline persistence fails, the marker stays active and the queue flush remains paused.
- Regression tests cover pending/clear/unavailable queue inspection, corrupt JSON, IndexedDB failure, and retaining the reset lock when baseline persistence fails.
- Remaining risk: Firestore changes are not atomic across batches. A global read-only/recovery mode is still needed to stop separate direct-write operations while the marker is active.
- Verification: latest code needs its own GitHub Actions run.

### Backup replacement completeness
- A broader comparison of `AppDatabase` fields with `syncEntireDatabaseToFirestore` found additional gaps beyond the normaliser: bulk restore did not write meetings, feeding logs, market prices, forecast settings, what-if scenarios, intelligence suggestions or AI settings. The stale-record cleanup list also omitted employees and case goals, so a replacement restore could leave stale cloud rows or fail to restore those modules.
- Added bulk-write mappings for those modules and standalone restricted import-source rows, and switched stale-record cleanup to a shared backup-replacement collection policy. Employee salary history is deliberately excluded because it is maintained separately and is not represented by the AppDatabase JSON backup.
- Added `scripts/backup-restore-coverage.test.ts` to the storage CI step alongside the operational reset policy test.
- This is not a transactional restore: Firestore writes are batched and stale deletion follows the writes, so a network/permission failure can still leave a partial restore. The restore UI now distinguishes invalid backup, cloud failure, cloud-updated/local-save failure, pending offline edits, queue-cleanup failure and success.
- Verification: GitHub Actions run 38883455857 passed the restore coverage, storage failure, offline queue, TypeScript, production build and offline end-to-end checks.

### Targeted local-save rollback for case, finance and planning records
- Added rollback around create/update operations for girls, households, expenses, budget lines, annual budget plans and workplans. If local storage rejects the write, the prior in-memory collection is restored and the cloud write is not started.
- Delete paths for girls and households now restore all affected collections when local persistence fails, including girl follow-ups and household-linked rent, expense and activity records. Expense, budget, workplan and schedule deletes retain their boolean failure contract and restore the removed record before returning false.
- Schedule create/update helpers now roll back failed in-memory edits; the simple helpers throw actionable errors instead of returning an item that looks saved. Planning forms catch persistence errors and remain open, and delete actions show failure rather than refreshing as if the operation succeeded.
- Expense create/update/delete handlers now surface local storage errors and do not show success or start cloud writes after a failed save.
- Recovery restore now sets the local recovery marker before the first destructive cloud write. If the marker is active after interruption, a readable empty queue permits a retry; if queued edits remain, the administrator must explicitly confirm that retrying the backup will discard them. Unreadable/corrupt queue state remains fail-closed.
- Regression tests cover local storage failure and in-memory rollback across beneficiary/household cascade deletion, expense CRUD, budget/annual-budget CRUD, workplan CRUD, schedule CRUD, restore lock ordering and partial restore outcomes.
- Verification: GitHub Actions run 38894050874 passed TypeScript, storage failure tests, production build and offline end-to-end tests for commit fcd2711. The subsequent reset-seed-isolation fix in ba0947 and final documentation commit require a fresh run before calling the whole set green.
- Remaining risk: these targeted fixes do not make localStorage and Firestore transactional. Other clients can still write independently during a multi-batch restore, and several older follow-up, meeting, programme, Early Years and inventory helpers still need the same domain-by-domain review.


### Payroll, personnel and delete-path rollback follow-up
- Payroll create/update previously could leave a changed in-memory row when local storage rejected the save; payroll delete returned `false` but had already removed the row from the in-memory database. These paths now restore the previous payroll array on local-save failure. Employee profile updates likewise restore the prior array when the local save fails, before any Firestore write is attempted.
- Payroll duplicate detection now checks pay-period start date only when one is actually supplied. Previously, two rows for the same employee with different periods but missing optional start dates could be incorrectly treated as duplicates because `undefined === undefined`.
- Audited delete helpers for educational, health and family follow-ups, rent payments, household activities, meetings, feeding-program logs, market prices, Early Years records, historical case records and people. On local-save failure they now restore the previous collection and return the existing failure value; missing IDs return failure without writing an unchanged database for filter-based deletes.
- Regression tests now exercise payroll/personnel local-save failures and the above delete failure paths, checking that the records remain available after storage recovers.
- Verification: GitHub Actions run 38910331290 passed both the `checks` job (including TypeScript, focused test suites and production build) and the offline end-to-end job for code commit `08161ec`. The subsequent board/documentation-only commits do not change application code; their workflow is still to be observed separately.
- The earlier list of local rollback gaps is now stale: follow-up, meeting, programme, Early Years, person, payroll, workplan, inventory and asset mutations have rollback handling for failed local persistence, with regression coverage in the storage-failure suite. Commit `9d6fac5` extends the same protection to forecast settings, AI settings, intelligence suggestions and custom person types. CI run `39068946069` passed both the `checks` and `e2e` jobs for this commit. Regular create/update/delete operations in `src/utils/storage.ts` now use the shared per-record offline queue as the sole cloud-write path; direct Firestore calls were removed from girl/household records, follow-ups, rent/expense/activity, budget/annual-budget, workplan/meeting, feeding/market-price, Early Years/historical, forecast/AI settings, import-audit, people-directory, payroll and employee helpers. `scripts/offline-sync.test.ts` exercises queue-only creates plus stale updates/deletes across these domains and asserts that newer server records survive with conflicts surfaced. The final code commit for this batch is `efe4833`; GitHub Actions run `39071066594` passed both checks and E2E. Remaining risks: cross-device stock-code/asset-tag uniqueness still needs server-coordinated enforcement. Inventory transfers/formal stock-issue approvals and the full procurement purchase-order/receiving/finance handover are not yet complete. A safe partial transfer cannot be added to the current inventory shape without redesign: each item currently has one location/balance and stock codes are globally unique, so a destination balance for the same stock code cannot be represented reliably. Important exception found during the follow-on audit: `src/services/importService.ts` still performs many direct Firestore writes while applying an import, including matched existing records. Commit `2c4bb98` now checks the final `saveDatabase(updatedDb)` result and throws a clear warning instead of falsely reporting success when local persistence fails; regression coverage is in `scripts/phase2-import-ai.test.ts`, and CI run `39071589914` passed checks and E2E. This is a mitigation only: a later write failure can still leave a partial cloud import, and local persistence failure can leave local/cloud state divergent. The import path also writes salary-history and employee-audit collections that are not represented in `AppDatabase`, so it needs a dedicated import manifest/partial-failure recovery design rather than a blind replacement with the normal queue. Bulk backup/restore and explicit audit flows also remain separate direct-write paths and need their own transaction/retry audit.


### Inventory and asset identifier uniqueness — local guard added
- Inventory record and movement IDs now use `crypto.randomUUID()` where supported, with a Web Crypto random-value fallback and a last-resort compatibility fallback. `scripts/inventory.test.ts` checks a 1,000-ID batch for collisions and prefix retention. This reduces record-ID collision risk; it does **not** solve duplicate stock codes or asset tags created on different devices.
- saveInventoryItem and saveAssetRecord now enforce case-insensitive, whitespace-trimmed stock-code/asset-tag uniqueness in the current device database, so callers that bypass the form-level check cannot silently add a duplicate locally. Regression tests verify rejection leaves the existing register unchanged. CI run 39065356973 passed both checks and e2e for commit 7fb6c62.
- **Still open:** this is not a cross-device invariant. Two offline devices can independently add the same identifier; the generic per-record sync transaction does not atomically check other records. Do not claim server/global uniqueness until a dedicated safe uniqueness/conflict workflow is designed and tested.

### Dashboard numeric formatting — defensive mitigation
- formatMWK now returns 'Not recorded' for missing/non-finite values, and dashboard expenditure totals ignore non-finite totalCost values. The currency regression suite and E2E passed in run 39057561321; the E2E log no longer showed the previously observed toLocaleString TypeError.
- This is a targeted mitigation, not a manual Android reproduction or exhaustive proof of all dashboard paths. Revisit if the TypeError returns.


### Restricted import-source data boundary — hardening (2026-10-18)
- **Root cause:** `ImportAuditRecord.sourceData` could be included in an offline queue entry and written verbatim to `importAudits`, even though ordinary active staff can read that collection. The dedicated `persistImportAuditToFirestore` helper correctly splits source rows into `restrictedImportSources`, but the generic queue writer had not preserved that boundary for queued/legacy entries.
- **Fix on the Replit branch:** the final queue writer now removes `sourceData` from audit writes and idempotently writes it to `restrictedImportSources`; a retry refuses to overwrite a different restricted source record. Firestore rules reject new audit documents containing `sourceData` and deny ordinary staff reads of legacy audit documents that still contain that field. Regression coverage was added for the queue writer and rules.
- **Deployment prerequisite:** before deploying the revised rules, run `npx tsx scripts/repair-import-audit-source-data.ts` in an authorised Firebase Admin environment (dry run), review the counts, then run it with `--apply`. The migration moves source rows to the restricted collection and removes the embedded field in a transaction. If conflicts are reported, resolve them manually rather than overwriting either copy. Until legacy records are repaired, staff queries over `importAudits` may fail because documents containing embedded source data are intentionally unreadable to ordinary staff.
- **Verification boundary:** no production Firestore data was inspected or migrated from this session. Automated CI must pass before treating the code change as verified.


### Import audit write failure handling — follow-up (2026-10-18)
- `persistImportAuditToFirestore` previously caught Firestore errors and returned normally, allowing its import caller to proceed as though the audit had been saved. It now writes readable audit metadata and restricted source data in one Firestore batch and rethrows failures after updating sync status, so the caller cannot report success for a failed audit write.
- This narrows one false-success path but does not make the entire import transactional: separate salary-history/employee-audit side effects may already have committed before a later failure. The import manifest/resume/reconciliation design remains open.
- Validation status: committed for CI; no production import was executed from this session.


### Direct import-source collision protection — follow-up (2026-10-18)
- The direct import-audit writer now uses a Firestore transaction to read the restricted source before writing audit metadata. Replaying the same audit is idempotent; reusing an audit ID for different source content fails without overwriting the existing source or writing misleading audit metadata.
- Added regression coverage to `scripts/offline-sync.test.ts` for same-source retries and conflicting source reuse. This test uses a synthetic in-memory Firestore fake; GitHub Actions must still validate the committed change.


### Procurement workflow implementation — 2026-10-18
- Added approval validation for non-empty lists, positive quantities/prices, and three supplier quotes plus a selected preferred quote for items at or above the configured threshold (default MWK 500,000).
- The UI can select a quote, validate/approve, record an order reference, confirm receipt, and hand an invoice/receipt/voucher reference to finance. Failed local saves show an error.
- Firestore rules restrict status transitions and approval/order/finance metadata to managers/administrators. Staff can record receipt but cannot edit procurement details after approval.
- Remaining: no partial deliveries, per-item received quantities, purchase-order line documents, payment reconciliation, or cross-device supplier deduplication. CI verification pending.

- Approval validation retains the three-quote requirement when an originally missing/unclear price becomes quoted, preventing a single below-threshold quote from bypassing the price-discovery gate.
- The UI keeps the three-quote counter visible after selecting the first quote for an originally unpriced item, and the E2E test exercises that state transition.


## Administration export and stock-filter update (2026-10-29)

- Inventory & Stores now supports combined text, category, location, low-stock and expiry filters, plus Word (.docx), Excel (.xlsx) and PDF exports of the filtered register. The export mapping has a focused regression test wired into CI.
- Asset Register now filters by category, location, status and condition in addition to text search, shows matching-result counts and can clear all filters at once. Procurement lists now support search across titles, items, supplier quotes, PO and finance references, plus draft/approved/purchased status filtering. Asset register filters now include overdue service, service due within 30 days, expired warranties and warranties expiring within 30 days. Word (.docx), Excel (.xlsx) and PDF exports use the filtered register; the prior CSV path has been removed. Filtering and export mappings have focused tests wired into CI.
- Verification: run [#40843049949](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40843049949) passed the earlier administration changes. The asset category/location follow-up passed exact-head run [#40859874730](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40859874730) on `070a3b1f364282915791ddf6a7761785db9a582d`, including TypeScript, the new filtering test, production build and E2E job. Procurement search/status filtering then passed exact-head run [#40862102846](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40862102846) on `229e48071bacde174e8818f0cae22223577cb715`, including the new procurement filtering test, production build and E2E job. Asset maintenance/warranty filtering passed exact-head run [#40862541195](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40862541195) on `2e4fd2447b79855e98b5f433a5d86bcc5217fa23`. No manual Android/weak-signal test or production deployment was performed. No manual Android/weak-signal test or production deployment was performed.
- Additional verified administration improvements in the same code/test commit: operational-attention counts on the Administration Hub; document index category/record-type filters; Due soon and Cancelled compliance filters; general reports standardized on Excel; and safeguarding export removed. These do not close the broader ToR gaps listed above. Safe stock transfers, partial procurement deliveries/payment reconciliation, HR attendance/leave/onboarding, document versioning/expiry metadata, transport/logistics, independent compliance verification, and approved KPI definitions remain separate work items. No production deployment or live-data changes were made.


### Procurement module card accuracy (2026-10-29)
- The Administration Hub description now reflects the existing quote collection/selection, manager approval, purchase-order reference, receipt and finance handover steps. It no longer says formal approvals and stock receipt integration are wholly planned.
- Remaining procurement gaps are partial delivery quantities and reconciliation, a supplier master register/deduplication across devices, and payment reconciliation. Receiving inventory is not payment, and the Administration Officer must not gain payment authority.


### Asset verification follow-up filters (2026-10-29)
- The asset register now includes filters for not verified this year, verified this year, and latest verification outcome of discrepancy or not located. These combine with existing filters and exclude disposed assets from follow-up results. Synthetic regression coverage was added; exact-head CI verification is pending.


### Procurement receipt and finance stage filters (2026-10-29)
- Added list filters for purchased items awaiting receipt, received items awaiting finance handover, and items handed to finance, based on existing timestamps. This improves follow-up visibility but does not implement payment reconciliation or payment authority. Exact-head CI is pending.
