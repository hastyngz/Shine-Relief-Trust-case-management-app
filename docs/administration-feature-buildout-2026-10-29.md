# Administration feature build-out — task report

**Date:** 2026-10-29  
**Repository:** `hastyngz/Shine-Relief-Trust-case-management-app`  
**Branch:** `Replit`  
**Scope:** Administration Hub operational indicators, inventory and asset register filtering/exports, general report export consistency, document filing filters, compliance status filters, safeguarding export boundary, and regression coverage.  
**Status:** Application code and regression tests passed exact-head GitHub Actions run [#40843049949](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40843049949) on code/test commit `14d43246f195d709a783b4cf3ab11bbcd2388de7`. This report update is documentation-only. The entire Administration Officer ToR is not yet complete.

## User requirements and constraints

- Keep work on `Replit`; do not modify `main`, create a branch or open a PR.
- Exports must be Word (.docx), Excel (.xlsx) or PDF. Do not offer CSV.
- Preserve the existing permission boundaries, local persistence, stock movement integrity and offline sync architecture.
- Do not claim tests pass unless the checks actually ran and passed.

## Implemented in this task

### Inventory & Stores

- Combined search with category, storage-location, low-stock and expiry filters, result counts, empty-state guidance and clear-filters support.
- Word, Excel and PDF exports for the currently filtered stock register.
- Excel output includes a filter row and adjusted column widths; PDF uses a landscape table; Word output is a document table.
- Export controls disable when there are no matching items or an export is already running, and the UI reports success/failure.
- Added a shared export column mapping test and CI step.

### Asset Register

- Replaced the previous CSV export utility with Word, Excel and PDF exports.
- Exports use the current search/status/condition filtered list and share one tested column mapping.
- Added progress/disabled state and visible error/success feedback.
- Updated the CI step to test the supported export mapping; no CSV export is intended.

### General reporting exports

- The legacy report export centre now creates Excel workbooks instead of CSV files while retaining the existing role/record filters. Sponsor/donor report export was changed to XLSX with its quality annex, and the duplicate management CSV button was removed because the Excel workbook export already includes all rows and quality findings.
- Visible export labels now say Excel; no CSV download is intended in the Administration/Reports workflows. Existing stored CSV report-history entries remain legacy metadata and are not rewritten.

### Correctness follow-up

- CI identified that the inventory component imported the export function from the wrong utility module. The import was corrected to `src/utils/inventoryExport.ts`.
- The earlier inventory expiry-filter fixture was corrected so the expected result includes all items expiring within the tested 30-day window.

## Files changed in this workstream

- `src/components/AdministrationHub.tsx`
- `src/components/InventoryView.tsx`
- `src/components/AssetRegisterView.tsx`
- `src/components/ComplianceCalendarView.tsx`
- `src/components/DocumentsFilingView.tsx`
- `src/components/Reports.tsx`
- `src/components/Reports/ReportBuilder.tsx`
- `src/components/Reports/ManagementReportsPanel.tsx`
- `src/components/SafeguardingView.tsx`
- `src/utils/administrationOverview.ts`
- `src/utils/compliance.ts`
- `src/utils/documentFiling.ts`
- `src/utils/inventoryExport.ts`
- `src/utils/assetExport.ts`
- `src/utils/export.ts`
- `scripts/administration-overview.test.ts`
- `scripts/administration-hub.test.ts`
- `scripts/compliance-calendar.test.ts`
- `scripts/document-filing.test.ts`
- `scripts/inventory-export.test.ts`
- `scripts/asset-export.test.ts`
- `scripts/inventory.test.ts`
- `scripts/report-export.test.ts`
- `scripts/safeguarding-export-boundary.test.ts`
- `scripts/phase3d-management.test.ts`
- `e2e/sensitive-data-access.spec.ts`
- `package.json`
- `.github/workflows/shine-checks.yml`
- `AGENT_BOARD.md`
- `docs/administration-officer-tor-gap-analysis.md`
- `docs/administration-feature-buildout-2026-10-29.md`

### Procurement module status copy

- Updated the Administration Hub procurement card to accurately describe existing quote collection/selection, manager approval, purchase-order reference, receipt and finance handover. Supplier master data, partial deliveries and payment reconciliation remain gaps.

### Administration hub operational overview

- Added an operational attention strip with counts for low stock, stock expiry within 30 days, assets needing follow-up, overdue compliance obligations and open procurement lists. Each card opens the relevant existing workflow.
- Counts are derived from the current local database snapshot, and the UI explicitly warns that zero is not proof that unsynchronised or unrecorded work is absent. The summary excludes disposed assets and ignores invalid date values. Added focused synthetic-data tests and CI wiring.

### Report export consistency and safeguarding boundary

- Kept the shared Excel downloader dynamically imported to preserve lazy-loading and bundle-size boundaries. General report buttons now catch failures and display accessible success/error feedback instead of leaving an unhandled promise rejection.
- Added a CI regression test that prevents a safeguarding export button or download helper from reappearing, and added a focused Excel download test. The first run of `phase3d-management.test.ts` exposed a fixture that omitted the required attachment consent flag, so the photo was correctly excluded from the generated report. The synthetic report fixtures now explicitly include consent, and the comprehensive management/report test has been restored as a CI gate alongside the focused XLSX test.

- Renamed the shared report-download helper to `downloadExcel` and updated the general report centre's function names/visible labels to Excel; its generated file is an `.xlsx` workbook, not CSV.
- Removed the safeguarding-record export button entirely. Safeguarding cases remain restricted to the permission-checked server endpoint and must not be exported, included in general reports or sent to AI, in line with `AGENTS.md`.
- Updated the management regression test to assert the XLSX MIME type and `.xlsx` filename rather than the old CSV data URI.

### Documents & Filing follow-up

- Added category and linked-record-type filters to the existing permission-aware attachment index, plus a one-tap clear-all action. Filter options are derived only from the accessible attachment set returned by the existing service; this does not widen health or safeguarding access.
- Added focused synthetic-data tests for search, file type, category, linked record type and empty results, and wired them into CI.

### Compliance & Deadlines follow-up

- Added explicit Due soon and Cancelled filters to the compliance register, sharing the same date/status rules as the summary counts. Regression coverage includes overdue, due-soon, completed, cancelled and open states.
- Updated the sensitive-data end-to-end test selectors to match the new Excel export labels; the existing test had been waiting for the old CSV button name, causing the previous E2E job to time out even though the checks job passed.

## Verification

- **Passed:** GitHub Actions run [#40843049949](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40843049949) on code/test commit `14d43246f195d709a783b4cf3ab11bbcd2388de7`. Both the `checks` and `e2e` jobs succeeded.
- **Checks job:** TypeScript, administration overview and navigation tests, document filing filters, compliance logic, safeguarding export boundary, Excel report-download test, comprehensive Phase 3D management/report generation test, existing procurement/payroll/offline/security/rules tests, Firestore access audit, and production build passed.
- **Browser E2E:** 10/10 tests passed, including offline app-shell caching, compliance registration/completion, quote collection, account isolation, offline conflict handling, offline write durability, and the ordinary-staff sensitive-data restriction test.
- Earlier failures were corrected before this passing run: the inventory export import pointed to the wrong module; the management report photo fixtures omitted `consent: true`; and the asynchronous Excel download assertion needed to be awaited.
- Local `npm run lint` and `npm run build` were not run separately because a working local checkout was unavailable; the CI equivalents passed.
- No manual Android/weak-signal test was performed.
- No production deployment, Firebase rule change, or live-data operation was performed.

## Broader administration work still outstanding

This is a focused completed code change, not a claim that all administration features are fully built. The ToR gap analysis remains the source of truth for the wider backlog. Important items still needing separate implementation and verification include:
- Safe location-to-location stock transfers and formal approvals, requiring a per-location balance model and atomic server-side transfer ledger.
- Full procurement request/approval/quote/order/partial receipt/finance handover and payment reconciliation.
- Staff attendance, leave and onboarding, while keeping confidential HR records restricted.
- Complete filing metadata/versioning across supported record types.
- Dedicated transport/logistics workflow.
- Management KPI definitions and a reconciled administration/finance report.

## Release decision

The implemented changes listed above passed automated CI, but the broader Administration Officer ToR remains incomplete. Do not treat the outstanding workflows below as operational, and do not infer that a manual Android/weak-signal check or production deployment occurred.
