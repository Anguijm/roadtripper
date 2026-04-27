# Roadtripper

A road trip planner that recommends curated stops along your driving route based on a daily drive-time budget and your travel persona. Powered by the [Urban Explorer](https://urbanexplorer.app) database (102 cities, thousands of waypoints with vibe classifications).

**Live:** <https://roadtripper--roadtripper-planner.us-central1.hosted.app>

## What it does

1. Pick a start city, end city, and how many hours you want to drive per day
2. See your driving route on a dark-themed map
3. Browse persona-ranked recommended stops along the corridor (Outdoorsman / Foodie / Gearhead / Culture / Nerd)
4. Add a city to your trip — the route reshapes through it AND the recommendations refresh against the new corridor
5. Build out a multi-stop itinerary, swap personas to re-rank, remove stops, iterate

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5
- **Styling:** Tailwind v4
- **Auth:** Clerk v7
- **Data:** Firestore (via Firebase Admin SDK 13) — uses the named `urbanexplorer` database from the Urban Explorer project
- **Routing:** Google Maps Routes API v2 (computeRoutes + computeRouteMatrix)
- **Maps rendering:** `@vis.gl/react-google-maps`
- **Validation:** Zod v4
- **Hosting:** Firebase App Hosting (Cloud Run, `us-central1`)
- **Runtime:** Bun (dev) / Node (deploy)

## Local development

```bash
bun install
bun run dev
```

Required env vars (see `apphosting.yaml` for the production binding list):

- `GOOGLE_MAPS_KEY` — server-side Routes API key
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — client-side Maps JS API key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — auth
- Firestore Admin credentials via Application Default Credentials or a service-account JSON

## Scripts

- `bun run dev` — local Next dev server
- `bun run lint` — ESLint
- `bun run type-check` — `tsc --noEmit`
- `bun run test` — vitest run (unit tests for isomorphic layer)
- `bun run build` — production build
- `bun run start` — serve the production build

## Deployment

Pushes to `main` auto-deploy to Firebase App Hosting via the wired GitHub connection. To verify a deploy landed:

```bash
gcloud run services list --region=us-central1 \
  --format="table(metadata.name,status.latestReadyRevisionName,status.conditions[0].lastTransitionTime)"
```

## Architecture highlights

- **Force-dynamic + client state:** the `/plan` page is `force-dynamic` and re-runs the Server Component on each navigation. To avoid re-billing the Routes API on every UI tweak (persona swap, stop add), all interactive state lives in client `useState` slices and URL sync is done with `window.history.replaceState`, never `router.replace`.
- **Server Action with discriminated-union returns:** `recomputeAndRefreshAction` recomputes the route through new stops AND re-fetches candidate cities + waypoints + neighborhoods in a single round trip via `Promise.all`. Returns `{ok:true, waypointFetch}` (itself a DU: `{status:"fresh"|"degraded", cities, waypoints, neighborhoods, failures?}`) or `{ok:false, error}` — never throws across the RSC boundary.
- **Neighborhood drill-down:** adding a stop shows a `<NeighborhoodPanel>` for that city. Neighborhoods fetched from `vibe_neighborhoods` in parallel with waypoints, cached under a separate SHA-256-hashed namespace, client-side grouped by `neighborhood_id`. Three load states: `loaded` (grouped or chip layout), `empty` ("Showing all stops in {city}"), `failed` ("Couldn't load neighborhoods").
- **Three-layer per-IP rate limit** (burst / spacing / daily quota) on every paid-API server action.
- **Live-state null-fallback pattern:** `liveRoute: DirectionsResult | null` and `liveWaypointFetch: WaypointFetchResult | null` — `null` means "use the initial server-rendered values", which makes "remove the last stop" cleanly revert without bookkeeping.

## Council review (Gemini, on every PR)

Roadtripper runs an automated multi-persona Gemini council on every PR (`.github/workflows/council.yml`). Six reviewer angles + a lead-architect resolver post a single re-edited comment with verdict + structured findings. See `CONTRIBUTING.md` for the full setup, bypass mechanism, and kill criteria.

## Status

MVP loop is live. **Up next:** see `SESSION_HANDOFF.md` (start-here block at the top) and `BACKLOG.md` (Now / Next / Someday / In flight).

The legacy `session_state.json` at the repo root is the older state file from sessions 1–7; new session work goes through `SESSION_HANDOFF.md` and `BACKLOG.md`.
