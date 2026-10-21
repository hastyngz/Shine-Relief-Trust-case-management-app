/**
 * Registers the offline app-shell service worker in production builds only,
 * unless caching has been switched off (Task 1).
 *
 * The service worker is intentionally separate from the Firebase Messaging
 * worker (/push/firebase-messaging-sw.js). They run at different scopes: this
 * one owns the page (/), the messaging worker owns /push/. Keeping them apart
 * means updating the app shell can never disturb push notifications.
 *
 * Two safety valves let caching be switched off without shipping a new build:
 *   - the VITE_ENABLE_APP_SHELL_CACHE build flag (default on in production), and
 *   - the runtime kill switch in src/pwa/killSwitch.ts (reads /sw-status.json).
 */
import { checkAppShellKillSwitch } from './killSwitch';
import { isAppShellCacheFlagEnabled } from './appShellFlag';

export const SW_UPDATE_AVAILABLE_EVENT = 'shine_sw_update_available';
export const SW_UPDATE_APPLIED_EVENT = 'shine_sw_update_applied';
export const CHUNK_LOAD_FAILED_EVENT = 'shine_chunk_load_failed';

let waitingRegistration: ServiceWorkerRegistration | null = null;

/**
 * Whether the build flag allows registering the app-shell worker. Defaults to
 * enabled so production keeps caching even if the variable is not set, but
 * VITE_ENABLE_APP_SHELL_CACHE="false" switches it off at build time.
 */
export function isAppShellCacheEnabled(): boolean {
  return isAppShellCacheFlagEnabled(import.meta.env.VITE_ENABLE_APP_SHELL_CACHE);
}

function canRegister(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  // Only production builds serve the generated /sw.js.
  if (import.meta.env.DEV) return false;
  return isAppShellCacheEnabled();
}

function announceUpdate(registration: ServiceWorkerRegistration): void {
  waitingRegistration = registration;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SW_UPDATE_AVAILABLE_EVENT));
  }
}

/** Tell the waiting app-shell worker to take over; its assets are already cached. */
export function applyServiceWorkerUpdate(): void {
  const registration = waitingRegistration;
  if (!registration || !registration.waiting) {
    if (typeof window !== 'undefined') window.location.reload();
    return;
  }
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  registration.waiting.addEventListener('statechange', () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SW_UPDATE_APPLIED_EVENT));
      window.location.reload();
    }
  });
}

/**
 * Watches for a lazy chunk that fails to download (usually because a new version
 * deleted the old hashed file). Instead of a blank screen, it asks the app to
 * show the existing "new version available" message.
 */
function watchForChunkLoadFailures(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      window.dispatchEvent(new Event(CHUNK_LOAD_FAILED_EVENT));
    }
  });
}

export function isChunkLoadError(reason: unknown): boolean {
  const message = reason && typeof reason === 'object' && 'message' in reason
    ? String((reason as { message?: unknown }).message)
    : String(reason ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message);
}

function register(): void {
  if (!canRegister()) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        announceUpdate(registration);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            announceUpdate(registration);
          }
        });
      });
    }).catch((error) => {
      console.warn('[pwa] app shell service worker registration failed:', error);
    });
  });
}

/**
 * Entry point called from main.tsx. Registration is best-effort and never blocks
 * rendering: a failed or hanging service worker install cannot stop the app from
 * loading normally from the network. The kill switch is checked at startup and
 * whenever the browser comes back online.
 */
export function registerAppShellServiceWorker(): void {
  if (typeof window === 'undefined') return;
  watchForChunkLoadFailures();
  register();
  void checkAppShellKillSwitch();
  window.addEventListener('online', () => {
    void checkAppShellKillSwitch();
  });
}
