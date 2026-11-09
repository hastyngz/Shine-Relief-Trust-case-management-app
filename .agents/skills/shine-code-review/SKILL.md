---
name: shine-code-review
description: Review SHINE changes for bugs, regressions, data loss, security issues, and unintended side effects before committing.
---

# SHINE Code Review

Use this skill before committing meaningful changes and after fixes that touch data, permissions, sync, or shared UI.

## Procedure
1. Read `AGENTS.md`, inspect the working diff, and identify the user-visible goal.
2. Trace changed functions through callers, state owners, data models, persistence paths, and related views. Search for duplicate implementations and assumptions about optional or missing fields.
3. Check failure paths as carefully as success paths: empty data, malformed imports, denied permissions, rejected saves, quota errors, network loss, stale snapshots, duplicate submissions, and partial failures.
4. Check whether the change alters routing, role access, Firestore/Storage access, exported data, mobile layouts, offline queue semantics, or existing APIs.
5. Look for security and privacy issues: exposed beneficiary information, unsafe logging, secrets, insufficient server-side validation, unsafe upload handling, and weakened access rules.
6. Verify relevant tests and run `npm run lint`, focused test scripts, and the production build when appropriate. Do not claim tests passed without running them.
7. Report findings by severity (critical/high/medium/low), with file/line references where available. Distinguish confirmed defects from risks and suggestions.
8. Apply a completion review before handing work back: trace the full user journey from entry point through validation, save, reload/read-back, downstream integration and failure/retry paths. Check for dead buttons, placeholder handlers, unconnected records, misleading success states, missing permission enforcement, unfinished mobile layouts and undocumented gaps. A screen that renders or a build that passes is not a completed feature.
9. If any requested part remains unfinished, state exactly what is missing, why it is blocked, what is safe to use now, and the concrete next step. Do not label it complete, bury the gap in a vague caveat, or leave the user believing the workflow works end to end. Prefer finishing the smallest coherent vertical slice over starting several disconnected pieces.

## Review principles
- Prefer the smallest safe change over broad refactoring.
- Do not approve a change solely because it compiles.
- Check the complete diff, not only the intended lines.
- Never silently discard user data or suppress an error to make a workflow appear successful.
- If no issues are found, state what was inspected and which checks were actually run; do not imply exhaustive proof.
- When run as an independent reviewer (for example as a sub-agent), you have not seen the work being built. Read the full diff and `AGENTS.md` yourself, do not take the author's summary as proof, report findings only, and do not edit files unless asked.

## Completion standard

A meaningful feature is complete only when its intended user workflow works end to end, persists and reloads correctly, respects permissions, handles errors and retries without data loss or false success, integrates with existing modules, and has relevant regression coverage. If an external dependency prevents one of those checks, identify that limitation explicitly and do not claim full completion. Before handoff, include a candid reflection grounded in what you actually observed: what went well, what remains uncertain, and what you would improve next. Do not substitute confidence or polished wording for evidence.
