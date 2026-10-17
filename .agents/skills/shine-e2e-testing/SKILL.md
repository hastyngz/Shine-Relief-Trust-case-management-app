---
name: shine-e2e-testing
description: Build and maintain reliable Playwright browser tests for SHINE's real user workflows, mobile layouts, permissions, and offline/reconnect behaviour.
---

# SHINE Browser Automation and End-to-End Testing

Use for browser-level workflows, navigation, form saves, authentication/roles, responsive layouts, service workers, offline/reconnect behaviour, or bugs that unit tests cannot prove.

## Read first
- `AGENTS.md`
- `playwright.config.ts`
- `e2e/global-setup.ts`, `e2e/helpers.ts`, and relevant `e2e/*.spec.ts`
- Relevant app views, routing, auth/role checks, and related service tests.
- `docs/offline-app-shell.md` for PWA/offline scenarios.

## Workflow
1. Inspect existing Playwright fixtures, emulator setup, routes, selectors, and CI workflow before adding tests. Reuse the current setup; do not create a parallel test framework.
2. Write tests around user-visible outcomes and stable accessible locators (`getByRole`, labels, placeholders only when appropriate, or explicit test IDs where needed). Avoid brittle CSS selectors, fixed sleeps, and implementation-detail assertions.
3. Cover the full meaningful path: navigate to the relevant view, perform the action, verify visible feedback and persisted result, then reload or revisit when durability matters.
4. For forms, test valid save, validation/error feedback, duplicate submission prevention, and rejected saves never showing success.
5. For mobile-sensitive changes, use a mobile viewport/touch project or an explicit mobile test; check overflow, reachability of actions, keyboard/focus behaviour, and touch targets. Never change the phone layout of `src/components/AIAssistant/AIAssistantView.tsx`.
6. For offline flows, test the production-built app shell, offline edit durability, reload/reopen, reconnect, queue flush, and conflict visibility as relevant. A mocked offline flag alone is not proof of durable offline behaviour.
7. Keep tests deterministic: seed only synthetic fixtures through the existing emulator setup, isolate state between tests, wait on observable conditions, and clean up where supported.
8. Run the smallest relevant Playwright spec first, then `npm run test:e2e`, `npm run lint`, relevant service tests, and the production build when appropriate. If environment/emulators/browser binaries prevent a run, report the exact blocker rather than implying success.

## Privacy and safety
- Never use real girls' or beneficiaries' records in test data, screenshots, traces, fixtures, or logs. Use synthetic names and fake contact details.
- Never log tokens, credentials, signed storage URLs, or private records. Keep traces and artifacts private and only retain what is needed to diagnose a failure.
- Do not weaken auth, role checks, Firestore/Storage rules, or production security to make a browser test pass.
- Do not make tests depend on external analytics or third-party services.

## Completion report
List the scenarios covered, commands actually run and results, browser/device coverage, skipped checks and why, any remaining risks, changed files, and commit SHA. Distinguish browser-level proof from unit tests or static checks.