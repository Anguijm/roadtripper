# Car API (read-only JSON)

For the Android Auto app (project `~/projects/roadtripper-car`, its own
session). Agreed between the roadtripper and roadtripper-car sessions on
2026-11-10, at John's request (relayed by ops). Code:
`src/app/api/today/route.ts` and `src/lib/today/api.ts`; tests beside them.
The destination-aware list (`/api/today/toward`, `/api/today/towns`) was
agreed the same night: `src/lib/today/toward.ts`, `cone.ts`, `towns.ts`.

`version` bumps only on a breaking change. Every 200 carries `generatedAt`.

## GET /api/today

Today's towns and places from a point: what the `/today` page shows,
computed the same way. Reads the atlas that ships with the build; no Routes
API call.

```
GET https://roadtripper--roadtripper-planner.us-central1.hosted.app/api/today?lat=41.2565&lng=-95.9345&hours=4&moods=history,food
```

| parameter | | |
|---|---|---|
| `lat`, `lng` | required | decimal degrees; out of range or missing is a 400 |
| `hours` | optional | 2, 3, 4, 5, 6 or 8. Missing or anything else falls back to 5, echoed in `hours` |
| `moods` | optional | comma-separated, at most two of `outdoors, history, art, museums, oddities, machines, food, sports`. An unknown mood or more than two is a 400 |

### 200, `status: "ok"`

```json
{
  "version": 1,
  "status": "ok",
  "generatedAt": "2026-11-10T01:07:04.864Z",
  "origin": { "lat": 41.2565, "lng": -95.9345 },
  "here": { "cityId": "omaha", "name": "Omaha", "lat": 41.2565, "lng": -95.9345, "distanceKm": 0, "country": "United States" },
  "hours": 4,
  "moods": ["history"],
  "placesComplete": true,
  "towns": [
    {
      "id": "lincoln-ne", "name": "Lincoln", "lat": 40.8136, "lng": -96.7026, "driveMinutes": 51, "country": "United States",
      "places": [
        { "id": "lincoln-ne-downtown-...-mosaic-floor", "name": "Nebraska State Capitol Mosaic Floor",
          "lat": 40.8079, "lng": -96.7003, "kind": "Culture", "line": "Inside the magnificent ...", "badge": "pick" }
      ]
    }
  ]
}
```

- `towns`: nearest drive first, at most 10 (`MAX_WAYPOINT_CITIES`).
  `driveMinutes` is one way from `here` (the snapped city) on the
  calibrated drive graph.
- `country` on each town and on `here` (added 2026-11-10, U52, non-breaking):
  the atlas's country name, or "" when it has none. A town whose country
  differs from `here.country` is across a border; the web app says
  "in Canada" beside its name, and the car app labels it the same way
  (John's choice: label, not hide).
- `places`: up to 5 per town (`TOP_WAYPOINTS_PER_CITY`), ranked by the moods
  as the page ranks them. `kind` is the web app's word. `line` is one or two
  sentences or null; **untrusted model text, render as plain text only**.
  `badge` is `"pick"` (at most one per town), `"good"` or null.
- `placesComplete: false` means some places failed to load; the towns are
  still right.
- Ids: a town `id` is the atlas city id and never changes. A place `id` is
  the atlas's id, stable across calls and days; an atlas update (every few
  weeks at most) can drop or rename a place, so treat an id no longer seen
  as gone, not as an error.

### 200, no towns

```json
{ "version": 1, "status": "no-city", "generatedAt": "..." }
{ "version": 1, "status": "no-graph", "generatedAt": "...", "here": { ... } }
```

`no-city`: no known city within 40 km. `no-graph`: a known city with no
drive times from it.

### Errors

```json
400 { "version": 1, "status": "bad-request", "message": "at most two moods" }
429 { "version": 1, "status": "rate-limited", "retryAfterSeconds": 30 }   (plus a Retry-After header)
500 { "version": 1, "status": "error", "message": "Something went wrong on our side. Try again." }
```

Every answer is JSON, the 500 included (added after the PR #164 council,
2026-11-10). A blank `lat` or `lng` is a 400, not 0.

### Caching and limits

- 200s: `Cache-Control: private, max-age=300`. 400, 429 and 500: `no-store`.
- Rate limit: the per-IP burst limit the `/today` page uses (20 requests a
  minute). The daily recompute quota is for the paid Routes API calls of
  `/plan` and is deliberately not charged here, so a car app cannot use up a
  person's plan recomputes.
