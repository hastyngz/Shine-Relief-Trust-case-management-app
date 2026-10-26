# Inventory integrity design

**Status:** Design proposal only; no inventory rules or write behavior has been changed.  
**Scope:** Server-enforced quantity, movement, identity, concurrency, and replay controls.  
**AI-provider work:** Explicitly out of scope.

## Current model and risk

`inventoryItems/{id}` stores both the current `quantityOnHand` and an embedded `movements` array. `InventoryView.tsx` validates quantities in the UI, then `saveInventoryItem` writes the whole item to local storage; the normal sync flow later persists the record to Firestore. Current rules allow any active Manager/Staff user to create or update the item document, without validating quantities or tying balance changes to a movement. Concurrent offline edits can therefore overwrite one another, and a client with direct Firestore access can submit a negative balance, rewrite history, or fabricate a movement. Client-side SKU uniqueness checks are not global under concurrent writes.

## Integrity invariants

The following should hold for every accepted server mutation:

- Balance and movement quantities are finite and non-negative where the movement type represents an amount; issued quantity cannot exceed the authoritative available balance.
- Each stock-changing operation has a unique, immutable operation ID, an authenticated actor UID, server timestamp, item/unit/location, reason, and relevant reference. Retries with the same operation ID have exactly-once effect.
- A balance changes only as the result of a validated receipt, issue, return, damage, adjustment, or transfer. Metadata edits cannot alter quantity or movement history.
- Movement history is append-only; prior entries cannot be removed, edited, or replayed as new events.
- Transfers have paired source/destination effects in one atomic operation, use compatible units, and cannot create or destroy quantity.
- Stocktake adjustments record the counted quantity, previous authoritative balance, variance, reason, and actor; privileged roles or an explicit permission are required for reconciliation.
- `stockCode` is normalized and unique across the register. Client-side duplicate checks remain useful UX, but cannot enforce uniqueness.
- Only active authorized staff can issue commands. Financial cost fields and high-impact adjustments may require narrower roles than ordinary receipts/issues.

## Recommended architecture

### Command ledger as the authoritative write path

Preserve offline-first capture as a local **operation queue**, not as an offline overwrite of the full inventory item. Each queued operation has a client-generated collision-resistant `operationId`, type, item IDs, quantity, reason, reference, and actor context. It remains pending while offline and is replayed with the same ID when online.

Submit operations to a trusted transaction handler (an authenticated server endpoint or managed function, chosen only after confirming its production runtime). The handler verifies the ID token and active staff role from Firestore, validates the command, then uses a Firestore transaction to:

1. Return the stored result if `operationId` was already processed.
2. Read authoritative item balance(s) and verify state/version, unit, quantity, and permissions.
3. Create an immutable `inventoryMovements/{operationId}` event (or a deterministic event document) with `beforeQuantity`, `delta`, `afterQuantity`, operation type, item/location, actor UID, server timestamp, and reason.
4. Update the affected `inventoryItems` balance(s) and version in the same transaction. A transfer updates both items and records paired immutable events atomically.
5. Store an operation receipt/result so network retries can reconcile local pending state without applying the stock change twice.

The operation document, movement event, and balance update must be in the transaction; conflicts retry against current server balances. A stale issue is rejected with a clear “stock changed; refresh and review” response rather than silently overwriting. The handler must never trust caller-supplied `beforeQuantity`, actor identity, server time, or derived balance.

### Firestore rules as the client boundary

After clients are migrated to the command path:

- Allow authorized staff to read inventory items and movement history as appropriate.
- Deny direct client create/update/delete of `inventoryItems` balance fields and deny client mutation/deletion of movement history.
- If clients are allowed to edit descriptive metadata directly, limit `affectedKeys()` to an explicit allowlist that excludes balance, version, movement history, SKU identity fields where uniqueness matters, and audit fields. Otherwise route metadata writes through the same validated service.
- Do not rely on Firestore rules to compute a sum over an indefinitely growing embedded history or to guarantee uniqueness by querying an entire collection. Rules should close the direct-write bypass; the transaction handler enforces multi-document invariants.
- Store normalized stock-code reservations in a deterministic index document (for example, a safely encoded normalized key) and create/reserve it transactionally. Rule access to the index should not permit a client to claim someone else's code.

Because Firebase Admin SDK bypasses Firestore rules, the trusted handler's validation is part of the security boundary and must have unit/integration tests. Emulator rules tests should prove that ordinary clients cannot bypass the handler by directly changing a balance, appending/revising movements, deleting history, or forging audit fields.

## Compatibility and migration plan

1. Inventory every writer before migration: online UI writes, offline sync, imports, backup/restore, seed/repair scripts, and any server/Admin SDK paths. Current full-record sync and bulk restore are important bypasses that must be migrated or explicitly restricted.
2. Decide whether to retain embedded movements for read compatibility or migrate to a separate immutable collection. Prefer separate events for growth/queryability; if retaining arrays temporarily, define a strict size/retention limit and treat the server as authoritative.
3. Add a read-only audit to find negative/non-finite balances, duplicate normalized stock codes, malformed movement rows, balances that disagree with known movement history, and missing actors. Do not auto-correct ambiguous legacy records.
4. Backfill version/normalized code and opening-balance provenance. Flag ambiguous discrepancies for Administrator stocktake rather than inventing history.
5. Deploy the command handler and compatible client first. Then enable rules that deny direct balance/history edits. Avoid an interval where the rules are strict but all clients still use the legacy full-document writer, or where the new UI is live but direct old-client writes remain authorized.
6. Keep rollback bounded: if the command handler is unavailable, queue operations locally; do not reopen unrestricted client writes as a fallback. Define a supervised recovery procedure for stuck operations.

## Test matrix

- Unit-test validators for NaN/infinity, negative/zero values, invalid units, missing reason, unsupported operation type, permissions, and oversized input.
- Rules-emulator tests deny direct client quantity edits, fabricated movement appends, edits/deletes to existing movements, forged UID/timestamps, and role-ineligible writes; confirm reads and allowed metadata edits still work.
- Transaction integration tests cover concurrent issues from the same balance (no negative balance), two simultaneous receipts, duplicate operation replay, lost response after commit, stale version, transfer all-or-nothing behavior, and stocktake audit fields.
- Queue tests cover offline capture, restart, account switch isolation, ordered replay, conflict/rejection UX, no data loss on storage failure, and clearing the pending operation only after server acknowledgment.
- Migration tests verify duplicate stock codes and ambiguous legacy balances are reported, not silently overwritten.

## Decisions required before implementation

- Which trusted runtime should process inventory commands, and is it deployed wherever the app is used?
- Which roles may receive, issue, transfer, adjust, edit cost, and delete/archive stock items?
- Are fractional quantities allowed, and what precision/unit normalization is required?
- Should stocktake require a second reviewer above an agreed variance threshold?
- Should historical movements remain embedded for compatibility or migrate to a separate collection?
- How are imports, backup restores, and approved corrections routed through the integrity boundary?
