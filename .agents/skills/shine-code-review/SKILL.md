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

## Review principles
- Prefer the smallest safe change over broad refactoring.
- Do not approve a change solely because it compiles.
- Check the complete diff, not only the intended lines.
- Never silently discard user data or suppress an error to make a workflow appear successful.
- If no issues are found, state what was inspected and which checks were actually run; do not imply exhaustive proof.
- When run as an independent reviewer (for example as a sub-agent), you have not seen the work being built. Read the full diff and `AGENTS.md` yourself, do not take the author's summary as proof, report findings only, and do not edit files unless asked.
