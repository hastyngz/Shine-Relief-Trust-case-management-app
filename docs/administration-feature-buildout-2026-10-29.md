# Administration feature build-out — task report

**Date:** 2026-10-29  
**Repository:** `hastyngz/Shine-Relief-Trust-case-management-app`  
**Branch:** `Replit`  
**Scope:** Administration & Operations follow-up: inventory filtering and register exports, asset register export formats, regression coverage and status documentation.  
**Status at writing:** Changes committed; exact-head CI pending. This report does not claim the entire Administration Officer ToR is complete.

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

- `src/components/InventoryView.tsx`
- `src/utils/inventoryExport.ts`
- `scripts/inventory-export.test.ts`
- `src/components/AssetRegisterView.tsx`
- `src/utils/assetExport.ts`
- `scripts/asset-export.test.ts`
- `scripts/inventory.test.ts`
- `.github/workflows/shine-checks.yml`
- `AGENT_BOARD.md`
- `docs/administration-officer-tor-gap-analysis.md`

### Administration hub operational overview

- Added an operational attention strip with counts for low stock, stock expiry within 30 days, assets needing follow-up, overdue compliance obligations and open procurement lists. Each card opens the relevant existing workflow.
- Counts are derived from the current local database snapshot, and the UI explicitly warns that zero is not proof that unsynchronised or unrecorded work is absent. The summary excludes disposed assets and ignores invalid date values. Added focused synthetic-data tests and CI wiring.

### Report export consistency and safeguarding boundary

- Made the shared Excel downloader synchronous after importing the already-used `xlsx` dependency in the report route. This avoids unhandled promise rejections from existing click handlers after changing the former CSV download into an XLSX generator.
- Added a CI regression test that prevents a safeguarding export button or download helper from reappearing, and wired the existing management report generation test into CI.

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

- GitHub Actions run `40786347247` exposed a real TypeScript/build error: `exportInventoryRegister` was imported from `src/utils/inventory.ts`, where it is not exported. This was corrected in a later commit.
- The newest observed exact-head Actions run at report time was `40792178782`, for commit `1176dc366ff119b0f3d657af0242c5fa4a36dbb7`; it was still pending when checked. It is **not a pass**.
- Local `npm run lint`, focused tests and `npm run build` were not run in this session because a working local repository checkout was unavailable.
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

Do not describe these export changes as verified until the exact current `Replit` head passes TypeScript, the relevant export and inventory tests, production build and applicable E2E checks. Do not deploy automatically from this report.
