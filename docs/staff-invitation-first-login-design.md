# Staff invitation and first-login design

**Status:** Implementation blocked pending a safe, approved email-delivery protocol and confirmation of the production server runtime; no authentication behavior has been changed.
**Scope:** Replace shared initial passwords, make invitation delivery/recovery reliable, and define a safe first-login lifecycle.  
**AI-provider work:** Explicitly out of scope.

## Current behavior and risks

`StaffManagement.tsx` initializes a shared password (`Shine@2026!`) and passes it to `createStaffAccount`. `AuthContext.tsx` creates accounts in a secondary client Firebase app, then creates an `Active` Firestore staff profile before attempting a password-reset email. Reset-email errors are only logged; the method still returns success, so the UI can report that an invitation was sent when it was not.

The flow also has ambiguous recovery paths: an `email-already-in-use` error may be mapped to an existing profile or a synthetic UID, while an `operation-not-allowed` error can create a synthetic profile ID. Those IDs need not match the Firebase Auth UID, leaving a profile that cannot authenticate as the invited staff member. The Firestore staff rules key authorization by `request.auth.uid`, so UID/profile agreement is a security boundary, not a display detail.

## Recommended lifecycle

1. **Admin submits an invitation.** The UI sends the staff details to a trusted server endpoint. The server verifies the Firebase ID token, re-reads the caller's staff profile, and requires an active Administrator. It validates and normalizes the email and role; a client-provided `isAdmin` flag is never trusted.
2. **Persist an invitation, not an active account.** Create an invitation record with a cryptographically random, single-use token; store only a keyed hash of the token, an expiry, the intended email, role/permissions, inviter UID, timestamps, attempt count, and state (`pending`, `sent`, `accepted`, `expired`, `revoked`, or `delivery_failed`). Do not create a shared or guessable password. Do not mark a staff profile Active before the invitee proves control of the email.
3. **Deliver an activation link.** Generate a link bound to the invitation and an allow-listed app origin. Send it through an approved transactional mail path. The raw token appears only in the link, is never persisted or logged, and is invalid after use, expiry, revocation, or resend rotation. Resend rotates/revokes the previous token.
4. **Invitee sets their own password.** The landing page validates the invitation with the server, then asks for a new password (and confirmation) over TLS. The server atomically consumes the token, enforces password policy, creates the Firebase Auth user with the exact normalized email, and writes the staff profile using the returned Auth UID. Email verification is established by the invitation proof; it is not inferred from a client-submitted boolean.
5. **Activate only after a successful claim.** In one server-side workflow, complete Auth creation/password setup and create/update the staff profile as Active with the invited role and least-privilege permissions. If activation needs a separate approval, retain `Pending` status and require an Administrator action; ordinary staff rules must deny Pending profiles. Never allow the invitee to choose their own role or permissions.
6. **Support existing accounts safely.** If Firebase Auth already has the email, do not silently reset its password, create a synthetic UID, or attach a different identity. Mark the invite as requiring an explicit Administrator resolution. A verified existing user may be linked only by an audited, server-validated procedure that proves the Auth UID and email match. Duplicate/in-use responses should not reveal account existence to unauthenticated callers.
7. **Separate password recovery from invitations.** Existing users use the normal reset flow. The UI must show success only after dispatch succeeds; on failure it must show an actionable error and retain a retry path. Reset links are rate-limited and sent only to the account email. An invitation is not a password reset for an already-active user.

## Trusted-server requirements

Use a server boundary already deployed with the app only after confirming its production availability and mail-delivery configuration. Every invite/create/resend/revoke/claim endpoint must verify the Firebase ID token, re-check active Administrator status from Firestore, enforce rate limits, validate the request schema, and use server-generated UIDs/timestamps. Client SDK account creation and direct creation of an Active staff profile should be removed only after the replacement endpoint and migration are deployed.

Failure handling must be explicit and retry-safe. If mail dispatch fails, retain a non-active invitation in `delivery_failed` and offer resend; do not report success. If Auth creation succeeds but Firestore profile creation fails, store enough server-side state to retry or compensate safely—never create a second identity on retry. Repeated token claims must be idempotent or rejected without leaking sensitive state. Log actor, target UID/email hash, action, outcome, and correlation ID, but never passwords, raw invite/reset tokens, or full URL query strings.

