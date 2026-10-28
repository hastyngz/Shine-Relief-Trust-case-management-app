const SAFE_APP_MESSAGES = new Set([
  'Open the sign-in link from the invitation email on this device, then try again.',
  'Firebase has not confirmed this email sign-in. Open the original invitation email link again.',
  'The signed-in account must match the verified invitation email.',
]);

/** Convert Firebase and trusted-API failures into safe, actionable claim feedback. */
export function getStaffInvitationClaimErrorMessage(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const status = typeof record.status === 'number' ? record.status : undefined;

  switch (code) {
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
    case 'auth/invalid-email-link':
      return 'This invitation sign-in link is invalid or expired. Ask a SHINE Administrator to resend the invitation.';
    case 'auth/invalid-email':
      return 'Enter the email address that received the invitation.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase. Check your connection and retry the invitation link.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts were made. Wait a while before trying the invitation link again.';
    case 'auth/user-disabled':
      return 'This account cannot accept the invitation. Contact a SHINE Administrator.';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'A Firebase account already exists for this email. Contact a SHINE Administrator to resolve the invitation.';
  }

  if (status === 401) return 'Your sign-in session is invalid or expired. Open the invitation email link again.';
  if (status === 403) return 'The signed-in email is not authorized to accept this invitation.';
  if (status === 404 || status === 410) return 'This invitation link is invalid, replaced or expired. Ask a SHINE Administrator to resend it.';
  if (status === 409) return 'This invitation cannot be accepted because the account or staff profile already exists. Contact a SHINE Administrator.';
  if (status === 429) return 'Too many invitation requests were made. Wait a while before trying again.';
  if (status !== undefined && status >= 500) return 'SHINE could not complete the invitation. Check your connection and try again later.';

  const message = typeof record.message === 'string' ? record.message : '';
  if (SAFE_APP_MESSAGES.has(message)) return message;
  return 'The invitation could not be verified. Reopen the invitation email link or contact a SHINE Administrator.';
}
