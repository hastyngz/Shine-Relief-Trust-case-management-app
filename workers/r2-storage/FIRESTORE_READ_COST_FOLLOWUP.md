# Firestore listener follow-up: employee records

Date: 14 October 2026  
Branch: `Replit`

## Change

The app's central startup listener initializer previously attempted to subscribe to the `employees` collection for every signed-in role. The Firestore rules only permit administrators and managers to read that collection, and it contains employment records used by payroll.

The role gate in `src/services/firestoreListenerPermissions.ts` now skips the `employees` listener unless the caller explicitly passes `canReadManagementPlanning: true`. `src/App.tsx` already passes that option only for administrators and managers. The listener initializer marks a skipped collection as handled for initial-sync accounting, so the existing startup completion logic can still finish.

The permission regression test now covers default-deny and manager/admin opt-in for `employees`, as well as the existing planning, health, case-review, and restricted-import gates.

## Expected effect and limits

- Avoids starting a collection-wide listener that ordinary staff and view-only users are not authorized to read.
- Reduces unnecessary permission-denied listener attempts for those roles.
- Does not change Firestore rules or grant any additional access.
- For non-management roles, the `payrollRecords` listener now queries only documents with `employeeId == currentUser.uid`, matching the staff-specific read condition in `firestore.rules`. If no UID is supplied, the listener is skipped. Administrators and Managers retain the full payroll listener.
- This relies on the current data contract that a staff member's own payroll records use their authenticated UID as `employeeId`. Records keyed only to a separate employee-record ID are not visible to staff under the existing rules and are not made visible by this change.
- No billed-read savings have been measured. Confirm behavior with live role-by-role logins and compare Firebase/Google Cloud usage before claiming cost reduction.

## Verification

The existing GitHub Actions workflow on `Replit` runs TypeScript checks, listener-permission tests, quality tests, the Firestore access audit, and a production build. Check the latest workflow run before merging or deploying.

`main` remains unchanged.


## Additional payroll identity check — important before rollout

A source review of `src/components/PayrollDashboard.tsx`, `src/services/importService.ts`, and `firestore.rules` shows a potential data-model mismatch that must be checked against real records:

- The staff payroll read rule permits a non-management user to read a payroll document only when `resource.data.employeeId == request.auth.uid`.
- The payroll UI can save the selected employee ID from a payroll form, and the import pipeline can use a matched employee-record ID. Those IDs are not guaranteed to be Firebase authentication UIDs.
- Therefore the new UID-filtered listener is aligned with the current security rule, but staff may see no payroll documents when older/imported payroll records use a separate employee ID. The client query must not be broadened to load other employees' payroll.

**Do not loosen the Firestore rule to solve this.** Before rollout, inspect representative payroll documents and confirm whether `employeeId` equals the employee's Firebase UID. If IDs differ, design a controlled migration to a stable UID field (or a separate, securely authorized mapping) and test it with staff, manager, and administrator accounts. Existing records must remain private during the migration. Automated build/test success does not establish that live payroll data uses the expected identifier.


## Payroll summary identity issue found during continued trace

The risk is not limited to the Firestore listener. In `src/services/payrollService.ts`, the monthly summary first indexes imported `EmployeeRecord` entries by `employee.id`, then adds active `StaffUser` entries only when their `person.id` is not already present. The code matches by ID, not by a stable shared identity such as a verified UID/email mapping. Since imported employee records and Firebase staff profiles can have different IDs, the same human may appear twice in the monthly payroll summary. Salary history and payment matching are also keyed by that employee ID, so an arbitrary name-based merge would be unsafe.

This is confirmed as a code-path risk, not confirmed as a live-data defect. The live Firebase records and import workbook need to be checked before choosing a repair. A safe follow-up should establish an explicit employee-to-auth-UID link (or another stable immutable payroll identity), then use it consistently for payroll records, salary history, imported employee records, and the staff-only Firestore query. Preserve historical records and keep managers/admins as the only roles that can read the full payroll collection. Add tests for different IDs belonging to one linked employee, unlinked imported employees, and staff-only visibility before rollout.

No code-level identity migration has been made because the current repository connection cannot inspect the live Firestore documents, and guessing the mapping could expose payroll or merge two different people.

## Agreed employee/staff ID convention

The project owner has confirmed that people who are represented in both the employee records and staff-user records will be assigned the same ID. Apply this convention to new and corrected records rather than trying to merge people by name.

