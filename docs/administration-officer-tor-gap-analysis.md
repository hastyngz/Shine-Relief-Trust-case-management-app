# Administration Officer ToR — SHINE implementation gap analysis

**Scope:** Code-level review of the existing `Replit` branch. This document distinguishes implemented entry points from complete end-to-end workflows. A route or screen is not proof that the underlying workflow is fully integrated, secure, or production-verified.

## Existing foundations confirmed in code

| ToR responsibility | Existing implementation | Status and limits to preserve |
|---|---|---|
| Inventory and stores | `src/components/InventoryView.tsx`, `src/utils/inventory.ts`, `InventoryItem` / `InventoryMovement` types, local database persistence and normal sync path | **Partially implemented.** Item registration, opening balance, received/issued movements, stocktake adjustment, minimum-stock alerts, expiry alerts and per-item history exist. Location-to-location quantity transfers and formal issue/adjustment approvals are not implemented. Stock-code uniqueness is checked in the client, not yet confirmed as a server-enforced invariant. |
| Asset register | `src/components/AssetRegisterView.tsx`, `AssetRecord` / `AssetHistoryEntry` types, maintenance dialog and asset export tests | **Partially implemented.** Asset records include tags, category, cost, location, assignee, condition/status, warranty/service dates and history. A per-asset physical verification action now records who checked it, date, outcome, observed location/condition and a history entry without silently changing the register. The dashboard counts assets located this year and registered active assets not checked this year. This denominator is only the assets already registered in SHINE; organisation-wide campaigns to identify unregistered property and independently verify the complete asset population remain outstanding. |
| Procurement | `ProcurementList` / `ProcurementListItem` / `ProcurementQuote` types and existing planning workflow | **Partial.** Lists and quote capture exist. A full request → delegated approval → quote comparison/selection rationale → purchase order → partial delivery/receipt → finance handover workflow is not established by the current UI. Do not mark a purchase as paid merely because goods arrived. |
| Staff and personnel | Staff management, employee records, payroll, contracts and salary history | **Existing foundations; partial ToR coverage.** Reuse the same employee identity and link payroll to the employee profile. Attendance, leave, onboarding checklists, training/policy acknowledgements and structured performance reviews still need assessment/implementation. Sensitive HR documents must not become visible to every staff role. |
| Meetings and follow-up | Meeting records, minutes/transcription fields, extracted action IDs, schedules, workplans and operations view | **Existing foundations; integration to verify.** Ensure meeting decisions create traceable tasks/action items with owner, deadline, evidence, status and history rather than duplicate task stores. |
| Reporting | Reports/export, report builder, programme/workplan/budget data | **Existing foundations; partial administrative reporting.** A monthly Administration Officer report should draw from actual records, show missing data, and never fabricate completed work or imply that incomplete records are complete. |
| Document ingestion / filing | Existing import workflow, private R2 attachment storage and `src/components/DocumentsFilingView.tsx` | **Phase 1 index implemented; full filing still partial.** The new index searches accessible existing attachments by filename, caption, category, date, uploader and linked record; it downloads through the authenticated storage client and links supported records back into SHINE. It reuses the existing attachment store, excludes safeguarding attachments and respects health-record query permissions. It is not yet a complete organisation-wide filing register: staff/contracts, procurement, assets, meetings and finance targets are not all supported by the attachment model; title/reference/expiry/confidentiality metadata and controlled version history remain to be implemented. |
| Compliance calendar | `src/components/ComplianceCalendarView.tsx`, optional compliance metadata on existing `ScheduleItem` records and existing schedule persistence/sync | **Phase 1 implemented, with offline write path corrected and browser flow covered.** Staff can register an obligation, assign an active staff owner, set category/priority/recurrence/due date, filter/search records, mark work in progress, record completion notes/evidence, and retain an event history. `e2e/compliance-calendar.spec.ts` now exercises staff registration and completion in the production-built browser app. Schedule creation/updates/deletions now rely on SHINE's per-record offline queue rather than issuing a parallel direct `setDoc`, so the queue's baseline/conflict checks can protect the record. Independent manager verification is not yet enabled because existing shared schedule write permissions do not enforce manager-only verification at the database boundary; the UI explicitly discloses this limitation. The embedded history is operational context, not an immutable server-authenticated audit log, so it is not sufficient alone as formal audit evidence. Overdue/due-within-30-days indicators are calculated from device-local date-only values. Recurrence is recorded but does not yet auto-create the next occurrence; notifications, contract/staff-document links and recurring task generation remain outstanding. Since the shared schedule collection is readable by all active staff, do not put confidential HR, financial or child-related details in these general obligations. |
| Suppliers | Supplier names are currently available in inventory/procurement fields | **Partial.** A reusable supplier/service-provider register with quotation/purchase history, documents, delivery performance and declared conflicts is not established. |
| Finance administration | Budgets, expenses, payroll, procurement lists and financial reports | **Partial.** Missing-document checks, commitments vs actuals vs unpaid invoices, and a properly reconciled petty-cash workflow need explicit models and permissions. Never count internal stock issues as new expenditure. |
| Transport and logistics | General schedules and operational planning | **Gap.** No confirmed dedicated vehicle/driver register, trip log, odometer/fuel, service and repair workflow. |
| Safeguarding administration | Existing safeguarding APIs/rules and per-staff permissions | **Sensitive existing foundation.** New administration search, AI, reports and exports must not bypass the existing authorization boundary. Add policy/training acknowledgement tracking and a restricted referral/reporting route without giving general administration staff investigation powers. |
| Organisational performance | Existing management/quality/reporting views | **Partial.** ToR indicators require explicit, agreed denominators, reporting periods, exclusions and source records. Asset coverage must compare verified physical assets with registered assets, not simply count database rows. |

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
