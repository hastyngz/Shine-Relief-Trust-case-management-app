# Administration Officer ToR — SHINE implementation gap analysis

**Scope:** Code-level review of the existing `Replit` branch. This document distinguishes implemented entry points from complete end-to-end workflows. A route or screen is not proof that the underlying workflow is fully integrated, secure, or production-verified.

## Existing foundations confirmed in code

| ToR responsibility | Existing implementation | Status and limits to preserve |
|---|---|---|
| Inventory and stores | `src/components/InventoryView.tsx`, `src/utils/inventory.ts`, `InventoryItem` / `InventoryMovement` types, local database persistence and normal sync path | **Partially implemented.** Item registration, opening balance, received/issued movements, stocktake adjustment, minimum-stock alerts, expiry alerts and per-item history exist. Location-to-location quantity transfers and formal issue/adjustment approvals are not implemented. Stock-code uniqueness is checked in the client, not yet confirmed as a server-enforced invariant. |
| Asset register | `src/components/AssetRegisterView.tsx`, `AssetRecord` / `AssetHistoryEntry` types, maintenance dialog and asset export tests | **Partially implemented.** Asset records include tags, category, cost, location, assignee, condition/status, warranty/service dates and history. Physical verification campaigns and verified coverage metrics need a distinct workflow. |
| Procurement | `ProcurementList` / `ProcurementListItem` / `ProcurementQuote` types and existing planning workflow | **Partial.** Lists and quote capture exist. A full request → delegated approval → quote comparison/selection rationale → purchase order → partial delivery/receipt → finance handover workflow is not established by the current UI. Do not mark a purchase as paid merely because goods arrived. |
| Staff and personnel | Staff management, employee records, payroll, contracts and salary history | **Existing foundations; partial ToR coverage.** Reuse the same employee identity and link payroll to the employee profile. Attendance, leave, onboarding checklists, training/policy acknowledgements and structured performance reviews still need assessment/implementation. Sensitive HR documents must not become visible to every staff role. |
| Meetings and follow-up | Meeting records, minutes/transcription fields, extracted action IDs, schedules, workplans and operations view | **Existing foundations; integration to verify.** Ensure meeting decisions create traceable tasks/action items with owner, deadline, evidence, status and history rather than duplicate task stores. |
| Reporting | Reports/export, report builder, programme/workplan/budget data | **Existing foundations; partial administrative reporting.** A monthly Administration Officer report should draw from actual records, show missing data, and never fabricate completed work or imply that incomplete records are complete. |
| Document ingestion | Existing import/document-ingestion workflow and attachment metadata/storage services | **Not equivalent to central Document & Filing.** Ingestion helps process source files; it does not itself provide a cross-organisation filing register with metadata search, record links, versioning, expiry tracking and role-aware retrieval. Avoid a second upload/storage mechanism; build on existing private attachment storage where its authorization model supports the target. |
| Compliance calendar | Existing schedules/calendar concepts and contract date fields | **Partial.** Dates and schedules exist, but a managed register of obligations with owner, recurrence, due date, evidence, review/approval and completion history needs a dedicated workflow or carefully extended existing records. |
| Suppliers | Supplier names are currently available in inventory/procurement fields | **Partial.** A reusable supplier/service-provider register with quotation/purchase history, documents, delivery performance and declared conflicts is not established. |
| Finance administration | Budgets, expenses, payroll, procurement lists and financial reports | **Partial.** Missing-document checks, commitments vs actuals vs unpaid invoices, and a properly reconciled petty-cash workflow need explicit models and permissions. Never count internal stock issues as new expenditure. |
| Transport and logistics | General schedules and operational planning | **Gap.** No confirmed dedicated vehicle/driver register, trip log, odometer/fuel, service and repair workflow. |
| Safeguarding administration | Existing safeguarding APIs/rules and per-staff permissions | **Sensitive existing foundation.** New administration search, AI, reports and exports must not bypass the existing authorization boundary. Add policy/training acknowledgement tracking and a restricted referral/reporting route without giving general administration staff investigation powers. |
| Organisational performance | Existing management/quality/reporting views | **Partial.** ToR indicators require explicit, agreed denominators, reporting periods, exclusions and source records. Asset coverage must compare verified physical assets with registered assets, not simply count database rows. |

## Implementation sequence

### Workstream 1 — Documents & Filing (next)
1. Inventory existing attachment metadata, upload/download authorization, private storage paths, supported target types and deletion/version behaviour before adding UI.
2. Provide a searchable index of documents already accessible to the logged-in user; filter at the authoritative data boundary, not only in the UI.
3. Support useful metadata (title, category, reference, date, owner, linked record, confidentiality classification and optional expiry date) without copying file bytes or creating duplicate uploads.
4. Link existing documents to procurement, assets, staff/contract records, meetings, reports and finance records where permissions allow.
5. Add version history only with explicit retention semantics; never silently replace an approved policy or destroy the previous version.
6. Exclude safeguarding and restricted health/child documents from general search unless the current user is specifically authorized. Avoid broad collection reads that return records the user cannot access.
7. Add tests for authorization, missing/deleted files, unsupported types, metadata search, mobile layout, and offline/error states.

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
