---
name: shine-offline-testing
description: Safely test and change SHINE's offline queue, local storage, conflict handling, app shell, and reconnect synchronisation.
---

# SHINE Offline Testing

Use for any work involving offline mode, IndexedDB/localStorage, queued writes, synchronisation, service workers, PWA caching, storage quota, or intermittent connectivity.

## Read first
- `AGENTS.md`
- `docs/offline-app-shell.md`
- `src/services/offlineSync.ts`
- `src/services/firestoreSync.ts`
- `src/utils/storage.ts`
- `src/components/Sync/SyncConflictsPanel.tsx`
- Relevant service-worker and app-shell files/tests discovered in the current repository.

## Safety invariants
- Local edits must not be silently lost or overwritten by stale server snapshots.
- Preserve per-record queue semantics, including set/delete operations and `baseUpdatedAt`.
- Preserve conflict creation and visibility; do not automatically choose a winner where a conflict should be surfaced.
- Keep storage quota failures visible and recoverable. Do not clear queues or fall back to volatile memory without clear user feedback.
- Never cache API responses, Firebase/Firestore/Auth traffic, or storage download URLs in the app-shell cache.
- Do not mix the push messaging service-worker scope with the app-shell worker.

## Test workflow
1. Describe the expected behaviour and reproduce the reported failure when feasible.
2. Test online save, offline edit, reload/reopen, reconnect, and confirmation that the edit persists and syncs.
3. Test stale server data and concurrent edits; confirm a conflict is surfaced rather than overwritten.
4. Test delete and update operations, repeated sync attempts, and duplicate-event protection where applicable.
5. Test storage errors/quota handling and verify the user sees a persistent, understandable warning.
6. Check first load and subsequent load of the production-built shell offline using `docs/offline-app-shell.md`.
7. Prefer deterministic regression tests using the existing test setup. Do not add dependencies without a clear reason.
8. Run `npm run lint` and the relevant test scripts listed in `package.json`; report any browser/manual checks that could not be performed.

## Change discipline
Keep edits narrow, preserve existing queue and conflict architecture, and inspect service-worker cache rules after any PWA change. Never report offline behaviour as verified based on a TypeScript check alone.