For staff self-service payroll to work with the current Firestore rule and query, that shared ID must also be the person's Firebase Authentication UID, because the existing rule checks `employeeId == request.auth.uid`. If an employee record already has a different ID, do not silently overwrite it or merge on name alone. Review the existing record and its salary/payment history, then perform a controlled, auditable migration that preserves the historical documents and validates staff-only access.

With matching IDs, the monthly payroll summary's current ID-based de-duplication can represent the same person once across the employee and staff lists. Unlinked imported employees should remain separate until their identity is explicitly confirmed. This convention is a data-entry/record-management agreement; it does not prove that existing live records already comply. The repository connection cannot inspect production Firestore data, so verify current records and role-based behavior before rollout.

## Reduced repeated login writes and roster-listener fan-out

The staff profile loader previously wrote `lastLoginAt` to the `staffUsers` document on every successful login. Active staff sessions subscribe to the full `staffUsers` roster, so frequent updates to that collection can trigger additional snapshot delivery/read activity for other connected sessions.

The loader now updates `lastLoginAt` only when the stored timestamp is not from the current UTC calendar date. This retains a daily last-login marker while avoiding repeated writes from multiple logins on the same day. The write remains non-blocking and does not change staff roles, access rules, or roster subscription behavior.

Expected effect: fewer redundant `staffUsers` writes and potentially fewer listener-triggered reads when the same staff member logs in repeatedly during a day. Actual savings depend on session count and Firestore billing/usage measurements; no numerical reduction is claimed. Verify last-login display expectations and run the automated workflow before deploying.


## Staff roster listener review — intentionally not gated yet

The authentication provider starts the full `staffUsers` collection listener as soon as Firebase Auth reports a signed-in user. The Firestore rules allow an unregistered user to read only a matching invitation/profile document, not the whole roster, so an unregistered account can trigger a permission-denied collection listener before profile loading finishes. A suspended account can also be denied by the active-staff rule.

It may be possible to avoid those failed full-collection listener attempts by waiting for profile resolution and starting the roster listener only for an active, registered user. However, the current listener also refreshes the signed-in user's role/status in real time and supplies the staff roster for assignments, recipient lists, payroll mapping, and staff administration. Simply stopping it for suspended users would mean later reactivation may not be reflected until a refresh or new login. A safer design would need a separate, narrowly scoped listener for the user's own staff document plus the full roster listener only while the user is active, with role/status revocation and reactivation tested explicitly.

No roster-listener code change was made in this pass because changing this lifecycle without tests could break role updates or reactivation. This is a confirmed code/rules mismatch opportunity, not a measured billing saving. Before implementing, add tests for initial profile-loading races, invited/unregistered users, active staff, suspension, reactivation, and role changes; preserve the existing Firestore rules and allStaff consumers.

## Reduced report attachment query fan-out for authorised health-record viewers

`getReportAttachmentMetadata(true)` previously issued one Firestore query per report-eligible attachment target type (including health follow-ups), even though this permission path can query the bounded target-type list with a single Firestore `in` query. It now uses one query for that authorised path. Users without health-record permission retain separate per-type queries with a server-side category exclusion, because Firestore does not allow combining `in` and `not-in` in the same query.

This reduces query fan-out and request overhead for report generation by users who can view health records. It does **not** necessarily reduce billed document reads when the same documents are returned; no monetary saving is claimed. The target-type allowlist continues to exclude safeguarding-case attachments. Check the CI result and validate report generation with authorised and unauthorised roles before deployment.

## Salary-history read deduplication — 14 October 2026

The management dashboard and management reports both load salary-history records for the current staff IDs. Their effects previously depended on the whole `staff` array reference, so a roster refresh that recreated the array could repeat the same salary-history query even when the staff identities were unchanged.

Both screens now derive a stable, sorted key from staff IDs and refetch only when that ID set or the user's management access changes. This does not cache salary data across sessions, change Firestore permissions, or suppress a change to the actual staff-ID set.

The payroll dashboard already uses an ID-based dependency for its salary-history fetch. This change aligns the other two screens with that pattern.

**Expected effect:** fewer duplicate salary-history queries when roster objects refresh without changing staff membership. Actual savings depend on whether such refreshes occur in normal use; no billed-read savings have been measured. The standard CI workflow should be checked after these changes. The full Firestore emulator rules suite remains separate from that workflow.

## Case-action listener scoping guard — 14 October 2026

The startup listener permission helper now skips `caseActions` when the caller has neither management-wide task access nor an authenticated UID to scope the query. Non-management callers with a UID still use the existing `assignedStaffId == uid` query; managers/admins retain the team-wide query.

The current `App.tsx` caller already supplies the authenticated UID and the management-role flag, so this is a defensive guard for missing/incomplete options rather than a change to normal signed-in behaviour. The listener-permission unit test now covers both scoped staff access and manager-wide access.

