import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Task 5 regression guard: the app shell is cached for offline use, sensitive
// traffic is never cached, push notifications keep their own worker, and the
// update prompt never reloads over unsaved form data.
// ---------------------------------------------------------------------------
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

const template = read('src/pwa/sw-template.js');
const plugin = read('src/pwa/appShellPlugin.ts');

// 1. The worker precaches the shell and never caches sensitive traffic.
for (const forbidden of ['api', 'googleapis', 'firebaseio', 'firebaseapp', 'firebasestorage', 'cloudflarestorage']) {
  assert.ok(template.includes(forbidden), `the service worker must refuse to cache ${forbidden}`);
}
assert.ok(/request\.mode === 'navigate'/.test(template), 'navigations fall back to the cached shell offline');
assert.ok(/caches\.open\(CACHE_NAME\)/.test(template), 'the worker opens a shell cache');
assert.ok(/request\.method !== 'GET'/.test(template), 'only GET requests are cached');
assert.ok(/self\.location\.origin/.test(template), 'only same-origin requests are cached');
assert.ok(template.includes('%PRECACHE%') && template.includes('%VERSION%'), 'the worker template has build placeholders');

// 2. The build plugin emits the worker and the manifest.
assert.ok(/writeFileSync\(join\(distDir, SW_FILENAME\)/.test(plugin), 'the plugin writes sw.js into dist');
assert.ok(/manifest\.webmanifest/.test(read('index.html')), 'index.html links the web app manifest');
assert.ok(existsSync(join(root, 'public/manifest.webmanifest')), 'the web app manifest exists');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
assert.equal(manifest.display, 'standalone', 'the manifest requests standalone display');
assert.ok(manifest.icons.length > 0 && manifest.icons.every((icon: any) => icon.src.startsWith('/')), 'the manifest uses the existing SHINE logos');
assert.ok(manifest.icons.every((icon: any) => !icon.src.startsWith('http')), 'manifest icons are served from the app origin');

// 3. Push notifications keep a separate worker with its own scope.
assert.ok(existsSync(join(root, 'public/push/firebase-messaging-sw.js')), 'the Firebase messaging worker moved under /push/');
const messagingService = read('src/services/messagingService.ts');
assert.ok(messagingService.includes('/push/firebase-messaging-sw.js'), 'messagingService registers the push worker');
assert.ok(/scope:\s*'\/push\/'/.test(messagingService), 'the push worker has its own scope');
assert.ok(!existsSync(join(root, 'public/firebase-messaging-sw.js')), 'the old root messaging worker is gone to avoid a scope clash');

// 4. Registration happens only in production builds and never auto-reloads.
const main = read('src/main.tsx');
assert.ok(main.includes('registerAppShellServiceWorker'), 'main.tsx registers the app shell worker');
const register = read('src/pwa/registerServiceWorker.ts');
assert.ok(/import\.meta\.env\.DEV/.test(register), 'the worker is only registered outside dev builds');
assert.ok(/register\('\/sw\.js', \{ scope: '\/' \}\)/.test(register), 'the app shell worker owns the root scope');
assert.ok(!/window\.location\.reload\(\)\s*;?\s*\}\s*catch/.test(register), 'registration never force-reloads');

// 5. The update prompt respects unsaved form data.
const banner = read('src/components/Update/UpdateAvailableBanner.tsx');
assert.ok(banner.includes('hasUnsavedChanges'), 'the update banner checks for unsaved work');
assert.ok(banner.includes('window.confirm'), 'the update banner confirms before discarding unsaved work');
assert.ok(read('src/App.tsx').includes('markUnsavedChanges'), 'App marks form views as holding unsaved work');

// 6. If a build exists, the emitted worker is valid and mentions the shell.
const swPath = join(root, 'dist/sw.js');
if (existsSync(swPath)) {
  const sw = read('dist/sw.js');
  assert.ok(!/const PRECACHE_URLS = %PRECACHE%/.test(sw), 'the built worker replaced the precache placeholder');
  assert.ok(!/CACHE_NAME = CACHE_PREFIX \+ '%VERSION%'/.test(sw), 'the built worker replaced the version placeholder');
  const precacheMatch = sw.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
  assert.ok(precacheMatch, 'the built worker lists precache URLs');
  const precache = JSON.parse(precacheMatch![1]);
  assert.ok(precache.includes('/index.html'), 'the shell HTML is precached');
  assert.ok(precache.some((url: string) => url.startsWith('/assets/') && url.endsWith('.js')), 'built JS is precached');
  assert.ok(precache.some((url: string) => url.startsWith('/assets/') && url.endsWith('.css')), 'built CSS is precached');
  assert.ok(precache.includes('/shine-logo.png'), 'logos are precached');
  assert.ok(existsSync(join(root, 'dist/manifest.webmanifest')), 'the manifest is copied into the build');
  assert.ok(existsSync(join(root, 'dist/push/firebase-messaging-sw.js')), 'the push worker is copied into the build');
}

// 7. Task 1: kill switch and lazy-chunk safety.
const reloadGuard = new Map<string, string>();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    sessionStorage: {
      getItem: (key: string) => reloadGuard.get(key) ?? null,
      setItem: (key: string, value: string) => { reloadGuard.set(key, value); },
    },
    location: { reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  },
});
const { isAppShellCacheFlagEnabled } = await import('../src/pwa/appShellFlag');
const { isChunkLoadError } = await import('../src/pwa/registerServiceWorker');
const killSwitch = await import('../src/pwa/killSwitch');

