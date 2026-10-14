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
