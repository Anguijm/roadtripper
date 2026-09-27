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
/** Between tiles. The public instance asks for restraint; a corridor of 30 tiles takes a minute. */
export const PAUSE_MS = 1500;
/** After a 429 or 504, before the one retry. */
export const RETRY_PAUSE_MS = 10_000;
/** Client-side; the query carries its own server-side timeout too. */
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
  const attempt = async (): Promise<Response> =>
    deps.fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let res = await attempt();
  if (res.status === 429 || res.status === 504) {
    await deps.sleep(RETRY_PAUSE_MS);
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
  onTile?: (index: number, count: number, found: number) => void
): Promise<RoadsideStop[]> {
  const byId = new Map<string, RoadsideStop>();
  for (let i = 0; i < boxes.length; i++) {
    if (i > 0) await deps.sleep(PAUSE_MS);
    const stops = await fetchBoxFromOverpass(boxes[i], deps);
    for (const s of stops) byId.set(s.id, s);
    onTile?.(i + 1, boxes.length, stops.length);
  }
  return [...byId.values()];
}
