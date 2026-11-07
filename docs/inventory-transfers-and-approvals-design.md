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

## Writer-path review findings (2026-11-07)

A first source review confirms that inventory records have more than one persistence route:

- Normal item metadata edits call `saveInventoryItem`, persist locally, then flow through the shared offline change queue.
- The offline queue maps `inventoryItems` to the Firestore `inventoryItems` collection and sends changed records through the normal change-entry writer.
- Full database synchronization includes inventory records in its batched Firestore writes.
- Backup restore normalizes and restores the `inventoryItems` array through that full-database path; restore is blocked when offline changes are pending or queue state cannot be verified.
- Procurement receipts use the authenticated Worker movement endpoint and a stable per-line operation ID; they must continue to post atomically with the procurement receipt ledger.
- Existing Firestore rules protect quantity, embedded movements and `lastMovementId` from ordinary client edits, but the general metadata-update branch does not itself prohibit a direct client change to the legacy `location` field. The UI currently keeps the location unchanged while editing an existing item, but that UI guard is not a security boundary for imports, restore or other callers.

Consequences for the transfer migration:

1. The future location-balance and transfer fields must be excluded from generic client metadata updates, not merely hidden or disabled in the UI.
2. Backup/restore and offline replay need an explicit migration-aware policy so an old snapshot cannot overwrite newer per-location balances or transfer history.
3. Procurement receipt posting must seed/add stock at an explicit destination location after the new location ledger is authoritative; it cannot silently use an old single-location aggregate.
4. Legacy location edits must be rejected server-side once the migration path is introduced. No direct Firestore rules change is made in this review.

## Remaining implementation gates

The approval-role decision is now settled. Transfers are still not ready to enable because the location-ledger migration and write-path safety work remain outstanding:

- Review a Trust-approved local database export with the read-only preflight; resolve missing/unrecognized location and unit exceptions before seeding balances.
- Inventory every write path, including normal UI edits, offline replay, imports, backup/restore and administrative scripts. A legacy writer must not bypass per-location balances or immutable movement history.
- Confirm the trusted Worker command contract and Firestore rules boundary before any client UI is enabled. Do not loosen rules as a fallback.
- Add idempotent migration and reconciliation tests before backfill; migration must be a dry-run first and must not infer missing locations or rewrite ambiguous balances.
- No transfer UI, production migration, rules deployment or live stock changes are authorized by this policy confirmation alone.


## Migration-aware target architecture (reviewed 2026-11-07)

This section records a proposed implementation boundary, not deployed infrastructure or an approved migration.

### Authoritative records

- Keep `inventoryItems/{itemId}` as the item catalogue and compatibility aggregate. Its `quantityOnHand` remains the sum of all location balances; a transfer must not change this aggregate.
- Add a canonical `inventoryLocations/{locationId}` registry. Use stable IDs and an explicit active/inactive state; do not use free-text location names as document IDs or infer that two differently spelled labels are the same place.
- Add `inventoryLocationBalances/{balanceId}` records keyed by a deterministic, collision-safe item/location identity. Each record carries item ID, location ID, unit, non-negative quantity and migration/version metadata. The server is the only writer after cutover.
- Keep `inventoryMovements/{movementId}` as the immutable movement ledger. A transfer produces a linked outbound and inbound entry with the same transfer ID and quantity, but distinct source/destination location IDs.
- Add `inventoryTransferRequests/{requestId}` as the request and decision record. It carries an immutable request fingerprint, item, source, destination, quantity, unit, requester UID/time, status and (after decision) reviewer UID/time/reason. Status transitions are server-controlled.

Do not make the client authoritative for location balances, transfer status, reviewer identity, or movement history. Avoid growing the embedded `InventoryItem.movements` array for every future transfer: the separate movement collection is the durable ledger; any embedded history retained for compatibility must be bounded and treated as a display cache, not authority.

### Trusted Worker operations

The existing Worker movement handler already uses Firestore's atomic `documents:commit` endpoint with update-time preconditions and create-only movement writes. Procurement receipt posting adds a third preconditioned write to the same atomic commit. This is a useful pattern to extend, but it is not itself a transfer implementation.

Proposed operations, each authenticated from the current Firebase ID token and checked against the active staff record:

1. **Submit request:** accept only a valid item, two distinct active locations, positive finite quantity and matching unit; record the authenticated requester and create a Pending request. A repeated request ID with the same fingerprint returns the original result; changed content under the same ID is rejected. This operation changes no stock.
2. **Decide request:** only an active Manager or Administrator may approve/reject; reject if the actor UID equals the requester UID. Use a precondition on the request's current update time and allow only Pending → Approved or Pending → Rejected. Record decision actor, time and reason server-side. This operation changes no stock.
3. **Post approved request:** require the request still be Approved and its fingerprint unchanged. In one atomic Firestore commit, precondition both source and destination balance versions, decrement source, increment destination, create both immutable movement entries, and transition the request to Posted. Reject insufficient source stock, stale balances, inactive locations, unit mismatch, or an already-posted request. The posting actor's permitted role must be explicitly settled before coding; the confirmed approval policy does not yet define who may perform this separate posting action.

The Worker must verify that the sum of location balances equals the item's aggregate before and after a transfer (the aggregate is unchanged). A conflict retry must re-read the request and both balances; it must never replay a partial debit or credit. Firestore batch atomicity plus update-time preconditions is required; separate client writes or sequential debit/credit calls are not acceptable.

### Offline, restore and import boundaries