This prevents a future caller from accidentally attempting an unscoped collection listener that would fail the intended Firestore rule query constraints. It does not reduce reads for the current valid signed-in path by itself, and no billing savings are claimed.

## Payroll salary-history permission-aligned fetch — 14 October 2026

The payroll dashboard previously attempted to read salary-history documents for the roster regardless of the signed-in role. The Firestore rule for `employeeSalaryHistory` permits reads only to Managers and Administrators, so staff sessions could issue a guaranteed-denied query and show a misleading salary-history refresh warning.

The dashboard now fetches salary history only when `canProcessPayroll` is true (Manager/Administrator). Other roles clear the management-only salary-history state and do not issue that query. This does not change access rules or payroll-record visibility; staff payroll access remains governed by the existing UID-scoped `payrollRecords` rule.

Expected effect: avoids a known unauthorized query attempt on staff payroll-dashboard visits. It is not a reduction in successful billed document reads because the restricted query should already be denied. Verify the payroll screen with staff, manager, and administrator accounts before deployment.

## Messaging listener review — 14 October 2026

Reviewed `src/services/messagingService.ts` as another potential source of recurring reads:

- Conversations are scoped to documents where the signed-in UID is a participant.
- Notifications are scoped to the current user's UID.
- Message listeners are scoped to the currently selected conversation.
- Announcements use a collection-wide live listener, which may be reasonable for a small organisation-wide announcement feed but scales with the number of announcements and active staff sessions.

No KV cache or arbitrary result limit was added. These feeds are intentionally live, and caching messages/notifications risks stale unread counts or delayed delivery. Adding a limit to messages without implementing older-message pagination would silently hide conversation history. A safer future improvement is UI-backed message pagination (load the newest page first, then fetch older pages on demand) and, if announcement history grows, an explicit product decision about retention or pagination.

This is a source-code review, not a measurement of production traffic. No billing savings are claimed. Any later pagination change should preserve Firestore security rules, message ordering, unread counts, and the existing realtime behavior for the newest messages.

## Contact directory duplicate refresh reads — 14 October 2026

The contact directory save and merge handlers refreshed the directory with `listContacts()`, then called `listContacts()` again to find the selected contact. Each call reads the contacts collection, so the second query was redundant after a successful refresh.

The refresh helper now returns the list it just loaded (or the existing local fallback on error), and the save/merge handlers reuse that result when restoring the selected contact. This removes one full contacts-collection read after a successful save and one after a successful merge. It does not cache contacts across sessions, alter contact permissions, or change how the directory initially loads.

The contacts collection may include people and organisations used in case follow-ups and programme operations, so no broad shared KV cache was introduced. Verify create, edit, merge, and refresh-error behavior in the app. This is a source-level reduction in duplicate queries; actual billed-read savings depend on how often staff save or merge contacts.

## Broader read-path review — 14 October 2026

A second pass checked the central Firestore sync service, staff messaging subscriptions, employee contract salary-history loading, attachment report metadata, and the contacts/import call sites.

- **Full database restore/replace:** `syncEntireDatabaseToFirestore` deliberately reads existing collections when `replaceExisting` is enabled so it can identify records absent from the imported backup and remove stale records. This is a destructive administrative workflow, not a routine screen read. Do not remove the scan or replace it with KV caching without redesigning and testing the restore/replace contract; a mistaken change could leave deleted records behind or remove the wrong data.
- **Full database JSON export:** `exportDatabaseJSON` deliberately loads all attachment metadata for the backup. This is a full-export path, not a dashboard query. A future export redesign could stream or page records, but it must still produce a complete, restorable backup.
- **Employee contract panel:** salary history is loaded for the selected employee when the contract panel opens. Salary history is restricted to management roles and feeds gratuity calculations. No shared cache was added because stale remuneration history could produce incorrect payroll/gratuity figures, and role checks plus invalidation would be required.
- **Live messaging:** conversations and notifications are user-scoped, messages are conversation-scoped, while announcements are organisationally scoped and live. Changing these to stale cache responses or applying an arbitrary limit could break live updates, unread state, or history visibility. Message pagination remains a UI-level improvement candidate rather than a cache-only change.
- **Attachment reports:** report metadata queries are already narrowed by target type, and non-health viewers exclude medical documents/prescriptions in the Firestore query and again in application filtering. Keep those privacy filters intact. Generating secure R2 download URLs is separate from Firestore document-read billing.
- **Contacts import review:** the import wizard fetches the existing contacts list once to compare candidate records. No second contacts query was found in that path. The directory save/merge duplicate query was removed in the preceding change.

