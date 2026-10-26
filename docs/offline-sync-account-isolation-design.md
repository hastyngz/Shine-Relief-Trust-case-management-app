# Offline account isolation — implementation design

**Status:** Core UID-scoped implementation applied on `Replit`; exact-head CI and device acceptance are still pending.  
**Branch:** `Replit` only.  
**Scope:** Browser-local app database, sync baseline, queued writes, conflicts and legacy offline data.

## Goal

A shared or previously used browser must not expose one staff account's cached SHINE data to another account, and must never replay one account's queued edits under another account's authenticated identity. Offline edits must remain durable and recoverable. Existing Firestore/Storage authorization remains authoritative and is not weakened.

## Implementation status and remaining risks

- New local database, queue, baseline, snapshot and conflict stores are UID-scoped; the UI resets and guards account-switch state; queue flushes require owner UID equality.
- New conflicts record an owner UID and conflict resolution checks it. Missing-owner conflicts are not resolvable through the normal UI.
- Unowned legacy localStorage keys and the former global IndexedDB queue are preserved and checked by destructive-restore inspection; they are not automatically assigned, rendered, replayed or deleted.
- A dedicated user-facing/admin-controlled recovery workflow for quarantined legacy data remains unfinished.
- The latest CI run on the exact current SHA must pass before the code can be called verified; physical Android/weak-signal acceptance is still outstanding.

## Safety invariants

1. **Account-bound state:** all new local database, baseline, queue and conflict state is namespaced to the Firebase UID. No email/name is used as a storage key.
2. **Fail closed during identity changes:** while auth is unresolved, signing out, or switching UID, cached records are not rendered as the next account's data and queued work is not flushed.
3. **Owner-checked queue:** new entries carry owner UID; only entries owned by the currently authenticated UID can be flushed or resolved. A missing/mismatched owner is never inferred from the current actor.
4. **No silent loss:** pending writes are removed only after a confirmed applied result or explicit, user-visible resolution. Storage errors remain visible and preserve recoverable data.
5. **No unsafe baseline:** a baseline belongs to one UID. Missing or unreadable account baseline must not cause a full database diff to be replayed or mark unconfirmed local edits as synced.
6. **Legacy quarantine:** existing global DB/queue/baseline/conflicts have unknown ownership. Preserve their bytes in a separate legacy quarantine and do not automatically render, migrate to a UID, replay, or delete them. An explicit recovery workflow must make recovery choices visible. The normal online path should repopulate the signed-in user's workspace from authorized Firestore snapshots.
7. **Authorization unchanged:** retain role projection, Firestore rules, Storage rules and server-side authorization. Never use cache filtering as an authorization boundary.
8. **Concurrent access:** queue updates must not overwrite entries for other UIDs or lose same-user entries due to stale whole-queue writes. Recheck multi-tab behavior and IndexedDB transaction boundaries.
9. **Privacy:** no real beneficiary or staff data in tests, screenshots, logs or reports. No new paid service or dependency.

## Staged implementation

### Stage A — Establish account-scoped persistence
- Introduce a small explicit storage-owner/workspace API keyed by Firebase UID.
- Make app startup wait for auth resolution before selecting a workspace or showing cached records.
- Route all local database saves and confirmed cloud snapshots to the selected UID workspace.
- Ensure switching UID tears down old listeners and resets in-memory UI state before loading the next workspace.
- Add tests for initial auth loading, sign-out, manager-to-staff switch and separate cache reads/writes.

### Stage B — Scope queue, baseline and conflicts
- Namespace queue, baseline and conflict persistence by UID, including IndexedDB records and localStorage fallback.
- Add owner UID to queue entries and conflicts; validate ownership at enqueue, flush, display and conflict resolution.
- Preserve existing set/delete and baseline-hash conflict semantics.
- Prevent stale async completions from account A from writing into account B's workspace.
- Add tests for matching/mismatching owner, repeated flush, keep-mine/keep-theirs, concurrent tabs, storage errors and interrupted sync.

### Stage C — Legacy recovery and safe reconnect
- Detect legacy global keys without clearing or rendering them in a normal staff session.
- Present a neutral, non-sensitive notice that legacy offline work needs explicit recovery; never expose its contents to non-authorized staff.
- Define an admin-controlled recovery workflow that does not assign an unknown owner automatically. If no safe owner can be proven, preserve the archive and require a deliberate export/reconciliation decision.
- Verify first online snapshot initializes only the current user's workspace; no baseline is advanced before the snapshot is durably saved and confirmed.

### Stage D — Verify release readiness
- Run lint, build, offline, queue, storage, rules, sensitive-data access and E2E suites on the exact commit.
- Add browser tests for account A edit offline -> sign out/switch to B -> reconnect; ensure no A write is sent as B and no A cache/conflict is shown to B.
- Test reload/restart, failed local storage writes, partial server failures and same-record concurrent edits.
- Report actual Android/weak-signal testing separately; automated browser tests are not a substitute.

## Release/testability trade-off

The current CI-green code is available for **controlled testing with synthetic/test data**, but shared-browser account switching must not be considered safe for real sensitive data until this work is complete. After the workspace migration, a device that only has unowned legacy offline state may need to connect once to reload its own authorized server data. Legacy queued edits will remain preserved and quarantined rather than being guessed at or silently replayed.

## Rollback and boundaries

- No production Firestore/Storage rule changes, production data migration, deployment or live-service smoke test as part of this code change.
- Roll back code only if needed; never roll back by deleting local queues or archives.
- Any schema or recovery decision that could discard, attribute, or disclose existing offline edits requires explicit owner approval.
