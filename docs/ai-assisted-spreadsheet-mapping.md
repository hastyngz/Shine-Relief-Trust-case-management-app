# AI-assisted spreadsheet mapping

## Purpose and workflow

The optional mapping assistant helps identify spreadsheet type, header rows, and column meanings when a workbook differs from the deterministic importer’s expected layouts. It is advisory: it does not write records, import data, or change the source workbook.

The import wizard lets an Administrator or Manager explicitly opt in to an advisory mapping for the selected workbook using a checkbox. After opt-in, mapping may run automatically when the rule-based parser is unsure, or the user can request it manually. Before any network request, the browser reduces each selected worksheet to allowlisted column-header words plus two generated example rows containing only `SYNTHETIC_TEXT`, `SYNTHETIC_NUMBER`, `SYNTHETIC_DATE`, or `SYNTHETIC_BLANK` tokens. Unsupported header text becomes a generic `Column N` label. Workbook values are examined locally only to infer a coarse synthetic value type; no actual cell value, filename, or worksheet name is sent. Original worksheet names are restored locally after the response so the proposal can be applied to the correct workbook. The full workbook is never uploaded to the AI provider.

The request is sent to the authenticated Cloudflare Worker route `POST /api/ai/map-spreadsheet` only when an Administrator or Manager selects **Suggest mapping with AI**. The Worker checks the signed-in account and active staff profile before AI processing. The endpoint requires confirmation in the request body, rejects non-JSON requests, enforces a 64 KiB request-body cap, and fails closed when its rate-limit binding is missing or unavailable.

The model receives sanitized header labels and synthetic type tokens through the configured OpenRouter integration. The server independently validates this strict shape and rejects arbitrary worksheet names, labels, or non-synthetic row contents before contacting OpenRouter. Its response is limited to known import types and fields. The app validates sheet aliases, original header-row indexes, source-column indexes, duplicate mappings, programme identifiers, and the optional reporting month. The model is instructed to treat all supplied structure as untrusted input and never to claim synthetic values are real workbook data.

The user must separately review the proposal and choose **Apply mapping**. The application canonicalizes approved headers in a cloned workbook, then runs the existing deterministic parsers. The normal import preview remains the final user-controlled step. When declared budget totals conflict with recomputed quantity/frequency/unit-cost values, the declared amount is preserved, a discrepancy warning is shown, and the affected line is not selected by default. An unreadable procurement quantity is flagged and also leaves the procurement list unselected by default. A failed AI request displays an error and allows an explicit retry; manual type selection remains available if the request fails or is declined.

## Privacy and audit boundary

The AI endpoint does not persist workbook samples or mapping proposals. The Worker writes only metadata to the existing AI audit log, such as the authenticated staff UID, email and role, timestamp, function name, outcome, and review-required status. No source rows, filenames, original worksheet names, or cell values are written to that audit log. The Worker response uses `Cache-Control: no-store`.

OpenRouter may route the sanitized structure to model providers configured for the SHINE backend. Provider processing terms may differ; confirm them before use. The original spreadsheet contents remain on-device for this AI mapping request. Header text outside a conservative local allowlist is replaced with a generic label, which can lower mapping accuracy; the deterministic/manual import flow remains available.

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
