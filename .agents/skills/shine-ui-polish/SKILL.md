---
name: shine-ui-polish
description: Improve SHINE's visual consistency, interaction feedback, accessibility, responsive layouts, and subtle motion without changing established workflows or branding.
---

# SHINE UI Polish

Use for visual refinements, interaction states, loading feedback, cards, forms, navigation, modals, toasts, responsive behaviour, and accessibility improvements.

## Read first
- `AGENTS.md`
- `docs/ui-effects.md` (catalogue of shared effects, helpers, and the four app views)
- `src/styles/effects.css` and its import in `src/main.tsx`
- `src/components/ui/SaveButton.tsx` and `src/components/ui/Skeleton.tsx`
- The affected component, its parent/callers, and the relevant app-view CSS.
- `scripts/ui-effects.test.tsx` and other tests covering the target behaviour.

## Workflow
1. Identify the exact visual or interaction problem before editing. Check all four views (`classic`, `ios`, `foundation`, `sunrise`) and active colour themes where relevant.
2. Prefer existing shared primitives and CSS variables: `.fx-press`, `.fx-card`, `.fx-rise`, `.fx-skeleton`, `.fx-btn-main`, `.fx-spinner`, sheet/backdrop/toast entrance classes, and existing theme tokens. Do not create a competing design system or hard-code colours that bypass themes.
3. Keep changes scoped and additive. Preserve wording, navigation, routes, data models, permissions, save timing, offline state, and current user workflows unless explicitly asked to change them.
4. Make state obvious: loading, saving, success, validation failure, offline, sync pending, and conflict must remain distinct. Never show a success state when a save fails or is only queued locally; use the accurate local-save wording already established by the app.
5. Prioritise small-screen usability: no accidental horizontal overflow, actions remain reachable, touch targets are comfortably usable, and dialogs/sheets fit within the viewport and account for keyboard/focus.
6. Keep visible keyboard focus, accessible names and status announcements, sensible contrast, reduced-motion support, and no information conveyed by colour/motion alone.
7. Motion should be subtle and primarily use transform/opacity; avoid animating layout-heavy properties. Respect `prefers-reduced-motion`. Never let animation hide an error, safeguarding notice, offline warning, or sync conflict.
8. Do not change the phone layout of `src/components/AIAssistant/AIAssistantView.tsx`. Do not add a dependency for a small visual effect.
9. Add or update focused regression tests. Run `npm run test:ui-effects`, `npm run lint`, relevant tests, and a production build when appropriate. Use Playwright/mobile viewport checks for meaningful layout or navigation changes.

## Final review
Check all four app views, theme compatibility, loading/error/offline states, accessibility, console noise, and reduced-motion behaviour where applicable. Report actual checks and remaining unverified visual/device cases.
