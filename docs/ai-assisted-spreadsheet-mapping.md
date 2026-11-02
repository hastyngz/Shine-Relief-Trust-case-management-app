# AI-assisted spreadsheet mapping

## Purpose and workflow

The optional mapping assistant helps identify spreadsheet type, header rows, and column meanings when a workbook differs from the deterministic importer’s expected layouts. It is advisory: it does not write records, import data, or change the source workbook.

The import wizard requires an Administrator or Manager to select an explicit consent checkbox for the selected workbook before making a request. The browser sends worksheet names and text samples only: at most the first 35 rows and first 16 columns of up to 8 worksheets, with a maximum of 160 characters per cell and 24,000 sampled characters total. Workbooks with more than 8 worksheets use the manual path. The original filename is replaced with a generic label in the app request and is excluded at the backend before any external model call; the deterministic parser may still use the local filename for date inference. The full workbook file is not uploaded to the AI provider. The capped sample can still contain names, financial figures, sheet names, or other sensitive values, so the consent panel explains that data leaves the SHINE app environment and that provider retention terms may differ.

The request is sent to the authenticated Cloudflare Worker route `POST /api/ai/map-spreadsheet`. The Worker checks the signed-in account and active staff profile before AI processing. Only Administrators and Managers can use this route. The endpoint also requires explicit consent in the request body, rejects non-JSON requests, enforces a 64 KiB request-body cap, and fails closed when its rate-limit binding is missing or unavailable.

The model receives only sampled worksheet names and cells through the configured OpenRouter integration—never the original filename or client-supplied file label. Its response is limited to known import types and fields. The app validates worksheet names, header-row indexes, source-column indexes, duplicate mappings, programme identifiers, and the optional reporting month. Workbook values and worksheet names are treated as untrusted content, not instructions. The model is instructed not to reproduce personal data in its response.

The user must separately review the proposal and choose **Apply mapping**. The application canonicalizes approved headers in a cloned workbook, then runs the existing deterministic parsers. The normal import preview remains the final user-controlled step. When declared budget totals conflict with recomputed quantity/frequency/unit-cost values, the declared amount is preserved, a discrepancy warning is shown, and the affected line is not selected by default. An unreadable procurement quantity is flagged and also leaves the procurement list unselected by default. Manual type selection remains available if the AI request fails or is declined.

## Privacy and audit boundary

The AI endpoint does not persist workbook samples or mapping proposals. The Worker writes only metadata to the existing AI audit log, such as the authenticated staff UID, email and role, timestamp, function name, outcome, and review-required status. No source rows, filenames, or cell values are written to that audit log. The Worker response uses `Cache-Control: no-store`.

OpenRouter may route a request to model providers configured for the SHINE backend. Sending a sample therefore discloses those sampled values to external processing providers after the user consents. The feature does not establish or guarantee those providers’ retention, storage location, or downstream processing terms. Confirm those terms before enabling the feature for records that policy or law restricts from external processing.

## Limits and release checks

The Worker uses the Cloudflare Rate Limiting binding `AI_MAPPING_LIMITER`, keyed by authenticated Firebase UID and configured in `workers/r2-storage/wrangler.toml` for 5 requests per 60 seconds. Cloudflare documents this binding as approximate and per Cloudflare location; it is a best-effort request throttle, not a strict global quota or a provider-cost ceiling. The configured namespace ID (`2026110201`) must be confirmed unique for the Cloudflare account before deployment.

Before deployment, verify that the Worker has the intended `OPENROUTER_API_KEY` secret and model configuration, confirm provider processing terms, validate the rate-limit namespace in the target Cloudflare account, and complete the repository’s release gates. The Worker was built with Wrangler `--dry-run` during implementation; it was not deployed and no production data was changed.

Run the synthetic regressions with:

```sh
npm run test:spreadsheet-import
npm run test:phase2
npm run test:rate-limit
npm run lint
```

The live Cloudflare deployment smoke test is `npm run test:deployment-smoke`; do not run it as part of local validation because it calls the configured live application and Worker URLs.
