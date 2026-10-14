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

console.log('Offline app shell tests passed: shell precache, no sensitive caching, separate push worker, safe update prompt.');