## Migration and rollout

1. Confirm the server runtime can securely reach Firebase Admin Auth/Firestore and an approved mail sender; decide sender identity, expiry duration, and whether new Administrators can be invited.
2. Implement the invitation endpoint and activation page behind a feature flag. Keep current account creation disabled for new invites once rollout begins; do not silently preserve the shared password as a fallback.
3. Add synthetic integration tests for unauthorized callers, suspended admins, invalid roles, duplicate email, wrong/mismatched UID, token expiry/replay/revocation, mail failure/retry, partial Auth/Firestore failure, password policy, and exact UID/profile alignment.
4. Pilot with test accounts and verify delivery, first login, recovery, and audit trail. Remove the shared password field/constant and legacy creation fallback only after the new path is proven.
5. Review pre-existing accounts created through the legacy path. Do not bulk-reset or disable real staff accounts without an approved migration plan and communication.

## Acceptance criteria

- No shared or predictable initial password exists in the UI, client bundle, or invitation code.
- Only an active Administrator can create or manage invitations, enforced server-side.
- An invitation is single-use, expires, is revocable, and does not activate a staff profile before verified claim.
- Firebase Auth UID, Firestore staff document ID, and `staffUsers.uid` are identical; no synthetic UID fallback exists.
- Email delivery or reset failures are visible and retryable; the UI cannot show false success.
- Invited users cannot choose role/permissions; new admin grants follow an explicitly approved policy.
- Tests cover replay, retries, partial failure, and account-existence privacy using synthetic accounts.

## Decisions required before implementation

- Which transactional email sender and production server runtime are approved?
- Should invited accounts become Active immediately after verified claim, or require separate Administrator activation?
- Are new Administrator invitations allowed, and if so, what additional approval is required?
- What expiry and rate-limit values fit operational practice?
- How should existing Auth accounts with matching emails be resolved?

## Implementation blockers confirmed during review

The approved combination of Firebase Functions Gen 2, Firebase Auth native email-link delivery, server-only staff profile writes, and fail-closed handling for existing Auth emails is not yet a complete protocol. Firebase email-link sign-in can authenticate an existing identity, so completing that link does not itself enforce the approved existing-account collision policy. Do not use it as an invitation claim until the flow proves how the identity is bound to a single-use invite without altering or signing into an existing account.

Firebase's documented Admin SDK password-reset link generator requires the email to belong to an existing Auth user. The Admin SDK can create users with disabled/unverified properties, but the reviewed documentation does not establish a safe end-to-end way to email a reset link to such a newly-created disabled identity and then activate it only after a verified claim. Admin-generated action links also require an email delivery service; they do not send email themselves. Do not infer that the current client `sendPasswordResetEmail` behavior is a safe substitute or rely on undocumented disabled-account behavior.

The current repository's `firebase.json` has no Functions configuration or deployment codebase, and Hosting rewrites all paths to the SPA only. This is confirmed repository evidence, not proof that no external runtime exists. Before implementing the security-sensitive lifecycle, the owner must identify the actual production Gen 2 deployment/runtime and how it authenticates to Firebase Admin. No service discovery, credentials, or live project changes were attempted.

The initial board claim is retained as a proposed scope, not authorization to implement the unresolved protocol. Until these blockers are resolved, do not remove the legacy path, send emails, create or disable Auth users, mutate production configuration/data, or deploy. Existing legacy creation is risky but can only be replaced safely with an end-to-end tested path plus a migration plan.

### Firebase references reviewed

- Firebase documents that the client email-link sign-in flow completes using the recipient email and the action link, and warns against reusing email values supplied in link URLs: [Email link authentication](https://firebase.google.com/docs/auth/web/email-link-auth).
- Firebase documents that Admin SDK password-reset link generation requires an existing Auth user and that the generated link must then be delivered by custom email infrastructure: [Generating email action links](https://firebase.google.com/docs/auth/admin/email-action-links).
- Firebase documents that Admin SDK user creation supports `disabled` and `emailVerified` fields, and that an existing email causes creation to fail: [Manage users](https://firebase.google.com/docs/auth/admin/manage-users).
