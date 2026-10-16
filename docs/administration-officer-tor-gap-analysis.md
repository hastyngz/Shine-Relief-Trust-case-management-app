# Administration Officer ToR — SHINE implementation gap analysis

**Scope:** Code-level review of the existing `Replit` branch. This document distinguishes implemented entry points from complete end-to-end workflows. A route or screen is not proof that the underlying workflow is fully integrated, secure, or production-verified.

## Existing foundations confirmed in code

| ToR responsibility | Existing implementation | Status and limits to preserve |
|---|---|---|
| Inventory and stores | `src/components/InventoryView.tsx`, `src/utils/inventory.ts`, `InventoryItem` / `InventoryMovement` types, local database persistence and normal sync path | **Partially implemented.** Item registration, opening balance, received/issued movements, stocktake adjustment, minimum-stock alerts, expiry alerts and per-item history exist. Location-to-location quantity transfers and formal issue/adjustment approvals are not implemented. Stock-code uniqueness is checked in the client, not yet confirmed as a server-enforced invariant. |
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
- A pre-existing reset-recovery marker also blocks restore until the administrator completes recovery. This avoids using a backup restore to accidentally unlock an incomplete destructive reset.
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
