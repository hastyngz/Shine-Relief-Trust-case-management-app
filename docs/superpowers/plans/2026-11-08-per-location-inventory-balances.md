# Per-location inventory balances implementation plan

> **For agentic workers:** Execute this plan task-by-task with the repository's existing test-first workflow. Manus is the designated test runner; the coding agent writes code and reviews Manus' exact-commit evidence.

**Goal:** Start recording stock for newly managed inventory items in a server-owned balance for their canonical location while keeping the existing item quantity as a compatibility aggregate.

**Architecture:** Extend the existing authenticated Cloudflare Worker movement transaction. For items with a canonical `locationId`, it will atomically update the item's aggregate, one location-balance document and the immutable movement record. Items without `locationId` remain on the existing legacy path until the separately approved physical-count migration; no existing quantity is inferred or seeded. Firestore rules must independently prove that balance writes are part of the same valid movement transaction.

**Tech Stack:** Existing React 19 / TypeScript / Vite app, Cloudflare Worker, Firestore REST `documents:commit`, Firestore rules emulator, existing local pending-movement queue. No new dependency or paid service.

**Spec:** `docs/inventory-transfers-and-approvals-design.md`

## Global Constraints

- Work only on branch `Replit`; do not create branches or PRs, and do not touch `main`.
- Preserve the existing aggregate `InventoryItem.quantityOnHand`; for a managed item with one active location, it must equal that item's location balance.
- New stock items start at zero. A missing balance may be initialized at zero only when the item aggregate is zero and it has no movement history.
- Never seed a legacy non-zero aggregate into a location balance or infer its location. Existing items without `locationId` stay on the legacy path pending physical verification and Manager/Administrator opening-balance approval.
- Validate active location, item/location association, registered unit and approved quantity precision at the Worker and Firestore boundaries.
- A stock movement is one atomic commit: item aggregate + location balance + immutable movement (and procurement receipt ledger when applicable). No partial writes.
- Preserve stable operation IDs, request fingerprints, update-time preconditions, bounded conflict retries and duplicate-safe offline retries.
- Location balances and movement/transfer-owned fields are server-owned; never add them to the generic whole-record offline queue.
- Keep existing role checks. Staff may record ordinary stock movements as currently allowed; View Only may not.
- Do not enable transfers, deactivation, opening-balance migration, production data changes, Firestore rules deployment, Worker deployment, Cloudflare or KV changes.
- Do not add dependencies or use paid services.

## Review Focus

- Existing managed item has a non-zero aggregate but no balance: reject and require verified opening-balance review; never create a balance from that aggregate.
- Missing, inactive or mismatched location: reject without writes.
- Concurrent movements to the same item/location: one stale transaction must retry against fresh documents or fail without partial writes.
- Duplicate operation ID with identical payload: return the original confirmed movement; changed payload under the same ID must be rejected.
- Countable fractional quantities, measured quantities beyond two decimals and incompatible units: reject at the server and rules boundaries.
- Offline retry or timeout: retain the same operation ID and payload; do not show a stock change before server confirmation.
- Procurement receipt: require an explicit active destination and include its balance and procurement receipt ledger in the same atomic commit.

---

### Task 1: Add the managed-item balance transaction

**Files:**
- Modify: `workers/r2-storage/index.mjs`
- Test: `scripts/inventory-movement-worker.test.mjs`

**Interfaces:**
- Add a deterministic helper for the balance document ID from `itemId` and `locationId`; avoid ambiguous concatenation and encode the document path safely.
- Managed balance fields: `id`, `inventoryItemId`, `locationId`, `unit`, `quantity`, `createdAt`, `createdByUid`, `updatedAt`, `updatedByUid`, `lastMovementId`.
- Movement records for managed items add canonical `locationId`; keep the human-readable historical `location` field for compatibility.

- [ ] **Step 1: Add failing Worker tests** for first receipt to a zero-stock managed item creating a zero-based balance and committing item + balance + movement together; subsequent receipt, issue and stocktake updating the same balance; insufficient stock; inactive/missing/mismatched location; and a non-zero managed aggregate with no balance being rejected without writes.
- [ ] **Step 2: Run** `npm run test:inventory-movement-worker` and confirm the new cases fail for the missing managed-balance behavior.
- [ ] **Step 3: Implement** the managed-item branch in `handleInventoryMovement`. Read and validate the active location and deterministic balance document. Create a balance only when it is absent and the item has zero quantity and no movements; otherwise require the existing balance to match the item, location, unit and aggregate. Update the item, balance and movement in one `firestoreCommit` using item/balance update-time preconditions and movement `exists:false`. Preserve the legacy path for items without `locationId`.
- [ ] **Step 4: Extend Worker tests** for duplicate retry, changed-payload ID reuse, stale balance retry, no partial writes on any failed precondition, and precision boundaries. Verify procurement receipts for managed items require an explicit active destination and atomically update the procurement receipt ledger with the same balance transaction.
- [ ] **Step 5: Run** `npm run test:inventory-movement-worker` and `node --check workers/r2-storage/index.mjs`; both must pass.

