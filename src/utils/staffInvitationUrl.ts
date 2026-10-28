function tokenFromHash(hash: string): string {
  const normalized = hash.replace(/^#\/?/, '');
  const question = normalized.indexOf('?');
  if (question < 0) return '';
  return new URLSearchParams(normalized.slice(question + 1)).get('invitationToken') || '';
}

/** Return true for the app's invitation fragment or a Firebase email-link action URL. */
export function isStaffInvitationRoute(hash: string, search: string): boolean {
  const route = hash.replace(/^#\/?/, '').split('?')[0];
  return route === 'accept-invitation' || new URLSearchParams(search).get('mode') === 'signIn';
}

/**
 * Read the one-time invitation token from the app fragment, or from the
 * fragment of Firebase's validated continueUrl. Never accept a token from an
 * arbitrary top-level query parameter.
 */
export function getStaffInvitationToken(hash: string, search: string): string {
  const direct = tokenFromHash(hash);
  if (direct) return direct;

  const continueUrl = new URLSearchParams(search).get('continueUrl');
  if (!continueUrl) return '';
  try {
    return tokenFromHash(new URL(continueUrl).hash);
  } catch {
    return '';
  }
}
