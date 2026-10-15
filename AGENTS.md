# AGENTS.md

Repository memory for the SHINE Relief Trust case-management app.

## Stack
- React 19 + TypeScript + Vite 8 + Tailwind 4, Firebase (Firestore/Auth).
- Express API in `server.ts`; Cloudflare worker in `workers/r2-storage`.
- Tests are `tsx` scripts in `scripts/`, registered in `package.json` and
  `.github/workflows/shine-checks.yml`. Run `npm run lint` (tsc) plus the
  relevant `test:*` scripts before every commit.

## Hard rules (do not relax)
- Never loosen `firestore.rules` or weaken a permission check.
- Never change the phone layout of `src/components/AIAssistant/AIAssistantView.tsx`.
- Girl data is sensitive: no girl data may leave the device (no external
  logging/analytics).
- Offline correctness wins: local edits must never be silently lost or
  overwritten by a stale snapshot.

## Offline / storage architecture
- `src/services/offlineSync.ts` keeps a per-record change queue (set/delete +
  `baseUpdatedAt`). `src/services/firestoreSync.ts` flushes each entry in a
  transaction and stores a conflict instead of overwriting a newer server
  `updatedAt`. Conflicts surface in `src/components/Sync/SyncConflictsPanel.tsx`
  via the Header badge.
- The change queue lives in IndexedDB with a localStorage fallback
  (`src/utils/storage.ts` reports `QuotaExceededError` and dispatches an event
  the UI shows as a persistent banner; in-memory data is never discarded).
- `src/components/Error/ErrorBoundary.tsx` wraps the root and each main view;
  `src/views/AppViewSwitch.tsx` wraps the active view so a crash keeps the
  header/navigation alive.

## Bundle / PWA
- Heavy views are `React.lazy` in `src/App.tsx`; the dashboard and navigation
  stay eager. Document libs (xlsx, docx, jspdf, mammoth, jszip) are dynamically
  imported inside the service functions, with `manualChunks` vendor groups in
  `vite.config.ts`.
- `public/manifest.webmanifest` + the app-shell service worker precache the
  built shell and logos. Never cache `/api/*`, Firebase/Firestore/Auth or
  storage download URLs. Push uses the separate `firebase-messaging-sw.js`
  scope. Registration happens only in production builds (`src/main.tsx`).
  See `docs/offline-app-shell.md` for manual offline testing.

## Server
- `src/server/rateLimit.ts` is a fixed-window in-memory limiter keyed by
  Firebase uid, falling back to IP. Limits via `SHINE_AI_RATE_LIMIT`,
  `SHINE_STORAGE_RATE_LIMIT`, `SHINE_SAFEGUARDING_RATE_LIMIT` (defaults
  20/60/60 per minute). `/api/health` is unlimited; 429s include `Retry-After`.

## Structure notes
- Hash routing helpers live in `src/routing/appRoutes.ts`
  (`parseHash`/`buildHash`/`qualityTargetHash`); the view switch is
  `src/views/AppViewSwitch.tsx`; modal state is `src/hooks/useAppModals.ts` +
  `src/views/AppModals.tsx`.
- Large views keep helpers/modals in sibling files
  (`src/components/Import/importWizardHelpers.tsx`,
  `src/components/Planning/PlanningModals.tsx`).


## Shared UI polish effects
- Shared, dependency-free motion and depth tokens live in `src/styles/effects.css`, imported once from `src/main.tsx`.
- Shared React components: `src/components/ui/SaveButton.tsx` exposes idle/saving/done/error visual states, and `src/components/ui/Skeleton.tsx` provides accessible loading placeholders. Parent forms own save timing and error handling; a save callback may return `false` to reject a save, and rejected/throwing saves must never show success. Successful local record saves use the accessible `Saved on this phone` toast.
- Regression test: `npm run test:ui-effects` checks SaveButton states, visible failure feedback, Skeleton accessibility, and reduced-motion CSS; the Replit push workflow runs it.
- Available primitives: `.fx-press` for tactile press feedback, `.fx-card` for soft card depth and optional pointer-hover lift, `.fx-rise` for opacity/transform entrance with a capped `--i` stagger index, `.fx-skeleton` for loading placeholders, `.fx-btn-main` for the primary orange gradient, `.fx-spinner`, `.fx-sheet-enter`, `.fx-backdrop-enter`, `.fx-toast-enter`, `.fx-success-pop`, and `.fx-tick`.
- Keep motion to transform/opacity except the intentional skeleton shimmer and drawn success tick; respect `prefers-reduced-motion`, provide visible keyboard focus, keep touch targets accessible, and never let motion conceal an error or offline/sync warning.
- New buttons, cards, sheets and loading states must use these shared pieces rather than creating duplicate primitives.
- Preserve existing layouts, routes, colours, copy, data logic, auth, storage, offline sync, AI chat phone layout, and Firestore rules when applying visual polish.

