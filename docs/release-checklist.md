# SHINE release checklist (non-technical)

Use a laptop with Chrome. Test with demo/test records only—never use real girls' personal or health details in screenshots or test notes.

## 1. Offline edit and recovery
1. Open SHINE while online and sign in.
2. Open a test girl's record, make a harmless change, and save.
3. Open Chrome DevTools (F12) → Network → select **Offline**.
4. Make another harmless change and save.
5. Confirm the offline indicator appears and the queued-change count increases.
6. Select **No throttling** (or uncheck Offline). Wait for sync and confirm the saved change remains.
7. If the change does not sync, do not repeat edits blindly. Open the Sync conflicts panel and follow the conflict choice.

## 2. Two-device conflict (two Chrome profiles)
1. Open two Chrome profiles and sign in as two separate test staff accounts.
2. In both profiles, open the same test girl's record and set each profile to Network → Offline.
3. Make different changes in each profile and save.
4. Bring profile A online first and wait for sync. Then bring profile B online.
5. Confirm profile B shows a conflict instead of silently replacing profile A's edit.
6. Test **Keep mine** and **Keep theirs** on separate test conflicts and confirm the chosen version is retained.

## 3. App-shell offline loading
1. While online, load SHINE and wait for the page to finish loading.
2. DevTools → Application → Service Workers: confirm /sw.js is active.
3. Application → Cache Storage: confirm a shine-shell-* cache exists.
4. Switch Network → Offline and reload. The app shell should render.
5. Restore Network → No throttling.

## 4. Emergency cache kill switch
1. In the deployed static files, set /sw-status.json to JSON with enabled set to false.
2. Reload SHINE while online. Confirm the root app-shell worker is unregistered and shine-shell-* caches are removed.
3. Confirm the /push/ Firebase Messaging worker remains registered.
4. Restore enabled to true after the incident is resolved.

## 5. Storage-quota warning
1. In a test environment, use DevTools Console to simulate a failing localStorage.setItem only if your developer has supplied the test snippet.
2. Trigger a save. Confirm a persistent storage warning is visible and the app does not claim the save succeeded.
3. Never use this test on a real user's only copy of important data.

## 6. Push notifications
1. Sign in with a test account and grant notification permission.
2. Confirm the Firebase Messaging service worker is registered at /push/firebase-messaging-sw.js with scope /push/.
3. Trigger a harmless test notification and confirm it arrives.
4. Confirm the app-shell worker remains at scope /; the two registrations must not replace one another.

## 7. Update banner and unsaved forms
1. Open a test form and enter text without saving.
2. Deploy a new test build so an update becomes available.
3. Confirm the update banner appears but does not reload over the open form.
4. Confirm the user can save or cancel the form before applying the update.
5. Test a failed lazy-loaded page chunk and confirm the friendly 'A new version is available, reload' message appears instead of a blank screen.

## Record the result
Record the build/commit, pass/fail for each section, browser version, and any non-sensitive error message. Never include girls' names, case details, health information, family details, tokens, or screenshots showing personal data.