- An offline device may save an explicitly labelled local draft/outbox request. It must not create a server Pending request, approve/reject, post stock, or show a stock change until the Worker confirms it.
- On reconnect, submit the saved request using its stable operation ID and fingerprint. Keep it pending locally on timeout/unknown outcome; query/retry the same ID rather than generating a new one.
- Do not add transfer requests, decisions, location balances or transfer movements to the generic whole-record offline queue. The queue may sync ordinary item descriptive metadata only; it must not replay quantity, location, movement, or transfer-owned fields.
- Before migration, backup restore retains the current legacy behavior subject to existing safeguards. After migration cutover, restore must not overwrite server-authoritative location balances, movements, requests or decisions from an older backup. A schema/version and migration-state gate must block incompatible restores and provide a deliberate, audited recovery path.
- Imports and admin scripts must use the same validated server operation or a separately authorized migration tool. They must not write location balances or transfer state directly.
- Existing procurement receipt intents are version 1 and do not include a destination location. Before cutover, decide how any saved/incomplete receipt intents are resolved. After cutover, receipt posting must require an explicit active destination location and include it in the stable intent/fingerprint; it must atomically update the destination balance, aggregate item quantity, movement ledger and procurement receipt ledger. Do not silently default old receipts to a guessed location.

### Migration and cutover controls

1. Export an approved database snapshot and run the existing read-only preflight. Review aggregate exceptions with the Trust; do not print identifying records in the audit output.
2. Reconcile each candidate item's current aggregate quantity against its movement history and supporting stock evidence. The current audit cannot prove this reconciliation. Any unresolved or ambiguous item is excluded from automatic seeding and held for manual resolution.
3. Freeze or version-gate all inventory writers for the short cutover window. The migration must detect concurrent item edits using update-time preconditions and abort rather than overwrite newer data.
4. Seed exactly one balance only for reviewed items with a confirmed canonical location, unit and verified quantity. Store a per-item migration marker and source snapshot fingerprint so reruns are idempotent and changed inputs are rejected.
5. Recompute location totals by unit and verify each item's balance sum equals its legacy aggregate. Produce aggregate-only reconciliation evidence for review.
6. Enable server-owned writes and the new receipt destination contract only after rules, Worker, offline queue, restore, import and regression tests are deployed together. Keep rollback as a controlled, audited migration operation; never restore old client snapshots over new ledger state.

### Decisions still required before implementation

- Confirm who may create/deactivate locations. The Trust has confirmed the initial locations are **Shine Centre** and **Girls House**; the system must support adding further locations later through a managed location registry rather than a hard-coded list.
- Confirm how pending v1 procurement receipt intents are handled at cutover.
- Confirm the approved stock evidence and sign-off process used to verify legacy quantities before seeding.

Until these decisions and server/rules/offline protections are implemented and independently tested, the transfer workflow remains unavailable and no migration is authorized.


### Confirmed location requirements (2026-11-07)

- Initial active locations: **Shine Centre** and **Girls House**.
- The location registry must be extensible: authorized users must be able to add further named physical locations without a code change or redeployment.
- Do not treat the earlier integrity-audit allowlist as the permanent location registry. It was a provisional audit vocabulary only.
- Location creation/deactivation permissions, duplicate-name handling and the behavior when a location with a non-zero balance is deactivated remain to be specified. Deactivation must not delete historical balances or movements.


### Confirmed approval-and-posting behavior (2026-11-07)

- An eligible Manager or Administrator's approval automatically posts the transfer as part of the same server-side atomic transaction.
- There is no separate posting permission or manual posting stage.
- The atomic commit must include the request decision/status transition, source balance decrement, destination balance increment and both immutable movement records. If any validation or precondition fails, none of these writes may commit.
- Requester self-approval remains prohibited, including when the requester is a Manager or Administrator.


### Confirmed location-management permissions (2026-11-07)

- Only active Managers and Administrators may create or deactivate locations.
- Staff may select existing active locations when submitting transfer requests; they cannot create or deactivate locations.
- Location names must be managed through the registry, not a hard-coded allowlist.
- Deactivation must preserve historical balances and movements. A location with any non-zero stock balance must not be deactivated. Stock must first be transferred out or formally resolved through an authorized, auditable stock operation. Deactivation preserves the location record and all historical balances/movements; it only prevents new stock receipts, issues and transfer requests to/from that inactive location.


### Confirmed non-zero-stock deactivation safeguard (2026-11-07)

- A location cannot be deactivated while any item has a non-zero balance there.
- Stock must first be transferred out or formally resolved through an authorized, auditable stock operation; no silent write-off or deletion is implied.
- Deactivation retains the location registry record and all historical balances and movements.
- An inactive location cannot be selected for new receipts, issues or transfer requests (including as source or destination). Historical records remain readable for audit.
- The server must enforce the safeguard at the point of deactivation and re-check active status when posting stock operations; a UI-only check is insufficient.


### Confirmed location-name uniqueness (2026-11-07)

- Location names must be unique after trimming leading/trailing whitespace and comparing case-insensitively.
- Thus `Shine Centre`, `shine centre` and `Shine Centre ` are treated as the same name and a duplicate create/rename is rejected.
- Enforce uniqueness server-side as well as in the interface to prevent concurrent duplicate creation. Preserve a stable location ID so renaming does not break historical movement references.


### Confirmed procurement receipt destination (2026-11-07)

- Every procurement stock receipt must identify an explicit active destination location; there is no implicit default location.
- The receiving user selects the location as part of recording the receipt.
- Server-side receipt processing must validate the location is active and atomically update the location balance, compatibility aggregate quantity, immutable movement record and procurement receipt ledger.
- If any part fails, none of those records or balances may be committed. Offline receipt drafts may be retained locally, but the app must not present stock as received until the server confirms the atomic operation.