## App views and the Sunrise view
- There are four app views (`AppViewMode` in `src/contexts/VisualSettingsContext.tsx`: `classic`, `ios`, `foundation`, `sunrise`). The list shown in the picker is `appViews` in the same file, rendered by the app view picker in `src/components/Header.tsx`. An unknown saved view falls back to the default.
- `sunrise` is the warm orange look: off-white page, slim white header, soft cards, and a bottom nav with four tabs (Home, Girls, Houses, Messages) plus a "More" sheet. Its styles live only in `src/styles/sunrise.css`, scoped under `#app-shell[data-mobile-view="sunrise"]`, and its nav markup is the Sunrise branch of `src/components/Navigation.tsx`.
- Sunrise reads the active colour theme through the `--theme-*` variables, so all colour themes keep working. Do not hard-code a single orange there.
- Effects from `src/styles/effects.css` apply in every view and colour theme. Anything new must work in all four views.


## Agent Skills

Before substantial work, inspect `.agents/skills/` and read the relevant `SKILL.md` files before editing. Skill files provide task-specific procedures; this file remains the source of project-wide rules. If a skill conflicts with this file, existing architecture, privacy requirements, or a user's explicit instruction, follow the higher-priority requirement and explain the conflict.

### Skill selection
- Before committing any meaningful change, use `shine-code-review` to inspect the planned diff, affected call sites, risks, and unintended side effects.
- For bugs, offline behaviour, queued writes, storage quota, conflicts, service workers, or reconnect flows, use `shine-offline-testing` and the relevant regression tests.
- For React components, hooks, state, routing, or TypeScript changes, use `shine-react-typescript`.
- For authentication, role checks, Firestore/Storage rules, server endpoints, uploads, logs, or beneficiary data, use `shine-security-review`.
- For slow screens, rendering, bundles, images, database reads, or network requests, use `shine-performance`.
- When a task spans several areas, load all relevant skills; do not treat the list as mutually exclusive.

### Required working method
1. Inspect the current implementation, repository guidance, tests, and related call sites before proposing edits.
2. State the likely cause and the smallest safe fix; reproduce a reported bug where practical before changing code.
3. Preserve existing behaviour and public interfaces unless the task explicitly requires a change. Avoid broad rewrites and new dependencies without a clear need.
4. Add or update focused regression tests for changed behaviour. For offline-sensitive work, test queued edits, stale snapshots/conflicts, reload/reopen, and reconnect behaviour where practical.
5. Review the final diff for data loss, permission regressions, duplicate logic, accessibility, mobile layouts, and unintended side effects.
6. Run `npm run lint` and relevant `test:*` scripts documented in `package.json`; run the production build when available and appropriate. Never claim a check passed unless it was actually run. Report blocked or skipped checks explicitly.
7. Summarise files changed, user-visible effects, tests and results, remaining risks, and the commit SHA.

### SHINE-specific non-negotiables
- Never weaken `firestore.rules`, Storage access controls, authentication, or role-based permissions to make a test pass.
- Girl and beneficiary information is sensitive. Never send it to external logging, analytics, or unrelated services.
- Offline correctness wins: never silently discard local edits or overwrite newer server data with stale snapshots. Preserve the existing per-record queue and conflict flow.
- Preserve the phone layout of `src/components/AIAssistant/AIAssistantView.tsx`.
- Follow existing dependency, styling, storage, routing, and testing conventions. Reuse shared UI primitives where applicable.
- Do not expose secrets, credentials, tokens, private records, or signed storage URLs in logs, tests, screenshots, or reports.