### Task 2: Enforce balance transaction integrity in Firestore rules

**Files:**
- Modify: `firestore.rules`
- Test: `scripts/inventory-transaction-rules.test.ts`

**Interfaces:**
- Keep client reads for active staff.
- Permit balance create/update only when the same atomic write proves a valid authenticated inventory movement and matching post-write item state.
- Continue denying client balance deletes and all unrelated balance mutations.

- [ ] **Step 1: Add failing emulator tests** for a valid managed receipt/issue/adjustment transaction, a direct balance write, mismatched item/location/unit, balance quantity not matching the item aggregate, movement missing from the atomic write, unauthorized actor and balance deletion.
- [ ] **Step 2: Run** `npm run test:inventory-rules` and confirm the new valid transaction fails only because balance writes are currently denied, while invalid writes remain denied.
- [ ] **Step 3: Implement** narrowly scoped `getAfter` validation tying the balance document to the post-write item and immutable movement. Do not relax existing item, movement, location or procurement permissions.
- [ ] **Step 4: Run** `npm run test:inventory-rules`; all prior and new rules tests must pass.

### Task 3: Carry canonical location and preserve offline retry behavior

**Files:**
- Modify: `src/services/r2StorageClient.ts`
- Modify: `src/components/InventoryView.tsx`
- Modify: the existing procurement receipt component/caller that submits `sourceType: 'procurementReceipt'` (identify the exact caller before editing)
- Modify: the existing pending-inventory-movement replay helper/caller only if its payload needs the canonical location
- Tests: existing inventory and pending-retry tests; add focused coverage only where current tests do not exercise the behavior.

**Interfaces:**
- Every managed-item movement sends its canonical `locationId`; the server remains authoritative and verifies it against the item and active registry record.
- Procurement receipt UI must ask for an explicit destination location; it must not infer one from an old free-text label or silently choose a default.
- Offline drafts retain the same location ID, payload signature and operation ID through retry. No balance or aggregate is changed optimistically.

- [ ] **Step 1: Add failing client/retry tests** showing the location ID remains attached to an offline movement through reconnect and that a procurement receipt cannot be submitted without an explicit destination.
- [ ] **Step 2: Run** the focused existing inventory/pending-retry tests and confirm the expected failures.
- [ ] **Step 3: Update** movement payload creation, signatures and replay so managed movements preserve `locationId`; update procurement receipt destination selection and payload to use an active managed location. Keep location creation separate from receipt posting.
- [ ] **Step 4: Run** `npm run test:inventory`, `npm run test:inventory-pending-retry` and any focused procurement test added for the destination contract.

### Task 4: Documentation, review and Manus verification handoff

**Files:**
- Modify: `docs/inventory-transfers-and-approvals-design.md`
- Modify: `docs/administration-officer-tor-gap-analysis.md`
- Modify: `AGENT_BOARD.md`

- [ ] **Step 1:** Document that managed items now have server-owned location balances, while legacy non-zero records remain unseeded pending physical verification. Keep transfers, multiple-location allocation, migration and deployment marked incomplete.
- [ ] **Step 2:** Update the Administration Officer status only to the exact delivered scope; do not mark the full inventory-location programme complete.
- [ ] **Step 3:** Review the complete diff against `AGENTS.md`, the security checklist and offline invariants. Resolve any Critical/High findings before handoff.
- [ ] **Step 4:** Commit the implementation on `Replit`, then append a Manus handoff with the exact SHA and commands:
  - `node --check workers/r2-storage/index.mjs`
  - `npm run test:inventory-movement-worker`
  - `npm run test:inventory-rules`
  - `npm run test:inventory`
  - `npm run test:inventory-pending-retry`
  - `npm run test:procurement`
  - `npm run test:offline`
  - `npm run test:offline-queue`
  - `npm run audit:firestore-access`
  - `npm run lint`
  - `npm run build`
  - `npm run test:e2e`
- [ ] **Step 5:** Manus reports exact tested SHA, each command's real result, any manual checks not possible, and workspace cleanliness. Review the report against the intended commit before calling the slice verified.

## Explicitly deferred

- Backfilling any existing non-zero item balance; requires physical count, evidence comparison and active Manager/Administrator approval.
- Transfers and items with multiple simultaneous location balances.
- Location rename/deactivation.
- Full restore/import cutover controls.
- Production deployment, rules deployment, live data changes, migration and KV work.
