---
name: shine-react-typescript
description: Make minimal, type-safe changes to SHINE's React and TypeScript code while preserving existing workflows and shared UI conventions.
---

# SHINE React and TypeScript

Use for React components, hooks, context, view routing, TypeScript models, state management, and UI behaviour.

## Workflow
1. Read `AGENTS.md` and inspect the target component, its parent, callers, related types, and tests before editing.
2. Identify the owner of state and the source of truth. Reuse existing hooks, contexts, helpers, and UI primitives rather than creating parallel patterns.
3. Prefer small composable changes. Avoid unrelated rewrites, duplicate state, unnecessary effects, broad type assertions, `any`, and suppressions such as `@ts-ignore`.
4. Handle loading, empty, success, validation, and error states. An unsuccessful or rejected save must never display success.
5. Preserve accessible labels, visible keyboard focus, usable touch targets, reduced-motion preferences, and mobile behaviour.
6. Treat optional and legacy imported fields defensively. Validate untrusted input at boundaries rather than assuming compile-time types validate runtime data.
7. Update focused tests for changed behaviour and run `npm run lint`, relevant tests, and a production build when appropriate.

## SHINE constraints
- Do not change the phone layout of `src/components/AIAssistant/AIAssistantView.tsx`.
- Reuse shared effects and UI components documented in `AGENTS.md`; new motion must not hide errors or sync/offline warnings.
- Preserve routing helpers and role checks; do not bypass permission boundaries to simplify component logic.
- Keep sensitive beneficiary information out of debug output and test snapshots unless safely anonymised.
- Avoid new dependencies unless clearly necessary and explicitly justified.
