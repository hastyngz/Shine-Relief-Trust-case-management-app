# SHINE UI effects and app views

Reference for the shared UI effects and the app views. The rules that always apply
are in `AGENTS.md` under "UI rules". This file holds the catalogue and current wiring,
which change more often.

## Shared tokens and components
- Motion and depth tokens live in `src/styles/effects.css`, imported once from
  `src/main.tsx`. They are dependency-free.
- `src/components/ui/SaveButton.tsx` has idle, saving, done and error states and
  shakes once on error. Parent forms own save timing and error handling. A save
  callback may return `false` to reject a save; rejected or throwing saves must never
  show success. Successful local record saves use the accessible `Saved on this phone` toast.
- `src/components/ui/Skeleton.tsx` provides accessible loading placeholders.
- `src/components/ui/CountUp.tsx` counts up once; screen readers get the final number
  immediately.
- `src/components/ui/Collapse.tsx` opens and closes smoothly; closed content is `inert`.
- `src/components/ui/SwipeRow.tsx` reveals one action on swipe and never runs it by
  itself. Keep the normal buttons as the keyboard route.
- `src/components/ui/EmptySun.tsx` shows the sun rising once on empty states.

## CSS classes (`src/styles/effects.css`)
- `.fx-press`: tactile press feedback.
- `.fx-card`: soft card depth and optional pointer-hover lift.
- `.fx-rise`: opacity/transform entrance with a capped `--i` stagger index.
- `.fx-skeleton`: loading placeholders (the shimmer is the one intentional exception
  to "transform and opacity only").
- `.fx-btn-main`: the primary orange gradient.
- `.fx-spinner`, `.fx-sheet-enter`, `.fx-backdrop-enter`, `.fx-toast-enter`,
  `.fx-success-pop`, `.fx-tick` (the drawn success tick is the other exception).
- Also: screen slide-in on `#app-shell main > *`, a soft field focus ring, `.fx-pulse`
  (runs three times), `.fx-shake`, `.fx-progress-fill`.

## Runtime effects
`src/effects/EffectsRuntime.tsx` is mounted once in `src/main.tsx`, wrapped so a crash
renders nothing. It provides:
- a header shadow after scroll (`html[data-scrolled]`);
- pull down at the top of the page to nudge a sync;
- a "Draft saved on this phone" chip when an edit is queued offline;
- a "Report ready" card when a docx, xlsx or pdf download starts;
- sparks via `celebrate()` from that file.

## Currently wired
(Status; verify in code before relying on it.)
- Dashboard totals use `CountUp`.
- Overdue badges use `.fx-pulse`.
- Empty Girls and Households lists use `EmptySun`.
- Case Actions rows use `SwipeRow`, revealing "Complete".
- `Collapse`, `celebrate()` and `.fx-progress-fill` are available but not wired to a
  screen yet.

## Testing
`npm run test:ui-effects` checks SaveButton states, visible failure feedback, Skeleton
accessibility and reduced-motion CSS. The Replit push workflow runs it.

## App views
- Four views: `classic`, `ios`, `foundation`, `sunrise`. The type is `AppViewMode` in
  `src/contexts/VisualSettingsContext.tsx`. The picker list is `appViews` in the same
  file, rendered by the view picker in `src/components/Header.tsx`. An unknown saved
  view falls back to the default.
- `sunrise` is the warm orange look: off-white page, slim white header, soft cards, and
  a bottom nav with four tabs (Home, Girls, Houses, Messages) plus a "More" sheet.
  Its styles live only in `src/styles/sunrise.css`, scoped under
  `#app-shell[data-mobile-view="sunrise"]`. Its nav markup is the Sunrise branch of
  `src/components/Navigation.tsx`.
- Sunrise reads the active colour theme through the `--theme-*` variables, so every
  colour theme keeps working. Do not hard-code a single orange.
- Effects from `src/styles/effects.css` apply in every view and theme. Anything new
  must work in all four views.
