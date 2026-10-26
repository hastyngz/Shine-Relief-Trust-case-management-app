/** Convert Firebase Auth failures into safe, actionable reset-request messages. */
export function getPasswordResetErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'This staff record has an invalid email address. Ask an Administrator to correct the address, then try again.';
    case 'auth/too-many-requests':
      return 'Password reset requests are temporarily limited. Wait a while before trying again.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and retry when online.';
    case 'auth/operation-not-allowed':
      return 'Password reset is not available for this sign-in method. Contact the system Administrator.';
    case 'auth/user-not-found':
      return 'No password reset request could be completed for this staff account. Verify its sign-in setup with an Administrator.';
    default:
      return 'Could not request password reset instructions. No password was changed. Check your connection or sign-in setup and try again.';
  }
}
