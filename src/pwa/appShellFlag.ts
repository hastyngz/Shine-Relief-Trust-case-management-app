/**
 * Build-time switch for the offline app-shell cache (Task 1).
 *
 * VITE_ENABLE_APP_SHELL_CACHE defaults to enabled so production keeps caching,
 * but setting it to "false" (or "0") at build time stops the service worker
 * from ever being registered. Kept as a pure function so it is unit-testable
 * without Vite's import.meta.env.
 */
export function isAppShellCacheFlagEnabled(rawValue: unknown): boolean {
  if (rawValue === undefined || rawValue === null) return true;
  return rawValue !== 'false' && rawValue !== '0' && rawValue !== false;
}
