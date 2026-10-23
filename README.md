# Roadtripper

A road trip planner that tells a trip as days: where each day's driving runs out, the towns that fit, and the places worth stopping for, ranked by up to two moods you pick. Built on an export of the [Urban Explorer](https://urbanexplorer.app) atlas (303 cities, exported 2026-10-11) and a nationwide store of roadside places from OpenStreetMap.

**Live:** <https://roadtripper--roadtripper-planner.us-central1.hosted.app>

## What it does

1. Pick a start and end (or "Here", your location), how many hours you will drive each day, and optionally dates and up to two moods (Outdoors, History, Art, Museums, Oddities, Machines, Food, Sports)
2. See the trip as days on a map and a sheet: where each day ends, named by a real town ("Amarillo to near Sweetwater")
3. See the towns that fit today, nearest to the day's end first, each with its drive and why it is offered, and the places in each town ranked by your moods
4. Tap a roadside place (a diamond on the map) for its card, and "Stop here" to add a town or a place; the route and the towns refresh around it
5. Save a trip in the browser and reopen it with its stops, or use "Just today" for one day from where you are

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5
- **Styling:** Tailwind v4
- **Auth:** none. Clerk was removed in #47; saved trips live in the browser's localStorage
- **Data:** the Urban Explorer atlas as read-only SQLite (`data/atlas.sqlite`, better-sqlite3), exported from the `urbanexplorer` Firestore database by `scripts/export-atlas.mjs`; the app makes no Firestore calls at run time. The roadside store (`data/roadside.sqlite`) is downloaded at build from the `roadside-store` GitHub release and checked against `data/roadside.sqlite.sha256`
- **Routing:** Google Maps Routes API v2 (computeRoutes, and computeRouteMatrix where the precomputed drive graph has no answer). The drive graph (6,116 city pairs in the atlas, from openrouteservice) answers most town-to-town drive times
- **Maps rendering:** `@vis.gl/react-google-maps`
- **Validation:** Zod v4
- **Tests:** Vitest, with jsdom for interaction tests
- **Hosting:** Firebase App Hosting (Cloud Run, `us-central1`)
- **Runtime:** Bun (dev) / Node (deploy)

## Local development

```bash
bun install
bun run dev
```

Required env vars (see `apphosting.yaml` for the production binding list):

- `GOOGLE_MAPS_KEY`: server-side Routes API key
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`: client-side Maps JS API key
- `ATLAS_PATH` and `ROADSIDE_STORE_PATH` (optional): override where the two SQLite files are read from
- Firestore Admin credentials (Application Default Credentials) only for `bun run atlas:export`, not for the app

## Scripts

- `bun run dev`: local Next dev server
- `bun run lint`: ESLint
- `bun run type-check`: `tsc --noEmit`
- `bun run test`: vitest run (unit tests plus jsdom interaction tests)
- `bun run build`: fetches the roadside store, then the production build
- `bun run start`: serve the production build
- `bun run atlas:export`, `atlas:drive-graph`: refresh the atlas SQLite and its drive graph (offline)
- `bun run roadside:store`, `roadside:describe`, `roadside:publish`: rebuild and publish the roadside store (offline)
- `bun run corridor:pull`, `corridor:describe`, `label:sample`, `label:import`, `tags:export`: the corridor and labelling tools behind the store

## Deployment

Pushes to `main` auto-deploy to Firebase App Hosting via the wired GitHub connection. To verify a deploy landed:

```bash
gcloud run services list --region=us-central1 \
  --format="table(metadata.name,status.latestReadyRevisionName,status.conditions[0].lastTransitionTime)"
```

## Architecture highlights

- **Force-dynamic + client state:** the `/plan` page is `force-dynamic` and re-runs the Server Component on each navigation. To avoid re-billing the Routes API on every UI tweak (persona swap, stop add), all interactive state lives in client `useState` slices and URL sync is done with `window.history.replaceState`, never `router.replace`.
- **Server Action with discriminated-union returns:** `recomputeAndRefreshAction` recomputes the route through new stops and re-fetches the towns and their places in one round trip. It returns `{ok:true, route, waypointStatus:"fresh", waypointFetch, dateDerivation}`, `{ok:true, route, waypointStatus:"degraded", waypointFetch:null, dateDerivation}` or `{ok:false, error, retryAfterSeconds?}`, and never throws across the RSC boundary.
- **Neighborhood drill-down:** a town's parts of town come from the atlas's `neighborhoods` table (`neighborhoodsForCity` in `src/lib/atlas/queries.ts`) and are shown by `<NeighborhoodPanel>`.
- **Three-layer per-IP rate limit** (burst / spacing / daily quota) on every paid-API server action.
- **Live-state null-fallback pattern:** `liveRoute: DirectionsResult | null` and `liveWaypointFetch: WaypointFetchResult | null`: `null` means "use the initial server-rendered values", which makes "remove the last stop" cleanly revert without bookkeeping.

## Council review (Gemini, on every PR, advisory)

Roadtripper runs an automated multi-persona Gemini council on every PR (`.github/workflows/council.yml`). Six reviewer angles + a lead-architect resolver post a single re-edited comment with verdict + structured findings. Since 2026-10-04 it is advisory, not a merge gate: what gates a merge is in `CLAUDE.md` ("Merging"). See `CONTRIBUTING.md` for the setup and bypass mechanism.

## Status

The app is live, and the interface rounds (U1 to U48 in `gauntlet/`) are merged; the phone smoke test passed on 2026-10-11. **Up next:** see `SESSION_HANDOFF.md` (start-here block at the top) and `BACKLOG.md` (Now / Next / Someday / In flight).

The legacy `session_state.json` at the repo root is the older state file from sessions 1–7; new session work goes through `SESSION_HANDOFF.md` and `BACKLOG.md`.
