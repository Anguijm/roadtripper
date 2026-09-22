# Session 25 — fix the plan page SSR crash

## Goal

Every direct load of `/plan` returns "SOMETHING WENT WRONG". Production logs show
`ReferenceError: google is not defined` thrown during the server render of
`PlanWorkspace`, five times between 14:39 and 14:45 UTC on 2026-09-22.

Root cause: `RouteMap` passed `google.maps.ControlPosition.RIGHT_CENTER` in the
JSX props of `<GMap>`, which is evaluated during render. The `google` global only
exists in a browser. `"use client"` does not make a component client-only in the
App Router; it is still server-rendered for the first HTML.

The bug is old, not new. It stayed invisible because clicking PLAN ROUTE from the
home page is a client-side navigation, so the map first rendered in the browser.
Only a direct URL, a refresh or a shared link reached the server render.

## Change

Use `ControlPosition` exported by `@vis.gl/react-google-maps`, which the library
documents as a copy of the `google.maps.ControlPosition` constants. Same value, no
global, renders on the server. One line plus the import.

## Risk surface

- Files touched: `src/components/RouteMap.tsx` (import plus one prop),
  `src/components/__tests__/RouteMap.ssr.test.tsx` (new).
- Behaviour: none. The zoom control keeps the same position because the library
  constant mirrors the Google one.
- Not addressed here: the in-process cache with `minInstances: 0`, and the
  unbounded cache growth. Separate issue, separate PR.

## Ship rule (declared before the work)

The new test must fail on the current code with the exact production error, and
pass after the change. Full suite and `tsc --noEmit` stay clean.

## Result

Ship rule met. Reverting only the fixed line reproduces
`ReferenceError: google is not defined` in 2 of 4 new tests. With the fix: 231
tests pass across 12 files (227 before, 4 added), `tsc --noEmit` exits 0.

## Added after the first commit: the monitoring that would have caught this

Nothing in `roadtripper-planner` was monitored. No uptime checks, no alert
policies, no notification channels.

A status-code check would not have caught this bug. Next streams the response,
so the 200 is flushed before the render throws. The live broken page returns
`http=200` in 12.4s and ends with `$RX("B:0","875195463")`, React's error
boundary abort carrying the same digest as the Cloud Run logs. That string is
the reliable signal.

Created outside the repo, in GCP:

- Email notification channel to the owner.
- Uptime check on a real `/plan` URL, 900s period, 3 US regions, matching
  `NOT_CONTAINS_STRING "$RX("` plus a 2xx requirement.
- Alert policy binding the two, auto-close 24h.

Added in the repo:

- `src/app/health/page.tsx`: renders the same tree as `/plan` from fixed props
  and makes no Routes API, Firestore or Places calls. The uptime check moves
  here once deployed, because checking a real `/plan` URL costs about $0.25 per
  cache miss in Route Matrix calls and this costs nothing.
- `src/components/__tests__/PlanWorkspace.ssr.test.tsx`: server-render guard for
  the whole workspace tree, not just the map.

Reintroducing the bug fails all three SSR tests. Full suite 232 passing across
13 files, `tsc --noEmit` exits 0.
