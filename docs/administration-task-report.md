# SHINE Administration Build-Out — Task Report

**Updated:** 2026-10-29  
**Working branch:** `Replit`  
**Scope:** Incremental reliability work; this report is not a declaration that the full Administration Officer scope is complete.

## This implementation pass

### Procurement payment recording
- Re-reads the current device-local procurement list before validating and appending a payment, instead of trusting an older React render.
- Adds a per-list in-flight lock to block rapid duplicate submissions within the same running screen.
- Revalidates payment ID, date, reference and outstanding balance at the append boundary.
- Keeps the payment draft when local persistence fails, so the operator can retry the same entered details rather than losing them.
- Adds regression assertions for successful append, non-mutation of the source list, duplicate payment IDs and overpayment.

## Verification status
- A fresh local repository checkout could not be run in this execution environment because outbound access to GitHub is unavailable. No local TypeScript/test/build result is claimed for this new change.
- The branch CI workflow is the authoritative next verification step; report its actual result before calling this pass verified.
- Prior exact-head commit `30f84bb68863b6c7bc6e0e639c903ae5b02f1a01` passed the configured GitHub Actions checks and browser E2E (run [40951483410](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40951483410)). That result does **not** cover this newer payment change.

## Known boundaries and outstanding administration work
- Cross-device atomic payment reconciliation is not implemented. The UI helper and local lock cannot prevent two separate devices from concurrently recording payments against stale balances; a server-authoritative transaction is required.
- A supplier/service-provider master register with cross-device deduplication, documents, performance and conflict declarations remains outstanding.
- Staff attendance, leave, onboarding and training/policy acknowledgements remain outstanding; any HR data model must preserve confidential staff-only permissions.
- Vehicle/driver, trip, fuel, mileage, servicing and repair workflows remain outstanding.
- Document filing still lacks complete target coverage and structured expiry/confidentiality/version history.
- Stock transfers and formal stock-issue approvals remain outstanding.
- Manager-only compliance verification and notifications remain outstanding.
- Real Android, offline/reconnect and weak-signal acceptance testing has not been performed.
- No production deployment, production Firestore rule change, or production data modification was performed.

## Safety constraints preserved
- Work remains on `Replit`; `main` is untouched.
- No new paid service or dependency was introduced.
- No live beneficiary, staff or financial records were used in tests.
- Do not represent inventory receipt as payment, or this local guard as a cross-device accounting control.


