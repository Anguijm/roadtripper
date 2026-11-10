# Car API (read-only JSON)

For the Android Auto app (project `~/projects/roadtripper-car`, its own
session). Agreed between the roadtripper and roadtripper-car sessions on
2026-11-10, at John's request (relayed by ops). Code:
`src/app/api/today/route.ts` and `src/lib/today/api.ts`; tests beside them.

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

## GET /api/trip

Phase two, not built. The plan's days and "Along the way" are computed in
the browser today, so this is a port of that logic to the server. Its shape
is agreed after the car app's Today screen has been used.