The main remaining cost opportunity is likely to depend on production scale and usage: initial/live collection snapshots, message history size, report attachment counts, and full backup/restore frequency. Before designing a general cache, collect Firebase usage metrics and identify one non-sensitive one-shot read whose freshness requirements and write invalidation are explicit. No production billing measurements or live database contents were available during this source review, so no dollar or percentage savings are claimed.

## Contact import and attachment export follow-up — 14 October 2026

The contact-import review path calls `listContacts()` once to compare imported candidates with existing records. No duplicate contacts-collection read is required within that operation, so no further code change was justified there. The directory's save/merge duplicate read was addressed separately.

The comprehensive report currently requests report-eligible attachment metadata when the report modal opens. That is a one-shot read rather than a permanent live listener. It can be expensive if the attachment collection grows, but adding a limit would risk silently omitting report evidence. A safe future design would add explicit pagination or query attachments only for the records selected for a report, with a clear indication when more records are available and tests for report completeness and health-record permissions.

The JSON backup path intentionally includes all attachment metadata so the export can represent a complete database backup. Do not narrow that query for cost reasons. If backup size or latency becomes a problem, redesign it as a paginated/streamed export while preserving completeness and restore compatibility.

No additional implementation change was made in this pass because the remaining candidates require a user-visible pagination/export design or production usage evidence. Prefer measuring query counts and document volume before making these changes.

## Salary-history overlapping request reduction — 14 October 2026

The salary-history service now coalesces identical reads while a request is still in flight. Calls for the same employee, or the same set of employee IDs regardless of input order, share the same pending promise instead of issuing duplicate Firestore queries at the same time. The temporary entry is removed when the request settles; this is not a time-based cache and does not keep salary data around after completion.

The multi-employee lookup also skips empty IDs, returns immediately for an empty set, and runs its independent batches of up to 30 IDs concurrently. Concurrent batches can reduce waiting time but do not inherently reduce billed document reads; the in-flight coalescing is the part that can avoid duplicate reads when screens request the same set simultaneously.

No salary data, role checks, or Firestore rules were changed. Verify manager/admin salary-history views and contract/gratuity calculations after deployment. No monetary saving has been measured.

## Staff roster subscription lifecycle — 14 October 2026

The authentication context previously started a collection-wide `staffUsers` listener as soon as Firebase Auth reported a user, before the staff profile had been resolved. That could cause unnecessary denied roster-listener attempts for unregistered accounts and suspended staff.

The listener lifecycle now waits for a resolved, active registered profile before opening the full roster subscription. A known registered but suspended user listens only to their own staff document, allowing a live status change to reactivate the roster flow without exposing the full staff directory. Unknown/unregistered accounts do not start either a full roster listener or a persistent profile listener. The full-roster effect depends only on identity and access-state fields, not the entire profile object, so ordinary profile field updates do not repeatedly tear down and recreate the collection listener.

This preserves the existing Firestore rules and does not grant new access. It is expected to avoid collection-wide listener attempts for accounts that cannot read the roster, but actual billing impact has not been measured. The standard CI workflow checks TypeScript, existing listener-permission tests, quality rules, the static access audit, and the production build; it does not simulate the full authentication lifecycle. Before rollout, manually test first login, an unregistered account, suspended-to-active reactivation, active staff, and manager/admin role changes. No production Firebase records are accessible through this repository connection.

## Snapshot burst coalescing and report metadata request sharing — 14 October 2026

### Aggregate app-state updates

The central Firestore listener now debounces rapid collection-snapshot callbacks into a single aggregate app-state update after a short 50 ms quiet period. This is intended to reduce repeated React state updates and local database persistence when multiple collection listeners return or change close together. Pending notification timers are cleared when the listener is torn down.

This does **not** reduce Firestore document reads and does not replace, delay, or remove the underlying real-time listeners. It only coalesces the app's downstream aggregate-state processing. Confirm initial sync completion, edits from a second session, offline/reconnect behaviour, and immediate UI refresh after saves during manual testing.

### Comprehensive report attachment metadata

The report attachment metadata service now shares an in-flight request when the same permission class opens the report flow more than once concurrently. Health-authorized and non-health-authorized requests are keyed separately, and each entry is removed when the request succeeds or fails. Later opens fetch fresh metadata; this is not a persistent cache and does not weaken the existing health-record filtering.

This can avoid duplicate Firestore queries if multiple consumers request the same report metadata at the same time. It does not reduce reads for a single request, and no billing savings have been measured.