- The app sends `User-Agent: RoadtripperCar/<versionName>`; the server logs
  one line per call with the status, the town count and that agent, and no
  coordinates.

## GET /api/today/towns

The atlas's towns as a pick list, so a destination can be chosen without
typing (John, 2026-11-10: "the list should be available in the car app").
The car matches names itself.

```json
{ "version": 1, "status": "ok", "atlasVersion": "2026-11-10T13:12:26.433Z",
  "towns": [ { "id": "toledo-oh", "name": "Toledo", "state": "OH", "country": "United States", "lat": 41.6528, "lng": -83.5379 } ] }
```

- 304 towns, about 32 KB, sorted by name then state.
- `state`: the two-letter US state, null outside the US. It is read from the
  app's US places list (the nearest same-named place within 50 km, else the
  nearest place within 15 km, else the state the atlas id ends in).
- `Cache-Control: public, max-age=86400` and `ETag` = `"<atlasVersion>"`.
  Send `If-None-Match` to re-check: a 304 means unchanged. The atlas changes
  every few weeks at most.

## GET /api/today/toward

Today's towns and roadside stops in the general direction of a destination,
as one list ordered by the time to reach each from here. John's rulings
(2026-11-10): the destination is typed on the phone (it arrives as a point)
or picked from `/api/today/towns`; the direction is a rough cone with **no
Routes call** (`src/lib/today/cone.ts`); the car navigates to one stop at a
time and keeps the stops it adds by `id`. No paid call of any kind.

```
GET .../api/today/toward?lat=42.33&lng=-83.05&to=louisville&hours=5&moods=history,food
GET .../api/today/toward?lat=42.33&lng=-83.05&toLat=37.19&toLng=-86.10&hours=8
```

| parameter | | |
|---|---|---|
| `lat`, `lng`, `hours`, `moods` | | as `/api/today` |
| `to` | one of | an atlas town id from `/api/today/towns` |
| `toLat`, `toLng` | one of | a typed place's position (the phone geocodes; send 2 decimals) |

Exactly one destination form; both, or neither, is a 400.

### The direction

A place counts when going there first costs at most a quarter more straight
distance than heading straight to the destination (`km(here, place) +
km(place, destination) <= 1.25 x km(here, destination)`: an ellipse), **and**
it leaves you nearer the destination than you are, **and** it is within
today's hours. Straight lines only: a road that bends can pass a place the
cone leaves out. From the towns that qualify, the 8 most on the way (least
detour) are chosen; from the roadside stops, the 8 strongest by the moods, as
the web's Along the way ranks them. Then everything is merged by time and
capped at 15.

### 200, `status: "ok"`

```json
{
  "version": 1, "status": "ok", "generatedAt": "...",
  "origin": { "lat": 42.33, "lng": -83.05 },
  "here": { "cityId": "detroit", "name": "Detroit", ... },
  "hours": 5, "moods": [],
  "destination": { "cityId": "louisville", "name": "Louisville", "lat": 38.2527, "lng": -85.7585,
                   "country": "United States", "driveMinutes": 334, "estimated": false, "withinToday": false },
  "placesComplete": true,
  "stops": [
    { "type": "stop", "id": "osm:node:...", "name": "Beer Can Tree", "lat": ..., "lng": ..., "reachMinutes": 26, "estimated": true,
      "detourMinutes": 33, "kind": "Attraction", "line": "...", "badge": null, "country": null, "near": "Detroit", "isDestination": false },
    { "type": "town", "id": "toledo-oh", "name": "Toledo", "lat": 41.6528, "lng": -83.5379, "reachMinutes": 59, "estimated": false,
      "detourMinutes": 0, "kind": "Town", "line": null, "badge": null, "country": "United States", "near": null, "isDestination": false,
      "places": [ { ...as /api/today... } ] }
  ]
}
```

- `destination`: `cityId` and `name` when the point is within an atlas
  town's own radius (25 km for a metro, 10 a town, 3 a village), else null
  and the car shows its own name. `lat`/`lng` are the point asked for, or
  the town's centre when picked by id. `driveMinutes` is the drive graph
  when both ends are atlas towns with a stored pair, else an estimate
  (`estimated: true`). `withinToday`: whether today's hours reach it.
