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
