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
- Available primitives: `.fx-press` for tactile press feedback, `.fx-card` for soft card depth and optional pointer-hover lift, `.fx-rise` for opacity/transform entrance with a capped `--i` stagger index, `.fx-skeleton` for loading placeholders, `.fx-btn-main` for the primary orange gradient, `.fx-spinner`, `.fx-sheet-enter`, `.fx-backdrop-enter`, `.fx-toast-enter`, `.fx-success-pop`, and `.fx-tick`.
- Use only transform and opacity for motion; respect `prefers-reduced-motion`, keep touch targets accessible, and never let motion conceal an error or offline/sync warning.
- New buttons, cards, sheets and loading states must use these shared pieces rather than creating duplicate primitives.
- Preserve existing layouts, routes, colours, copy, data logic, auth, storage, offline sync, AI chat phone layout, and Firestore rules when applying visual polish.
