---
name: shine-performance
description: Improve SHINE's React rendering, screen responsiveness, database reads, bundle weight, and image/network costs without sacrificing offline correctness or privacy.
---

# SHINE Performance and React Rendering

Use when screens are slow, React components re-render excessively, mobile responsiveness is poor, bundle size grows, repeated reads occur, images load slowly, or rendering/network activity is excessive.

## Measure before changing
1. Read `AGENTS.md`, inspect the affected screen, component tree, state/context dependencies, data flow, network/database calls, tests, and build configuration.
2. State a concrete bottleneck or measurable hypothesis. Reproduce it and establish a baseline where practical: render counts, timings, request/read counts, bundle output, interaction delay, or a repeatable device scenario.
3. Identify the smallest change likely to improve the measured bottleneck. Avoid speculative memoisation, premature abstractions, and broad rewrites.
4. Recheck the same metric or scenario after the change. Clearly separate measured outcomes from estimates.

## React-specific checks
- Trace state ownership and prop/context changes before adding `memo`, `useMemo`, or `useCallback`. Use them only when they prevent meaningful repeated work or stabilise a real dependency.
- Look for unstable effect dependencies, effects that mirror derivable state, repeated subscriptions, render-triggered requests, accidental remounts, and state updates that cause loops.
- Keep derived values derived where practical; avoid duplicate sources of truth and unnecessary state synchronization.
- Check list rendering for stable keys, bounded rendering, and expensive per-item calculations. Consider pagination or virtualization only when the actual data volume and current UI justify it.
- Keep event handlers and async operations safe from stale closures, duplicate submissions, unmounted updates, and race conditions.
- Use React DevTools/profiling or focused instrumentation where available. Remove temporary instrumentation before committing and never log beneficiary data.
- Preserve loading, error, offline, pending-sync, and conflict states while reducing renders. Performance changes must not suppress errors or alter save semantics.

## Broader areas to inspect
- Repeated Firestore reads, duplicate listeners, polling, unbounded queries, and unnecessary refetches.
- Lazy loading and code splitting for heavy views and document-processing libraries; preserve the eager app shell and navigation.
- Image dimensions, compression, thumbnails, lazy loading, and repeated downloads.
- Request waterfalls, retry storms, unnecessary serialization, and wasted work on poor connections.
- Existing cache boundaries and invalidation behaviour; do not introduce broad or stale caching for convenience.
- Build output and dependency weight; avoid adding a package for a problem solvable with existing tools.

## SHINE constraints
- Do not cache API responses, Firebase/Firestore/Auth traffic, or storage download URLs in the app-shell service worker.
- Never compromise offline queue correctness, conflict detection, permission checks, or beneficiary privacy for speed.
- Never send girls' or beneficiary information to external analytics/logging or include it in profiling output, screenshots, traces, or test reports.
- Preserve the four app views, colour themes, mobile usability, and protected AI Assistant phone layout.
- Follow shared UI effects and accessibility/reduced-motion rules in `AGENTS.md`.
- Run `npm run lint`, focused tests, performance tests where relevant, and a production build when appropriate. Report measurements, commands, actual results, and remaining limitations.