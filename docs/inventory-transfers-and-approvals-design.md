# Inventory transfers and approvals — design prerequisite

Status: transfer implementation remains design-only. The read-only location migration preflight audit is now implemented in the existing inventory snapshot audit; no backfill, transfer or approval workflow is claimed.

## Why the model must change

`InventoryItem` currently has one `location` and one aggregate `quantityOnHand`. The authenticated Worker commits that aggregate balance and an immutable `inventoryMovements` record together. A partial transfer cannot be represented accurately by changing the location label, and a separate issue plus receipt could lose or duplicate stock if one write fails.

## Read-only migration preflight audit delivered

The existing `npm run audit:inventory-snapshot -- <app-database-export.json>` command now also reports a location-migration preflight summary:
- Items with missing or unrecognized locations and missing or unrecognized units.
- Count of items preliminary candidates for a future single-location seed, requiring a recognized location, recognized unit and finite non-negative quantity.
- Quantity totals grouped by recognized location **and unit**; unlike units are never combined.
- Aggregate-only output: no item IDs, stock codes, staff names or other personal data are emitted, and the source snapshot is never modified.

This is only a read-only summary. It does not prove that current quantities reconcile to movement history, does not backfill location balances, and does not authorize transfers. Review an approved local database export and resolve all exceptions before considering migration.

## Confirmed SHINE approval policy

Confirmed by the Trust on 2026-11-07:

- Every stock transfer must be submitted as a request and approved before it can post to stock balances.
- Active Staff, Managers and Administrators may submit a transfer request, subject to the app's existing active-role checks.
- Only an active Manager or Administrator may approve or reject a request.
- The requester may not approve or reject their own request, even if they are a Manager or Administrator. A different eligible Manager or Administrator must act.
- A pending request does not reserve, issue or receive stock. Stock changes only when the approved transfer is posted atomically.
- Rejected requests remain auditable and do not change stock. A corrected transfer must be submitted as a new request with a new operation ID.

This policy defines who may approve; it does not define monetary/quantity thresholds or permit self-approval.

## Required invariants

- Each item has per-location balances; their sum equals the existing aggregate `quantityOnHand`.
- A transfer decreases the source and increases the destination by the same positive quantity in one server-side commit.
- Source balance cannot become negative; source and destination must differ.
- Request IDs are idempotent; reusing an ID with changed content is rejected.
- Pending approval is not a posted movement. Request, approval/rejection and posted ledger entries must be distinguishable.
- Server-side role checks and Firestore rules enforce approval transitions. View-only cannot submit or approve, and a requester cannot approve their own request unless a formally approved policy explicitly permits it.
- Keep the existing guard against changing an item's location until the transfer ledger exists.

## Safe implementation sequence

1. Add a read-only migration audit for legacy item location and quantity. Report malformed records and totals without personal data.
2. Dry-run and review the migration output. Do not infer missing locations or overwrite newer records.
3. Backfill one location balance per legacy item, idempotently; reconcile every aggregate before enabling transfers.
4. Add a Worker transaction that updates source and destination balances plus an immutable transfer movement atomically, using Firestore update-time preconditions and a request fingerprint.
5. Add a separate request/approval model and enforce status transitions in the Worker and Firestore rules using the confirmed policy above. Keep approval and posting separate; record requester, reviewer, decision time and reason, and reject self-approval server-side.
6. Add UI for per-location and total balances only after the server contract is ready.

## Required tests

Cover partial/full transfer, invalid quantities, insufficient stock, concurrent transfers, atomic source/destination/ledger writes, duplicate retry, changed-payload ID reuse, role enforcement, self-approval rejection, offline retry, migration idempotency, and regression of receipts, issues, stocktakes and procurement receipts.

Until this model and its tests exist, do not present transfers or approvals as working features.

## Remaining implementation gates

The approval-role decision is now settled. Transfers are still not ready to enable because the location-ledger migration and write-path safety work remain outstanding:

- Review a Trust-approved local database export with the read-only preflight; resolve missing/unrecognized location and unit exceptions before seeding balances.
- Inventory every write path, including normal UI edits, offline replay, imports, backup/restore and administrative scripts. A legacy writer must not bypass per-location balances or immutable movement history.
- Confirm the trusted Worker command contract and Firestore rules boundary before any client UI is enabled. Do not loosen rules as a fallback.
- Add idempotent migration and reconciliation tests before backfill; migration must be a dry-run first and must not infer missing locations or rewrite ambiguous balances.
- No transfer UI, production migration, rules deployment or live stock changes are authorized by this policy confirmation alone.