// 7a. The build flag can switch registration off (default stays on).
assert.equal(isAppShellCacheFlagEnabled(undefined), true, 'caching defaults to enabled when the flag is unset');
assert.equal(isAppShellCacheFlagEnabled('true'), true);
assert.equal(isAppShellCacheFlagEnabled('false'), false, 'VITE_ENABLE_APP_SHELL_CACHE=false disables registration');
assert.equal(isAppShellCacheFlagEnabled('0'), false);
assert.ok(register.includes('isAppShellCacheEnabled'), 'registration is gated on the flag');

// 7b. A failed/hanging status fetch changes nothing.
const neverFetch = async () => { throw new Error('offline'); };
assert.equal(await killSwitch.fetchSwStatus(neverFetch), null, 'a failed status fetch is ignored');
const notOkFetch = async () => ({ ok: false, json: async () => ({ enabled: false }) });
assert.equal(await killSwitch.fetchSwStatus(notOkFetch), null, 'a non-OK status response is ignored');
const missingEnabled = async () => ({ ok: true, json: async () => ({}) });
assert.equal(await killSwitch.fetchSwStatus(missingEnabled), null, 'a status file without an enabled flag is ignored');
const disabledStatus = async () => ({ ok: true, json: async () => ({ enabled: false }) });
assert.deepEqual(await killSwitch.fetchSwStatus(disabledStatus), { enabled: false });
const enabledStatus = async () => ({ ok: true, json: async () => ({ enabled: true }) });
assert.deepEqual(await killSwitch.fetchSwStatus(enabledStatus), { enabled: true });

// 7c. Kill switch on unregisters shell workers (not push) and deletes shell caches.
function deps(status: { enabled: boolean } | null | (() => Promise<never>), options: { unsaved?: boolean } = {}) {
  const unregistered: string[] = [];
  const deleted: string[] = [];
  let reloads = 0;
  const registrations = [
    { scope: 'https://app.example.com/', unregister: async () => { unregistered.push('/'); return true; } },
    { scope: 'https://app.example.com/push/', unregister: async () => { unregistered.push('/push/'); return true; } },
  ];
  const cacheKeys = ['shine-shell-abc', 'shine-shell-def', 'firebase-messaging-sw-cache', 'other-cache'];
  const fetchFn = async () => {
    if (typeof status === 'function') return status();
    return { ok: true, json: async () => status };
  };
  return {
    deps: {
      fetchFn: fetchFn as any,
      getRegistrations: async () => registrations,
      getCacheKeys: async () => cacheKeys,
      deleteCache: async (name: string) => { deleted.push(name); return true; },
      reload: () => { reloads += 1; },
      hasUnsaved: () => options.unsaved === true,
    },
    unregistered,
    deleted,
    reloads: () => reloads,
  };
}

const disabled = deps({ enabled: false });
const outcome = await killSwitch.checkAppShellKillSwitch(disabled.deps as any);
assert.equal(outcome?.disabled, true, 'the kill switch reports it ran');
assert.deepEqual(disabled.unregistered, ['/'], 'only the shell worker is unregistered, not push');
assert.deepEqual(disabled.deleted, ['shine-shell-abc', 'shine-shell-def'], 'only shine-shell-* caches are deleted');
assert.equal(disabled.reloads(), 1, 'the app reloads once when caching is switched off');

const enabled = deps({ enabled: true });
const noOutcome = await killSwitch.checkAppShellKillSwitch(enabled.deps as any);
assert.equal(noOutcome, null, 'an enabled status leaves caching untouched');
assert.equal(enabled.reloads(), 0, 'no reload when caching is still enabled');

const unreachable = deps(null);
assert.equal(await killSwitch.checkAppShellKillSwitch(unreachable.deps as any), null, 'an unreachable status file leaves everything alone');
assert.equal(unreachable.reloads(), 0);

// 7d. Unsaved form data blocks the reload but still unregisters and clears caches.
const unsaved = deps({ enabled: false }, { unsaved: true });
const unsavedOutcome = await killSwitch.checkAppShellKillSwitch(unsaved.deps as any);
assert.equal(unsavedOutcome?.disabled, true);
assert.deepEqual(unsaved.unregistered, ['/'], 'caching is still switched off with unsaved changes');
assert.deepEqual(unsaved.deleted, ['shine-shell-abc', 'shine-shell-def']);
assert.equal(unsavedOutcome?.reloaded, false, 'the reload is skipped while a form holds unsaved data');
assert.equal(unsaved.reloads(), 0);

// A blocked reload must not consume the one-reload guard: once the form is clean,
// a subsequent status check should reload the now-uncached network app.
reloadGuard.clear();
const laterClean = deps({ enabled: false });
const laterOutcome = await killSwitch.checkAppShellKillSwitch(laterClean.deps as any);
assert.equal(laterOutcome?.reloaded, true, 'the kill switch reloads once a previously dirty form is clean');
assert.equal(laterClean.reloads(), 1);

// 7e. A lazy chunk failure is recognised so the friendly message can be shown.
assert.equal(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/Foo.js')), true);
assert.equal(isChunkLoadError(new Error('Importing a module script failed.')), true);
assert.equal(isChunkLoadError(new Error('Some unrelated render error')), false);
assert.ok(read('src/components/Error/ErrorBoundary.tsx').includes('isChunkLoadError'), 'the error boundary shows the update message for a missing chunk');
assert.ok(read('src/components/Update/UpdateAvailableBanner.tsx').includes('CHUNK_LOAD_FAILED_EVENT'), 'the update banner reacts to chunk-load failures');

console.log('Offline app shell tests passed: shell precache, no sensitive caching, separate push worker, safe update prompt, kill switch.');

