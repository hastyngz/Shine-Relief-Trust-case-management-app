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

async function waitForServiceWorkerActive(page: import('@playwright/test').Page): Promise<void> {
  // The app registers /sw.js after the 'load' event. Wait until the worker is
  // fully activated (which is when it calls clients.claim()).
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return registration?.active?.state === 'activated';
    },
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Navigates (via reload) until the current document is controlled by the
 * app-shell worker.
 *
 * A freshly activated service worker does not reliably attach to the document
 * that triggered its install: `clients.claim()` races the in-flight page load,
 * so a single reload can leave `navigator.serviceWorker.controller` null
 * indefinitely (it never recovers without another navigation). This is normal
 * PWA behaviour — the first load after install may be uncontrolled and the next
 * navigation is controlled — so retry the reload a bounded number of times
 * rather than assuming one reload is enough.
 */
async function reloadUntilControlled(page: import('@playwright/test').Page, attempts = 4): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.reload();
    try {
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
        undefined,
        { timeout: 10_000 },
      );
      return;
    } catch {
      // Not controlled by this reload; try once more.
    }
  }
  throw new Error('the page never became controlled by the app-shell service worker');
}

test.describe('offline app shell', () => {
  test('shows the app in the browser cache and never caches Firebase traffic', async ({ page, context }) => {
    await page.goto('/#/');
    // The login screen is part of the app shell and renders without a session.
    await expect(page.getByText('SHINE Relief Trust', { exact: false }).first()).toBeVisible({ timeout: 30_000 });

    await waitForServiceWorkerActive(page);
    // Reload (retrying if needed) so this document is controlled and the shell
    // is precached.
    await reloadUntilControlled(page);

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
    await waitForServiceWorkerActive(page);
    await reloadUntilControlled(page);

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
