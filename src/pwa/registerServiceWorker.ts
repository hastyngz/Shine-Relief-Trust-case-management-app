/**
 * Registers the offline app-shell service worker in production builds only.
 *
 * The service worker is intentionally separate from the Firebase Messaging
 * worker (firebase-messaging-sw.js). They run at different scopes: this one
 * owns the page (/), the messaging worker owns its own registration used only
 * for push tokens. Keeping them apart means updating the app shell can never
 * disturb push notifications.
 */

export const SW_UPDATE_AVAILABLE_EVENT = 'shine_sw_update_available';
export const SW_UPDATE_APPLIED_EVENT = 'shine_sw_update_applied';

let waitingRegistration: ServiceWorkerRegistration | null = null;

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

export function registerAppShellServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Only production builds serve the generated /sw.js.
  if (import.meta.env.DEV) return;

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
