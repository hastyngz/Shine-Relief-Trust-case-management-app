# SHINE Android and weak-signal acceptance runbook

**Status:** Test preparation only. No physical Android acceptance test has been performed.
**Data boundary:** Synthetic test accounts and records only. Do not use real beneficiary, employee, safeguarding, financial, or health data.
**Environment:** A confirmed isolated staging/test Firebase project and corresponding API/storage targets are required. Do not point this runbook at production.
**AI-provider work:** Explicitly excluded from these scenarios.

## Purpose and exit criteria

Verify that an authorized staff member can continue a supported workflow on the installed Android PWA during a real outage or weak signal, retain a clear pending state, and recover after reconnect without data loss or duplicate records. Confirm role boundaries continue to apply offline and after synchronization.

Release readiness requires a recorded physical-device run with all required scenarios passing, any failures triaged, and the exact app commit/build and test environment recorded. Passing desktop Playwright E2E is useful but does not substitute for this acceptance run.

## Preconditions and safety

- Use a confirmed, isolated test Firebase project with synthetic-only data and its matching storage/API backend. Record project ID, Worker/API target, and app build before starting. If any target is uncertain or contains live data, stop.
- Use one synthetic active Staff account, one synthetic View Only account, and separate test records labelled clearly (for example, `ANDROID-OFFLINE-<run-id>`). Do not use a real person’s name, email, phone, identifier, case notes, or payroll details.
- Install the current app as a PWA on a physical Android device. Record device model, Android version, browser/WebView version, app commit, install date, and available storage. Synchronize device time.
- Ensure a test operator can inspect the synthetic records in the staging app after reconnection. Have a cleanup plan for test-only data.
- Record outcomes as Pass, Fail, Blocked, or Not Run, with timestamp and a synthetic record key only. Redact tokens, full email addresses, request headers, and personal information from screenshots/logs.
- Do not clear app data, uninstall, switch accounts, or alter server rules during a test unless that scenario explicitly calls for it. Stop immediately if the app displays production data or an unexpected account.

## Network conditions

Run the core workflow twice: first with full offline mode, then with a controlled weak/intermittent connection. Prefer Android Developer Options or a test access point/router that can reproduce high latency, low bandwidth, and intermittent drops. Record the method and approximate conditions; do not rely on a desktop browser’s offline toggle as a substitute for the physical-device run.

1. **Offline:** complete radio/network disconnection (for example, airplane mode with Wi-Fi confirmed off). Verify no background mobile data remains active.
2. **Weak/intermittent:** use a controlled connection with high round-trip latency, low throughput, and brief disconnect/reconnect cycles. Record measured or configured values where available.
3. **Normal reconnect:** restore stable Wi-Fi and leave the app foregrounded long enough for queue processing to finish.

## Scenarios and evidence

| ID | Scenario | Procedure | Pass criteria | Result / notes |
|---|---|---|---|---|
| A1 | Warm offline launch | Sign in online first, install/open the PWA, then go fully offline and cold-launch it. | App shell and permitted cached workspace open without a blank screen or false “online” claim; auth and cache state are clearly distinguished. | |
| A2 | Save supported case goal offline | As Staff, create a synthetic case goal with a unique run ID while offline; navigate away and reopen the view. | UI says queued/pending rather than cloud-saved; draft and stable ID remain after reopening; no duplicate appears. | |
| A3 | Queue survives app restart | With A2 pending, close the PWA from Android’s app switcher and reopen while still offline. | Pending state and draft remain; no silent discard or duplicate local record. | |
| A4 | Save synthetic salary-history change offline | Use only the dedicated synthetic employee record and the approved salary-history workflow. Record a harmless synthetic test value, then reopen the panel offline. | UI marks the record pending; queued value remains visible; no claim of cloud sync while disconnected. No real payroll data is entered. | |
| A5 | Weak-signal save and interruption | Under controlled weak signal, save a distinct synthetic supported record; briefly drop connection during submission. | UI remains responsive, explains pending/uncertain state, preserves the draft, and retries do not create duplicate records. | |
| A6 | Reconnect and reconcile | Restore stable network; keep the app open and observe the normal queue flush. Inspect the synthetic record from a second staging session after sync. | Each accepted operation appears exactly once with the expected value; pending indicator clears only after server acknowledgment; failures remain actionable. | |
| A7 | Retry after uncertain response | Simulate a connection loss immediately after submit, then reopen/refresh and retry using the same synthetic operation. | Existing server record is recognized or a clear conflict is shown; no second logical write is created. | |
| A8 | Permission denial | As the synthetic View Only user, attempt supported write actions online and offline; reconnect if an item is locally queued. | UI does not imply an unauthorized write is saved; server denies direct writes; no denied item is silently applied or retried as success. | |
| A9 | Account boundary | With no pending items, sign out and sign into the second synthetic account. Do not switch while the first account has pending work unless deliberately testing account isolation. | The second account cannot see or replay the first account’s queued data. Pending work remains associated with its original owner and is handled safely after reauth. | |
| A10 | Recovery after server rejection | Cause a controlled denial using staging permissions or an invalid synthetic request approved for the test; then inspect recovery UI. | User receives an actionable rejected/conflict state, retained data is not represented as synced, and retry does not bypass permission. | |
| A11 | Inventory operations (defer until transaction work is released) | After the server-validated inventory transaction path and its checks are complete, repeat one receive and one issue with unique synthetic operation IDs under offline/weak conditions. | Queue/retry is idempotent; no negative balance; movement and balance reconcile exactly once; unauthorized writes are rejected. | Not Run — wait for inventory transaction implementation and CI. |
| A12 | Cleanup | Confirm all test writes are in the isolated project, remove or archive only run-labelled synthetic data using the approved staging cleanup procedure, and sign out. | No test record is removed from production; test account and evidence are handled per staging policy. | |

## Run record

- Test run ID:
- Date/time and time zone:
- Tester:
- App commit/build:
- Firebase staging project ID:
- Storage/API/Worker target:
- Android device / OS:
- Browser or installed PWA version:
- Network tool/method and configured/measured conditions:
- Synthetic account aliases/roles (no credentials):
- Results for A1–A12:
- Defects opened and severity:
- Cleanup verified by:
- Overall outcome: Pass / Fail / Blocked / Not Run

## Stop conditions

Stop and preserve only redacted evidence if: the app connects to a project that is not confirmed as staging; real records appear; a save is presented as successful without local or server evidence; a role boundary is bypassed; queued data appears under another account; duplicate or negative inventory is observed; or the app loses a pending draft. Do not “repair” production data or relax rules to get a pass.
