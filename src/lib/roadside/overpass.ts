/**
 * OpenStreetMap through Overpass (step 16's first source).
 *
 * The public instance is shared and best effort. This client is a polite
 * guest: a descriptive User-Agent with a contact, one request per tile with
 * a pause between, a timeout on every request, and one retry after a longer
 * pause when the server says it is busy (429) or timed out (504). No cache;
 * a corridor is pulled once, by hand, for step 19.
 */

import type { BoundingBox } from "./corridor";
import { fromOsmElement, type OsmElement, type RoadsideStop } from "./record";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const USER_AGENT = "roadtripper (road-trip planner in development; contact: anguijm@gmail.com)";
/**
 * Pacing, set against the public instance's published policy: it asks for
 * no more than about two requests a second and about 10,000 a day per
 * client, with a rate limit it enforces by answering 429 and a load limit
 * it enforces with 504. This client runs one request at a time; 1.5 s
 * between tiles is well under two a second, and an 800 km corridor is
 * about 32 requests, a rounding error against the daily allowance. Running
 * two pulls at once from the same address doubles the rate, so do not.
 */
export const PAUSE_MS = 1500;
/**
 * After a 429 or 504, the pauses before each retry, in order: three tries
 * over about a hundred seconds, then the tile is given up and the run
 * stops saying which one. Ten seconds is long enough for a busy instance to
 * clear a queue; retrying sooner is what gets an address blocked. Growing
 * pauses because the first 504s on 2026-09-27 came in bursts: the same
 * instance answered three tiles, then refused twice ten seconds apart. Not
 * a loop: if the instance is down for the evening, the progress file the
 * script keeps means the next run starts at the missing tile.
 */
export const RETRY_PAUSES_MS = [10_000, 30_000, 60_000] as const;
/**
 * Client-side; the query carries its own 45 s server-side timeout too, so
 * a healthy instance answers or refuses within that, and this only catches
 * a connection that hangs.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * The tags a road-tripper stops for. Overpass QL, applied to nodes, ways
 * and relations inside the box; `out center` gives ways and relations a
 * single point. The list is a first guess; step 19 reads the raw output and
 * says what it missed and what it dragged in.
 */
export function overpassQuery(box: BoundingBox, timeoutSeconds = 45): string {
  const bbox = `${box.minLat},${box.minLng},${box.maxLat},${box.maxLng}`;
  const selectors = [
    `["tourism"~"^(attraction|museum|viewpoint|artwork|theme_park|zoo)$"]`,
    `["historic"]`,
    `["man_made"~"^(lighthouse|tower)$"]`,
    `["natural"~"^(waterfall|arch|cave_entrance)$"]`,
  ];
  const body = selectors.flatMap((sel) => [`node${sel}["name"](${bbox});`, `way${sel}["name"](${bbox});`, `relation${sel}["name"](${bbox});`]).join("\n  ");
  return `[out:json][timeout:${timeoutSeconds}];\n(\n  ${body}\n);\nout center tags;`;
}

export interface OverpassDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Cancels the pull: no further tiles, and the request in flight is aborted. */
  signal?: AbortSignal;
  /** Another instance (a quieter mirror, a self-hosted one). Defaults to OVERPASS_URL. */
  url?: string;
}

const realDeps: OverpassDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export class OverpassError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`Overpass ${status}: ${body.slice(0, 200)}`);
    this.name = "OverpassError";
    this.status = status;
  }
}

/** Everything with a name and one of our kinds inside the box, as roadside records. */
export async function fetchBoxFromOverpass(box: BoundingBox, deps: OverpassDeps = realDeps): Promise<RoadsideStop[]> {
  const query = overpassQuery(box);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
  const attempt = async (): Promise<Response> =>
    deps.fetch(deps.url ?? OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal,
    });

  let res = await attempt();
  for (const pause of RETRY_PAUSES_MS) {
    if (res.status !== 429 && res.status !== 504) break;
    await deps.sleep(pause);
    res = await attempt();
  }
  if (!res.ok) throw new OverpassError(res.status, await res.text());

  const json = (await res.json()) as { elements?: OsmElement[] };
  if (!Array.isArray(json?.elements)) throw new OverpassError(res.status, "malformed body, no elements array");
  const out: RoadsideStop[] = [];
  for (const el of json.elements) {
    const stop = fromOsmElement(el);
    if (stop) out.push(stop);
  }
  return out;
}

/**
 * Pull every tile in order, paced, and merge by id (a stop near a tile
 * boundary is in two boxes). `onTile` reports progress for the script.
 */
export async function fetchCorridorFromOverpass(
  boxes: BoundingBox[],
  deps: OverpassDeps = realDeps,
  onTile?: (index: number, count: number, stops: RoadsideStop[]) => void,
  /** Tiles already held from an earlier run, by index; they are not fetched again. */
  already: ReadonlyMap<number, RoadsideStop[]> = new Map()
): Promise<RoadsideStop[]> {
  const byId = new Map<string, RoadsideStop>();
  let fetched = 0;
  for (let i = 0; i < boxes.length; i++) {
    const held = already.get(i);
    if (held) {
      for (const s of held) byId.set(s.id, s);
      continue;
    }
    if (fetched > 0) await deps.sleep(PAUSE_MS);
    // Checked between tiles so a cancelled pull stops here rather than
    // after the whole corridor; the request in flight is aborted by the
    // same signal inside fetchBoxFromOverpass.
    if (deps.signal?.aborted) throw new OverpassError(0, "pull cancelled");
    let stops: RoadsideStop[];
    try {
      stops = await fetchBoxFromOverpass(boxes[i], deps);
    } catch (err) {
      // Say which tile, so a rerun's log and the progress file line up.
      if (err instanceof OverpassError) throw new OverpassError(err.status, `tile ${i + 1} of ${boxes.length}: ${err.message}`);
      throw err;
    }
    fetched++;
    for (const s of stops) byId.set(s.id, s);
    onTile?.(i + 1, boxes.length, stops);
  }
  return [...byId.values()];
}
