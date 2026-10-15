/**
 * Remote kill switch for the offline app-shell caching (Task 1).
 *
 * A buggy service worker can leave staff stuck on a broken version that is very
 * hard to fix remotely. This module lets the app switch caching off at runtime:
 * it fetches a tiny, never-cached status file and, when it says caching is
 * disabled, unregisters the app-shell worker, deletes the shell caches and
 * reloads once.
 *
 * Nothing here is allowed to block the app from loading: the status fetch is
 * best-effort, a failed/hanging fetch is ignored, and the reload is skipped
 * while a view holds unsaved form data.
 */
import { hasUnsavedChanges } from './unsavedChanges';

export const SW_STATUS_URL = '/sw-status.json';
export const SHELL_CACHE_PREFIX = 'shine-shell-';
/** Registrations under this scope are push notifications, not the app shell. */
export const PUSH_SCOPE = '/push/';
const RELOAD_GUARD_KEY = 'shine_kill_switch_reloaded';

export interface KillSwitchDeps {
  fetchFn: (input: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  getRegistrations: () => Promise<ReadonlyArray<{ scope: string; unregister: () => Promise<boolean> }>>;
  getCacheKeys: () => Promise<string[]>;
  deleteCache: (name: string) => Promise<boolean>;
  reload: () => void;
  hasUnsaved: () => boolean;
}

export interface KillSwitchOutcome {
  /** Whether the status file was read and asked for caching to be disabled. */
  disabled: boolean;
  unregistered: number;
  cachesDeleted: string[];
  reloaded: boolean;
}

/** Reads /sw-status.json with cache: 'no-store'. Any failure returns null. */
export async function fetchSwStatus(
  fetchFn: KillSwitchDeps['fetchFn'],
  url: string = SW_STATUS_URL,
): Promise<{ enabled: boolean } | null> {
  try {
    const response = await fetchFn(url, { cache: 'no-store' });
    if (!response || !response.ok) return null;
    const data = (await response.json()) as { enabled?: unknown } | null;
    if (!data || typeof data.enabled !== 'boolean') return null;
    return { enabled: data.enabled };
  } catch {
    // Offline or a missing file: do nothing.
    return null;
  }
}

/**
 * Unregisters every service worker registration this app owns, except the
 * push-notification worker (scope /push/), which must keep working so
 * background notifications are not lost when caching is switched off.
 */
export async function unregisterAppShellWorkers(deps: KillSwitchDeps): Promise<number> {
  let unregistered = 0;
  let registrations: ReadonlyArray<{ scope: string; unregister: () => Promise<boolean> }> = [];
  try {
    registrations = await deps.getRegistrations();
  } catch {
    return 0;
  }
  for (const registration of registrations) {
    const scope = registration.scope || '';
    try {
      const isPush = scope.endsWith(PUSH_SCOPE);
      if (isPush) continue;
      if (await registration.unregister()) unregistered += 1;
    } catch {
      /* A single failing unregister must not abort the rest. */
    }
  }
  return unregistered;
}

/** Deletes every cache whose name starts with 'shine-shell-'. */
export async function deleteShellCaches(deps: KillSwitchDeps): Promise<string[]> {
  let keys: string[] = [];
  try {
    keys = await deps.getCacheKeys();
  } catch {
    return [];
  }
  const shellCaches = keys.filter((key) => key.startsWith(SHELL_CACHE_PREFIX));
  await Promise.all(shellCaches.map(async (key) => {
    try {
      await deps.deleteCache(key);
    } catch {
      /* ignore individual cache deletion failures */
    }
  }));
  return shellCaches;
}

/** Unregisters the shell worker, deletes shell caches, and reloads once. */
export async function applyKillSwitch(deps: KillSwitchDeps): Promise<KillSwitchOutcome> {
  const unregistered = await unregisterAppShellWorkers(deps);
  const cachesDeleted = await deleteShellCaches(deps);
  let reloaded = false;
  if (!deps.hasUnsaved()) {
    deps.reload();
    reloaded = true;
  }
  return { disabled: true, unregistered, cachesDeleted, reloaded };
}

function guardAlreadyReloaded(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY)) return true;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    return false;
  } catch {
    // If sessionStorage is unavailable, allow one reload attempt.
    return false;
  }
}

function browserDeps(): KillSwitchDeps | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  const cachesApi = typeof caches !== 'undefined' ? caches : undefined;
  return {
    fetchFn: (input, init) => fetch(input, init),
    getRegistrations: () => navigator.serviceWorker.getRegistrations(),
    getCacheKeys: () => (cachesApi ? cachesApi.keys() : Promise.resolve([])),
    deleteCache: (name) => (cachesApi ? cachesApi.delete(name) : Promise.resolve(false)),
    reload: () => window.location.reload(),
    hasUnsaved: hasUnsavedChanges,
  };
}

/**
 * Checks the remote kill switch. Safe to call at startup and on 'online'; it
 * never throws and never blocks rendering.
 */
export async function checkAppShellKillSwitch(deps?: KillSwitchDeps): Promise<KillSwitchOutcome | null> {
  const resolved = deps || browserDeps();
  if (!resolved) return null;
  const status = await fetchSwStatus(resolved.fetchFn);
  if (!status || status.enabled) return null;
  // Clear the worker and caches immediately, but do not consume the one-reload
  // guard while a form is dirty. A later startup/online check can reload safely.
  if (resolved.hasUnsaved()) return applyKillSwitch(resolved);
  if (guardAlreadyReloaded()) {
    // Already reloaded once for this session; still make sure caching is off.
    const unregistered = await unregisterAppShellWorkers(resolved);
    const cachesDeleted = await deleteShellCaches(resolved);
    return { disabled: true, unregistered, cachesDeleted, reloaded: false };
  }
  return applyKillSwitch(resolved);
}
