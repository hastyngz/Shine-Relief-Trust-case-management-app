---
name: shine-performance
description: Improve SHINE responsiveness and reduce unnecessary rendering, database reads, bundle weight, and image/network costs without sacrificing offline correctness or privacy.
---

# SHINE Performance

Use when screens are slow, mobile responsiveness is poor, bundle size grows, repeated reads occur, images load slowly, or rendering/network activity is excessive.

## Measure before changing
1. Inspect the affected screen, data flow, React state dependencies, network/database calls, and existing build configuration.
2. Identify a concrete bottleneck or measurable hypothesis. Avoid speculative memoisation or broad rewrites.
3. Establish a baseline where practical: reproduction steps, build output, call counts, render behaviour, timing, or bundle-size comparison.
4. Make the smallest targeted change and compare results against the baseline.

## Areas to inspect
- Repeated Firestore reads, duplicate subscriptions, unnecessary polling, and unbounded queries.
- React re-render loops, unstable effect dependencies, expensive derived calculations, and overly broad context updates.
- Lazy loading and code splitting for heavy views and document-processing libraries; preserve the eager app shell and navigation.
- Image dimensions, compression, thumbnails, lazy loading, and unnecessary repeated downloads.
- Cache boundaries, request waterfalls, retry storms, and wasted work on poor connections.
- Large dependencies or duplicated utilities; do not add a package for a problem solvable with existing tools.

## SHINE constraints
- Do not cache API responses, Firebase/Firestore/Auth traffic, or storage download URLs in the app-shell service worker.
- Do not compromise offline queue correctness, conflict detection, permission checks, or beneficiary privacy for speed.
- Preserve the four existing app views, mobile usability, and the protected AI Assistant phone layout.
- Avoid speculative memoisation and premature abstractions; explain the measured or reasoned benefit.
- Run relevant tests, `npm run lint`, and a production build when appropriate. Report measured outcomes separately from estimates.
