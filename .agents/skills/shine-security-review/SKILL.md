---
name: shine-security-review
description: Review SHINE authentication, role permissions, Firestore and Storage rules, API endpoints, uploads, and sensitive beneficiary-data handling.
---

# SHINE Security Review

Use whenever a change touches authentication, staff roles, beneficiary records, safeguarding, Firestore, Storage, server endpoints, imports/exports, logging, or file uploads.

## Threat-focused checklist
1. Identify the data involved, who should access it, and where it travels or persists.
2. Verify access is enforced at the authoritative boundary (Firestore/Storage rules and server-side checks), not only by hiding UI controls.
3. Confirm staff roles cannot gain administrator access through direct routes, crafted requests, altered client state, or missing checks.
4. Validate and constrain request payloads, identifiers, file types, file sizes, and other untrusted input at server or persistence boundaries.
5. Check for data leakage through logs, error messages, analytics, URLs, exports, cached responses, browser storage, or test fixtures.
6. Inspect dependency and configuration changes for exposed credentials, permissive origins, unsafe defaults, and accidental secret commits.
7. Consider abuse controls, rate limiting, authorization on every relevant endpoint, and whether error handling leaks sensitive details.
8. Add focused tests for allowed and denied access where the repository's test setup supports them; run relevant checks and report limitations.

## Non-negotiable rules
- Never weaken `firestore.rules`, Storage rules, authentication, or permission checks to make a workflow work.
- UI visibility is not authorization. Verify server/rules enforcement.
- Never send girl or beneficiary data to external analytics, logging, or unrelated services.
- Never put secrets, tokens, private records, or signed download URLs in logs, screenshots, commits, or reports.
- Do not claim a security audit is complete based only on a successful build or a partial code scan.
- If a security issue is found, describe impact and safe remediation; do not silently broaden access as a workaround.