- `stops`: nearest first by `reachMinutes`, at most 15, possibly empty.
  - `type: "town"` rows: `reachMinutes` from `here` on the drive graph
    (`estimated: false`), `kind` "Town", `line`, `badge` and `near` null,
    and `places` exactly as `/api/today` (up to 5).
  - `type: "stop"` rows (roadside): `reachMinutes` is straight-line km from
    your actual position at the graph's median pace (`estimated: true`;
    say "about"). `kind` is the web's word, capitalised. `line` is the
    stop's description or null (**untrusted text, render as plain text**).
    `badge` is `"good"` when it answers a chosen mood, else null. `near` is
    the nearest atlas town within 40 km, else null. No `places`.
  - `detourMinutes`: always a number, always an estimate: the extra minutes
    against heading straight to the destination.
  - `isDestination`: true on one town row when the destination is an atlas
    town that today reaches; it carries its places and sorts by time like
    the rest. Past the cap, the farthest rows go first, never this one.
- Ids are unique across the answer: atlas city ids, atlas place ids, and
  OSM ids (`osm:node:...`), which atlas ids never resemble. A roadside stop
  named like a place in one of the answer's towns is that place and appears
  once, as the place. The here town is never a row.

### Other answers

```json
200 { "version": 1, "status": "arrived", "generatedAt": "...", "here": {...}, "hours": 5, "moods": [], "destination": {...} }
200 { "version": 1, "status": "no-city", "generatedAt": "..." }
200 { "version": 1, "status": "no-graph", "generatedAt": "...", "here": {...} }
404 { "version": 1, "status": "unknown-destination", "message": "..." }
400, 429, 500 as /api/today
```

`arrived`: here is within 15 km of the destination, or both are the same
atlas town (then ask `/api/today` for the town's own list).

### Caching and limits

As `/api/today`: 200s `private, max-age=300`; 400, 404, 429 and 500
`no-store`; the per-IP burst limit; no daily quota, since nothing here is
paid. The car re-asks at most every 10 minutes and after about 10 km. One
log line per call: status, row count and user agent, never a position or a
destination.

## POST /api/today/town-requests

The "add this town" button (John, 2026-11-10: "Plus 'add this town'
button"): a typed destination the atlas lacks, asked for by name, once per
place, on the driver's tap. Requested towns are added to the atlas in
batches with the one-town recipe (`docs/atlas-gaps.md`), so they gain their
own places; nothing happens at once.

```
POST .../api/today/town-requests
Content-Type: application/json

{ "name": "Springfield, Illinois, United States" }
```

- `name`: the place as the phone's geocoder names it, 2 to 80 characters
  of letters (any script), digits, spaces and `. , ' ’ ( ) -`. Runs of
  spaces are tidied. No position or id travels.
- `202 { "version": 1, "status": "accepted" }`; `400 bad-request` for a
  wrong `Content-Type`, a body that is not JSON or is over 1 KB, or a name
  outside those rules; `429` as /api/today. All `no-store`.
- Kept: one app log line, `[town-request] "<name>"`, quoted so a name can
  never start another line, for 30 days.

## What the server keeps of a request

Checked 2026-11-10 in the code and in the project's Cloud Logging settings,
for the car app's Play privacy policy.

- **Position:** used to answer the request, then dropped. No database row
  and no cache is keyed on it, and the app's log line carries none. The
  platform's request logs (`run.googleapis.com/requests` and
  `firebaseapphosting.googleapis.com/requests`) kept the full URL, query
  string included, for 30 days until 2026-11-10 13:11 UTC. Since then the
  `_Default` sink's exclusion `drop-api-today-requests` drops /api/today
  entries from both logs (John's choice; `~/ops/RUNBOOK.md` has the filter
  and the undo). Older entries age out by about 2026-12-10.
- **IP address:** only the in-memory burst limiter, per server instance,
  swept after about 2 minutes.
- **Other identifiers:** no cookies, ids or analytics. The app logs one
  line per call, `[api/today] <status> towns=<n> ua=<first 40 characters>`
  (`[api/today/toward] <status> rows=<n> ua=...` for the list toward a
  destination), kept 30 days.
- **A requested town's name** (`/api/today/town-requests`): one app log
  line, kept 30 days, read in batches to add towns. Nothing else about the
  request.
- **The destination** (`/api/today/toward`): as the position. Every car path
  starts `/api/today`, so the same exclusion drops its request entries, and
  the app's log line carries none.

Changing any of this (a new log line, a cache keyed on position, a header)
changes the privacy policy too: say so to the car session and ops.

## GET /api/trip

Phase two, not built. The plan's days and "Along the way" are computed in
the browser today, so this is a port of that logic to the server. Its shape
is agreed after the car app's Today screen has been used.