## Additional administration UI hardening
- The physical asset verification dialog now disables its submit control while saving and shows a saving state. Existing error handling keeps the dialog and entered observations available if local persistence fails.
- Added browser E2E coverage for registering a synthetic asset, recording a physical verification, confirming the register values remain unchanged, and checking that one history entry is recorded.
- Procurement payment safeguards passed GitHub Actions run [40952928028](https://github.com/hastyngz/Shine-Relief-Trust-case-management-app/actions/runs/40952928028). This verifies the configured checks for that earlier commit only; it does not establish cross-device atomic payment safety.
- Asset-verification browser E2E initially failed because its page-heading locator matched both “Asset Register” and “Export asset register”. Corrected the locator to require an exact heading match in commit `9b6581200bad67cc68296e28166a74079bb1de08`.
- Corrected the page-heading locator to require an exact accessible name in commit `9b6581200bad67cc68296e28166a74079bb1de08`.
- CI for the corrected commit has not yet been confirmed. Local execution is unavailable because this environment cannot reach GitHub; do not mark the browser flow verified until the exact-head run passes.

## Asset verification recovery regression (2026-10-29)
- Added a browser workflow that registers a synthetic asset, enters a physical-check discrepancy, forces the browser's SHINE database storage write to fail, and verifies that the dialog remains open with the observed location and note intact and that the register shows no false verification.
- The same workflow restores storage and retries, then checks that the verification appears in the asset history exactly once.
- This is test coverage for the existing local-save failure handling; it does not add server-side audit guarantees or cross-device asset-tag uniqueness.
- Verification is pending for the resulting Replit branch head. No local test/build is claimed in this environment. Do not mark the browser test passed until the exact-head CI E2E job completes successfully.

## Supplier activity index (2026-10-29)
- Added a read-only supplier activity index to the Procurement workspace, derived from supplier names already present in procurement quotes, household expenses and inventory item supplier fields.
- Names are grouped case-insensitively; the index shows quote count, distinct procurement-list count, expense-record count, inventory-item count and latest valid quote/expense date. It deliberately does not expose transaction amounts or supplier contact details.
- Added focused aggregation coverage to `scripts/procurement-workflow.test.ts` for case variants, distinct-list counts, expense records, date selection, ignored placeholder names and empty state.
- The index is not a verified supplier master register. Canonical supplier IDs, editable contact/business details, due-diligence documents, delivery performance, conflict declarations and server-enforced duplicate prevention remain outstanding.
- The test has not been run in this environment; exact-head CI verification remains pending. No production records or rules were changed.

## Budget scope and document filing improvements (2026-10-30)
- Added a shared reporting-scope label above the budget KPI cards: when no period is selected they cover all years; otherwise they cover the selected period. The label also states the active category scope. The monthly monitoring panel continues to show its separately selected summary year. This is a labelling correction, not a change to budget calculations.
- The document index now sorts its already permission-filtered attachments newest-first by upload timestamp. Legacy records with invalid/missing timestamps remain visible after dated files, preserving their original relative order. The sort helper is shared and has focused assertions for ordering, invalid dates and non-mutation. The result count now explicitly labels the order as “newest first”.
- These changes have not been run locally in this environment. Exact-head GitHub Actions verification remains required before calling them tested. No permission, storage, upload, or production-data behaviour was changed.


## Inventory expiry visibility (2026-10-30)
- The Inventory & Stores summary now separates expired stock from items expiring within 30 days while retaining the combined alert total and existing filter behaviour.
- Added a shared expiry-summary helper and focused regression assertions for expired, due-soon, safe, missing and invalid legacy expiry dates. Missing/invalid dates are counted as not tracked, not silently treated as safe.
- This is visibility only: it does not quarantine stock, change quantities or introduce expiry enforcement. Exact-head CI and local lint/build/test have not been run here; verification remains pending.


### 2026-10-30 · Inventory transaction date validation
- Added a shared strict ISO calendar-date validator for inventory movements and physical stocktakes; impossible dates (for example, 31 February) are rejected while valid leap days are accepted.
- Both online submissions and queued offline retries validate the saved date before calling the stock-movement service. A malformed legacy/corrupted queued date is marked for staff review and blocks later FIFO entries rather than being sent automatically.
- Added focused helper tests for valid dates, leap days, impossible dates and non-ISO formats. Exact-head CI is still required; no production data, stock balances, sync protocol or server rules were changed.


### 2026-10-30 · Inventory expiry data completeness and server validation coverage
- The Inventory & Stores dashboard now displays the number of records without a valid expiry date, and every item card explicitly shows either its expiry date/status or that the date needs adding/checking. Missing legacy dates are no longer invisible in the item list.
- Added Worker-level regression cases for impossible dates, non-ISO dates and empty dates. The tests assert the Worker rejects them before reading the item or attempting any stock write. Existing Worker validation already enforces real calendar dates; this change strengthens its regression coverage.
- Extended supplier activity tests with impossible quote/expense dates to ensure malformed dates cannot distort the latest activity date. No canonical supplier identities or new data fields were introduced.
- Exact-head CI remains unverified; no local execution or production deployment is claimed.


### 2026-10-30 · Inventory integrity audit date checks
- Extended the privacy-preserving inventory snapshot audit to count missing/impossible movement dates separately and include them in malformed-entry findings. It still returns aggregate counts only and does not expose record IDs or personal data.
- Added synthetic regression coverage for empty and impossible dates. This is an offline export audit only; it does not repair records or reconcile historical balances.


### 2026-10-30 · Supplier activity display normalization
- Supplier activity grouping now collapses repeated internal whitespace and trims leading/trailing spaces before case-insensitive grouping. This reduces obvious duplicate display rows without asserting legal/business identity or merging unrelated entities by fuzzy matching.
- Existing synthetic procurement test fixture now covers repeated whitespace; exact-head CI remains unverified.


### 2026-10-30 · Procurement quote integrity
- Supplier identity comparison for quote selection and approval now trims and collapses whitespace and compares case-insensitively. Repeated spaces can no longer make the same supplier appear as multiple independent quotes; this preserves the existing three-distinct-supplier requirement and MWK 500,000 default threshold.
- Imported quote dates are now checked as real Gregorian `YYYY-MM-DD` dates, including leap-day rules, rather than accepting impossible calendar dates. Added synthetic tests for whitespace-variant suppliers, impossible/non-leap dates and a valid leap day.
- Added explicit boundary tests: a quoted item at exactly MWK 500,000 requires three distinct suppliers, while a quoted item just below the threshold does not trigger that default requirement. These checks validate imported procurement records and approval calculations; they do not establish legal supplier identity or replace a verified supplier master register. Exact-head CI has not yet been confirmed.


### Procurement threshold fail-closed validation (2026-10-30)
- Approval now blocks if a stored/custom quote threshold is missing in an invalid form, non-finite, zero, negative or non-numeric. An invalid threshold cannot silently disable the three-quote check; the approval result reports the threshold problem and keeps the quote requirement conservative.
- Added synthetic tests for zero, negative, `NaN`, infinity and string thresholds. The configured/default threshold logic for valid positive numbers is unchanged. Exact-head CI remains unconfirmed.


### Procurement quote-entry consistency (2026-10-30)
- The supplier identity normalizer is now shared by the quote-entry screen, quote selection, import validation and approval checks. The UI warns immediately when a new quote repeats a supplier under a case/spacing variant, instead of allowing a duplicate that only fails later at approval.
- This complements the threshold fail-closed validation above; no supplier records are merged and no quote history is rewritten. Exact-head CI remains unconfirmed.


### Procurement import normalization correction (2026-10-30)
- A focused review found that imported *selected supplier* labels still used an over-escaped whitespace pattern, unlike the shared supplier identity helper. Corrected it so imported selected supplier labels collapse repeated whitespace as intended, and added a regression case proving a selected quote still matches when the imported label contains extra spaces.
- This was a source-review correction; tests have been added but have not been executed locally. Exact-head CI remains unconfirmed.


### Procurement threshold visibility (2026-10-30)
- The procurement item panel now flags a missing/invalid custom quote threshold and states that approval is blocked until a positive MWK threshold is restored. It also treats every item conservatively as requiring three quotes while the threshold is invalid, matching the approval guard rather than showing a misleading lower-quote state.
- No threshold value is silently rewritten. This is a user-facing warning only; exact-head CI and browser verification remain outstanding.

- The custom threshold input now advertises a positive whole-number MWK value (`min=1`, `step=1`) with an accessible label. The service-side fail-closed check remains authoritative for legacy/invalid stored values.


### Attachment deletion recovery safeguard (2026-10-30)
- Corrected the R2/Firestore deletion sequence: the private R2 object must delete successfully before its Firestore metadata is removed. The prior implementation swallowed every R2 error and proceeded, which could leave an orphaned private object after a transient network, permission or configuration failure.
- The Worker authorizes deletion using the still-present attachment metadata; R2 `DeleteObject` is idempotent for an already-missing object. Other storage errors now propagate and preserve the metadata for retry. If the subsequent Firestore metadata deletion fails, the object may already be gone, but the retained metadata allows a retry because the R2 delete is idempotent.
- The photo gallery now shows a visible retry-oriented error instead of only logging deletion failures. This change does not alter who may delete files, Worker authorization, storage paths, retention policy or Firestore rules. Automated execution and browser verification remain outstanding.


### Asset date integrity (2026-10-30)
- Asset registration/edit now validates optional acquisition, warranty-expiry and next-service dates using the shared strict Gregorian calendar validator before saving locally. Maintenance logging applies the same validation to the work date and optional next-service date. This rejects impossible dates such as 31 February even if malformed values bypass browser date controls.
- The shared validator already has focused unit coverage for ISO formatting, leap years and impossible dates in `scripts/inventory.test.ts`. The asset screens now consume that tested helper. No chronology policy (for example, whether a warranty can predate acquisition) has been imposed. Automated execution and browser verification remain outstanding.


### Document filing permission-transition race (2026-10-30)
- The filing view now clears the previous result set immediately when the signed-in user or health-record permission changes. Each metadata load has a request generation guard; a slower response from an earlier account/permission scope cannot overwrite the newer view, and in-flight updates are invalidated on unmount. This addresses a sensitive-data presentation race without changing Firestore rules, query scope or Worker authorization.
- Existing filing metadata queries remain role-filtered, exclude safeguarding attachments from general filing, and download bytes only after the user selects a file. A dedicated component-level race test and browser verification are still outstanding.


### Asset form duplicate-submit guard (2026-10-30)
- Added synchronous in-flight save locks to asset registration/edit, maintenance logging and physical verification forms. The locks close the small window before React state updates disable the submit button, preventing a rapid repeated submit from appending duplicate local asset-history entries. Locks release in `finally` on success or failure; existing saving-state feedback remains.
- This is client-side same-device protection only; it does not claim cross-device or server-atomic deduplication. Automated execution and browser verification remain outstanding.
