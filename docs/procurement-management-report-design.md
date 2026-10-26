# Internal procurement management report — design proposal

**Status:** Design only; no report code or production behavior has changed.
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

The UI should make the selected date basis explicit: list creation date, approval date, order date, receipt acknowledgement date, or finance handover date. Do not mix these milestones under one ambiguous “date” filter. Lists with a missing selected milestone should be counted in a visible “missing date” bucket, not dropped silently. Define whether a list spanning the range is included by event date or by list-created date before implementation.

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

## Decisions needed before implementation

- Which milestone date is the default period basis, and should users be able to switch it?
- Should the first version be aggregates only, or is an item-level internal appendix required? Which supplier/PO/finance fields are approved for that appendix?
- Should recorded-vs-recomputed total differences block export, warn, or only appear as an exception count?
- What date and data-retention rules govern procurement export history?
- Who may export the internal report: existing Administrators and Managers, or Administrators only?

## Implementation boundary

A future implementation can add a pure procurement report assembler and synthetic tests in new files, then a distinct internal report view/export flow with exact role checks and report-history metadata. It should not change sponsor report assembly or inventory write/rule code. Implement only after the decisions above are resolved and the inventory/receipt linkage limitations are described accurately.
