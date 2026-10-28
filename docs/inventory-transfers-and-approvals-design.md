# Inventory transfers and approvals — design prerequisite

Status: design only; no transfer implementation is claimed.

## Why the model must change

`InventoryItem` currently has one `location` and one aggregate `quantityOnHand`. The authenticated Worker commits that aggregate balance and an immutable `inventoryMovements` record together. A partial transfer cannot be represented accurately by changing the location label, and a separate issue plus receipt could lose or duplicate stock if one write fails.

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
5. Add a separate request/approval model and enforce status transitions in the Worker and Firestore rules. The Trust must first confirm which movements require approval and which roles may approve; do not invent thresholds.
6. Add UI for per-location and total balances only after the server contract is ready.

## Required tests

Cover partial/full transfer, invalid quantities, insufficient stock, concurrent transfers, atomic source/destination/ledger writes, duplicate retry, changed-payload ID reuse, role enforcement, self-approval rejection, offline retry, migration idempotency, and regression of receipts, issues, stocktakes and procurement receipts.

Until this model and its tests exist, do not present transfers or approvals as working features.