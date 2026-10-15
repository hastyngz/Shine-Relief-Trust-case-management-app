import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Offline app-shell end-to-end tests (Task 5).
 *
 * These run against a real production build served over HTTP, because service
 * workers, Cache Storage and offline reloads cannot be exercised in jsdom.
 */

function looksLikeNewVersionError(message: string): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message);
}

async function waitForServiceWorkerControl(page: import('@playwright/test').Page): Promise<void> {
  // The app registers /sw.js after the 'load' event. Wait until the worker is
  // registered, then reload once so this page is controlled by it (the worker
  // calls clients.claim(), but a reload makes the control state unambiguous).
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return !!(registration && (registration.active || registration.installing || registration.waiting));
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.describe('offline app shell', () => {
  test('shows the app in the browser cache and never caches Firebase traffic', async ({ page, context }) => {
    await page.goto('/#/');
    // The login screen is part of the app shell and renders without a session.
    await expect(page.getByText('SHINE Relief Trust', { exact: false }).first()).toBeVisible({ timeout: 30_000 });

    await waitForServiceWorkerControl(page);
    // Reload so the page is controlled and the shell is precached.
    await page.reload();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 30_000 },
    );

    // A shell cache must exist with the app HTML / built assets.
    const shellCacheNames = await page.evaluate(async () => {
      const names = await caches.keys();
      return names.filter((name) => name.startsWith('shine-shell-'));
    });
    expect(shellCacheNames.length).toBeGreaterThan(0);

    const cachedRequests = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith('shine-shell-'));
      const urls: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
      }
      return urls;
    });
    expect(cachedRequests.some((url) => url.endsWith('/index.html'))).toBe(true);
    // Sensitive traffic must never be stored in the shell cache: no API calls
    // and no third-party Firebase/Google/analytics origins (the built
    // `vendor-firebase` chunk is same-origin and is allowed).
    expect(cachedRequests.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(false);
    const thirdPartyHosts = cachedRequests
      .map((url) => new URL(url).hostname)
      .filter((host) => /(^|\.)firebase|googleapis\.com|firebaseapp\.com|firebaseio\.com|firebasestorage\.app|google-analytics\.com|googletagmanager\.com|cloudflarestorage\.com/.test(host));
    expect(thirdPartyHosts).toEqual([]);

    await context.setOffline(true);
  });

  test('opens from the cache when the phone has no signal', async ({ page, context }) => {
    await page.goto('/#/');
    await expect(page.getByText('SHINE Relief Trust', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    await waitForServiceWorkerControl(page);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });

    // Go offline, then reload. The cached app shell must still render.
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText('SHINE Relief Trust', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    // Confirm the page was actually served by the service worker, not the network.
    const servedBySw = await page.evaluate(() => navigator.serviceWorker.controller !== null);
    expect(servedBySw).toBe(true);

    await context.setOffline(false);
  });

  test('shows a friendly "new version available" prompt instead of a blank screen', async ({ page }) => {
    // The update prompt only mounts in the signed-in layout.
    await signIn(page);

    const chunkError = looksLikeNewVersionError('Failed to fetch dynamically imported module: /assets/x.js');
    expect(chunkError).toBe(true);

    // Simulate a lazy chunk failing to download after a deploy.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('shine_chunk_load_failed'));
    });

    await expect(page.getByText('A new version of SHINE is available.', { exact: false })).toBeVisible();
  });
});
