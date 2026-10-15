# Offline app shell (service worker)

The app ships a service worker (`src/pwa/sw-template.js`, emitted as `/sw.js`
at build time) that precaches the built HTML, JS, CSS and logos so the app
opens without a signal. It never caches `/api/*`, Firebase/Firestore/Auth
traffic or storage download URLs.

Push notifications keep their own worker at `/push/firebase-messaging-sw.js`
(scope `/push/`), so it never competes with the app shell worker at scope `/`.
Updating the app shell cannot disturb push.

## How to test offline on a phone or laptop

1. Build and serve the production bundle:
   ```bash
   npm run build
   npm run start        # serves dist/ (and the API) on the app port
   ```
   Alternatively serve just the static build: `npx serve -s dist`.
2. Open the app in a browser and sign in once while online so the shell and the
   Firebase assets are cached.
3. In DevTools > Application > Service Workers, confirm `sw.js` is activated.
   In Application > Cache Storage, confirm a `shine-shell-<buildid>` cache
   holds `index.html`, `assets/*.js`, `assets/*.css` and the logos.
4. Turn the device to airplane mode (or tick DevTools > Network > Offline) and
   reload. The app shell must still load and render the login/dashboard.
5. Queue an edit while offline. It must appear in the sync badge count and be
   flushed when the connection returns.

## Verifying the "Update available" prompt

1. Serve build A, open the app.
2. Rebuild (`npm run build`) and reload the tab. The new worker installs but
   waits; an "A new version of SHINE is available" banner appears with a
   Reload button.
3. Open a data-entry form (for example Add Girl) before reloading: the banner
   asks you to save first and only reloads after you confirm, so unsaved form
   data is never silently lost.

Automated coverage lives in `scripts/app-shell-offline.test.ts`
(`npm run test:app-shell`).

## Switching the app-shell cache off (Task 1)

There are two independent switches. Use them if a release's caching misbehaves.

### 1. Build-time flag
`VITE_ENABLE_APP_SHELL_CACHE` defaults to enabled. Build with it set to `false`
to ship a build that never registers the service worker:

```bash
VITE_ENABLE_APP_SHELL_CACHE=false npm run build
```

The flag only stops *new* registrations; it does not remove an already
installed worker. Use the kill switch for that.

### 2. Remote kill switch (no rebuild needed)
The app fetches `/sw-status.json` at startup and whenever it comes back online,
always with `cache: 'no-store'` (the worker never caches it). To switch caching
off for everyone, change the deployed file to:

```json
{ "enabled": false }
```

When the app sees that, it unregisters the app-shell worker, deletes every cache
whose name starts with `shine-shell-`, and reloads once. The reload is skipped
while a form holds unsaved data (it happens on the next visit instead). The
push-notification worker at `/push/` is deliberately left alone so background
notifications keep working. If the file cannot be fetched (offline), nothing
happens.

To turn caching back on, set `{ "enabled": true }` (or delete the file).

## Recovering a device stuck on a broken version

1. If you can reach the device: set `/sw-status.json` to `{ "enabled": false }`
   and ask the person to reopen the app or tap reload. The worker unregisters
   and the shell caches are cleared on the next load.
2. If you cannot: tell the person to open the app, then in the browser menu
   choose "Clear browsing data" / "Site settings" for the site, or open the app
   in a private/incognito tab. Both bypass or remove the cached worker.
3. Reinstall from the Play Store / Add to Home Screen once the fix is deployed.

## Keeping open pages safe from stale lazy chunks

The worker keeps the previous `shine-shell-*` cache for up to 7 days, so a page
that is still open can keep fetching its own hashed lazy chunks after a deploy.
If a lazy chunk still fails to load, the app shows a friendly "A new version is
available, reload" message (through `src/components/Error/ErrorBoundary.tsx`)
instead of a blank screen.

