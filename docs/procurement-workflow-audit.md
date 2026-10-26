# Procurement and upload workflow integrity audit

**Reviewed:** 26 October 2026, on the Replit branch based on `9173d5f`.

## Findings

### Procurement receipt and inventory

The current **Confirm goods received** action writes only `receivedAt` and `receivedBy` to the procurement list. It does not create an inventory receipt or stock movement, and the inventory collection is not updated. The Administration Hub also describes stock receipt integration as planned. This is a real gap, but it must not be repaired by adding client-only balance writes: receipt posting needs to use the server-enforced, idempotent inventory operation established by the P0 inventory-integrity work.

### Approval integrity

The UI calls `checkProcurementApproval` before a Manager/Admin approves a list. The Firestore rule currently checks that an approval has at least one item and approval metadata, but it cannot enforce the per-item three-distinct-quotes and selected-quote checks; a privileged direct Firestore write can bypass the UI check. The current change strengthens the shared UI validator and imported data normalization, but does **not** claim that quote approval is server-enforced. If the quote gate must be non-bypassable, route approval through a trusted server transaction and then disallow direct client approval transitions.

### Reporting

The existing sponsor/donor `ReportBuilder` and report generator do not include procurement lists or receipt/finance status. That report is intentionally limited to sponsor programme summaries; adding supplier and purchase details there would mix internal operational data into a donor-facing artifact. A separate management-only procurement report/export needs a defined scope (for example, item totals, quote comparison, purchase-order status, receipt status and finance handover) before implementation.

### Import validation

The procurement import branch previously copied extracted item objects directly into the database and summed supplied `totalMWK` values without runtime shape checks or consistency checks. The current patch adds normalization before batch-side effects: it validates descriptions, positive quantities, units, money fields, quote records and duplicate suppliers, computes totals, and rejects inconsistent totals. Imported lists remain drafts and unpriced items remain explicitly marked for review.

### File uploads

The authenticated storage endpoint previously checked role, path/target, non-empty body and a 50 MB maximum, but accepted arbitrary declared content types and did not compare them with the uploaded bytes. Since the download endpoint returns stored content types, that allowed type spoofing. The current patch adds client-side type/size feedback and trusted server-side allowlists plus file-signature checks for attachments (JPEG, PNG, WebP, PDF) and archived reports (PDF, DOCX, XLSX, CSV). Existing authentication, health-record permission, target ownership and path checks remain in place. Signature checks are not malware scanning; client `accept` attributes are only a usability aid, not the security boundary.

## Changes committed

Commit [`cee3eef`](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/commit/cee3eef) updates `src/services/procurementWorkflow.ts`, `src/services/importService.ts`, `server.ts`, `src/services/attachmentService.ts`, the attachment picker components, `package.json`, and focused tests. The procurement UI now requires three distinct supplier names and a selected quote that matches the recorded quote. Import rows and list metadata are validated before batch side effects; invalid quantities, prices, totals, duplicate suppliers, and unknown programme references are rejected.

**Checks passed** against the source state committed as `cee3eef`: `git diff --check`, `npm run lint`, `npm run test:procurement`, `npm run test:storage-upload-validation`, `npm run test:phase2`, and `npm run build`. The build still reports the repository's existing large-chunk advisory; it completes successfully.

## Not changed

No inventory balances or stock movements are written from the receipt button. No procurement data is added to the sponsor/donor report. No existing role grants are broadened. The server-authoritative approval transition, inventory receipt transaction, and management-report scope remain follow-up work requiring their respective trust-boundary and reporting decisions.
