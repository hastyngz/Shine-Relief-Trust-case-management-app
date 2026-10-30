# Internal procurement management report — design proposal

**Status:** Implemented on the `Replit` branch. Exact-head Actions runs `40421313882` and `40421743621` exposed two integration gaps: a runtime `Timestamp` import unsupported by the offline-sync test mock, and a missing reset-policy classification for the new history collection. Both are fixed: writes use native `Date` values, and operational resets preserve report history until its 90-day TTL. Local TypeScript, production build, report aggregate/export, procurement workflow, offline-sync, storage/reset-policy, Firestore emulator, and Firestore-access audit checks pass. Exact-head [Actions run 40422112084](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40422112084) on `13c25a1` passed both the checks and E2E jobs. Production use remains blocked until the Firestore TTL policy is configured and release gates are satisfied. No production deployment or data mutation has occurred.
**Audience:** Internal Administrators and Managers only, subject to the existing `canAccessManagementDashboard` gate.
**Explicit exclusion:** Do not add procurement records, supplier quotes, purchase orders, or finance references to Sponsor, Donor, or Trustee exports.
**Inventory boundary:** A `receivedAt` value is only a procurement workflow timestamp. Until the server-validated inventory movement flow is complete and linked, it is not proof that stock was posted or reconciled.

## Problem and proposal

The current report builder is centered on the Sponsor/Donor/Trustee programme report and its audience-specific narrative. Procurement exists separately in `AppDatabase.procurementLists`, but there is no distinct internal purchasing/approval/receipt/finance-handover summary.

Add a separate **Procurement Operations Report** type, assembled from procurement lists only and offered to Administrators and Managers as an internal report. Keep its data assembly and export audit type separate from `assembleSponsorReport` and `reportType: 'sponsor-donor'`. It must never inherit donor-facing narratives, donor quality boilerplate, or donor audience settings.

## Data source and scope

Use `procurementLists` as the source of record. Current records include list metadata, programme, item rows, recorded totals, list status (`draft`, `approved`, `purchased`), quote and selected-supplier fields, and optional approval, purchase-order, receipt and finance-handover timestamps/references.

Do not combine inventory balances/movements into this report until the inventory transaction implementation is validated and procurement receipt has a trustworthy link to the resulting immutable movement ID. Do not infer an absent milestone from another timestamp, list status, or a UI label.

## Suggested report contents

Default to aggregate and operational figures for a selected period and optional programme:

- Counts and recorded MWK totals by list status.
- Lists awaiting approval, purchase order, receipt acknowledgement, or finance handover, using explicit milestone fields and documented transition rules.
- Counts of item rows by price status (`quoted`, `missing`, `unclear`), and counts requiring a quote under the recorded threshold/reason.
- Recorded list totals alongside recomputed item totals and a variance count/amount; flag inconsistencies instead of silently choosing one value.
- Approved/ordered/received/handed-over counts with milestone-date coverage and an “unknown or incomplete” bucket.
- Quote-comparison exceptions: missing required quote, absent selected quote, selected supplier/amount not matching a stored quote, and duplicate suppliers where distinct quotes are required.
- Programme subtotals only where programme IDs resolve safely; unresolved programme IDs must be counted separately rather than guessed.

A detailed internal appendix, if later required, should be opt-in and limited to fields approved by the report owner (for example item descriptions, PO reference, selected supplier). Exclude free-text `purpose`, item notes, quote notes, personal identities, and unrestricted raw records by default. Avoid unnecessary staff names or emails in an aggregate export.

## Period rules

The UI makes the selected date basis explicit: list creation date, approval date, order date, receipt acknowledgement date, or finance handover date. The inclusive range is evaluated against that selected milestone's stored date. Lists with a missing or invalid selected milestone are counted in a visible “missing date” bucket and excluded from period totals when a range is active; with no date bounds, all lists are included.

## Authorization, privacy, and audit

- Reuse the existing Admin/Manager management-dashboard authorization check, and independently enforce it at the report-generation/export handler. View Only and Staff must not be granted access by hiding a button alone.
- Use a report title/type distinct from the sponsor/donor report, such as `Procurement Operations Report` and `management-procurement`.
- Record export history with actor UID, time, filters/date basis, output format, and aggregate/list counts. Avoid placing raw supplier quotes, free-text notes, or sensitive procurement payloads in general report logs.
- Make the report visibly marked **Internal — not for Sponsor/Donor distribution** in the on-screen view and every downloaded format.
- No AI or external provider is involved.

## Integrity and limitations

The report should be observational; it must not repair procurement rows, approve lists, mark receipts, change finance-handover fields, or create inventory movements. Display recorded totals as recorded and show discrepancies explicitly. Receipt acknowledgement must carry a limitation note until it links to a server-committed inventory movement. The report is not proof of physical delivery, stock balance, expenditure payment, or supplier settlement.

## Focused regression plan

Use synthetic procurement fixtures only. Cover:

1. Aggregate counts/totals by status, programme, and chosen milestone date.
2. Missing/invalid dates, unresolved programme IDs, empty lists, and date-boundary inclusion.
3. Recorded-vs-recomputed total discrepancies and line items with missing/unclear prices.
4. Quote-threshold exceptions, distinct-supplier requirements, and selection that does not match a recorded quote.
5. A `receivedAt` timestamp without an inventory movement link is labelled as acknowledgement only, never as stock received/reconciled.
6. Role rejection for Staff/View Only at both view and export boundaries; Admin/Manager allowed.
7. Exports, filenames, report history, and all output formats carry the internal-only classification and never appear as sponsor/donor report data.
8. No mutation of source procurement or inventory fixtures.

## Approved product defaults

The owner approved the following defaults on 2026-10-27: list creation date is the initial period basis, with an explicit selector for approval, order, receipt-acknowledgement, or finance-handover date; the first version is aggregate-only; total discrepancies are warnings and do not block export; Administrators and Managers may view and export; and export-history metadata expires after 90 days.

## Implementation status

- Added a distinct Procurement Operations Report entry under Management Reports. Its assembler reads procurement lists only and emits aggregate rows; it does not call `assembleSponsorReport` or add procurement values to Sponsor/Donor/Trustee exports.
- Added CSV, XLSX, and DOCX outputs. Each output is labeled **Internal — not for Sponsor/Donor distribution** and excludes item descriptions, supplier names, free-text notes, staff identities, and raw records. CSV formula-like cells are escaped.
- Added a dedicated `/managementProcurementReportHistory` collection. The client checks the existing Admin/Manager management gate at the report view and export handler; Firestore rules independently restrict history reads/creates to Admins and Managers, enforce actor UID and a bounded 90-day `expiresAt`, deny expired reads, reject extra payload fields, and make records immutable.
- History records contain only actor UID, generation time, selected date basis/range/programme filter, output format, selected-list count, aggregate-row count, and expiry. The generated report file is not archived.
- Synthetic unit tests cover aggregate results, source non-mutation, and parsed output from all three formats for the internal label and absence of item/supplier details. Firestore emulator tests cover role rejection on the audit collection, extra fields, expiry bounds, expired reads, and immutability. The explicit React view/handler gate is not yet covered by a dedicated UI integration test.

## Release gate and limitations

The Firestore TTL policy for collection group `managementProcurementReportHistory` must be enabled on field `expiresAt` before production use. The rules make expired records unreadable immediately, but physical deletion depends on the database TTL policy; no live Firebase configuration was changed here. Receipt timestamps remain acknowledgements only, not inventory movements or proof of stock, payment, or settlement. The report is observational and does not modify procurement or inventory records. Exact-head CI, deployment controls, backup, and production release gates remain separate requirements.
