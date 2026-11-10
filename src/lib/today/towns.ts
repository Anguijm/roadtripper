import "server-only";

import { allCities, haversineKm } from "@/lib/atlas/queries";
import { atlasExportedAt } from "@/lib/atlas/db";
import type { PlaceRow } from "@/lib/plan/places";
import PLACES from "@/lib/plan/places-us.json";
import type { City } from "@/lib/urban-explorer/types";

/**
 * GET /api/today/towns for the car app (docs/car-api.md): the atlas's towns
 * as a pick list, so a destination can be chosen without typing (John,
 * 2026-11-10: "the list should be available in the car app"). The car
 * matches names itself; this is the whole list, fetched rarely.
 */
export interface TownListEntry {
  id: string;
  name: string;
  /** Two-letter US state, or null outside the US. */
  state: string | null;
  country: string;
  lat: number;
  lng: number;
}

export type TownsApiResponse =
  | { version: 1; status: "ok"; atlasVersion: string | null; towns: TownListEntry[] }
  | { version: 1; status: "rate-limited"; retryAfterSeconds: number }
  | { version: 1; status: "error"; message: string };

/**
 * A same-named US place this close is the town. GeoNames and the atlas each
 * put a town's point at their own idea of its centre, which for a big city
 * can be tens of km apart (a county seat against a downtown); 50 km takes
 * that and still keeps a same-named town in the next state out, since
 * duplicate names are rarely that close. The tests pin both Portlands.
 */
const SAME_NAME_KM = 50;
/**
 * Otherwise the nearest US place of any name this close names the state:
 * near enough that a state line is unlikely between them. All 124 atlas ids
 * that carry a state agreed with the result on 2026-11-10.
 */
const NEAREST_KM = 15;

/**
 * A US atlas town's state, from the app's list of US places (GeoNames,
 * src/lib/plan/places-us.json): the nearest place with the town's own name
 * within 50 km, else the nearest place of any name within 15 km, else the
 * state the atlas id ends in ("terlingua-tx": a ghost town too small for the
 * list), when that is a state the list knows. The atlas itself has no state,
 * and "Portland" needs one.
 */
export function stateFor(city: Pick<City, "id" | "name" | "lat" | "lng" | "country">, places: readonly PlaceRow[] = PLACES as unknown as PlaceRow[]): string | null {
  if (city.country !== "United States") return null;
  const name = city.name.trim().toLowerCase();
  let sameName: { state: string; km: number } | null = null;
  let nearest: { state: string; km: number } | null = null;
  for (const [pName, state, lat, lng] of places) {
    const km = haversineKm(city, { lat, lng });
    if (pName.toLowerCase() === name && km <= SAME_NAME_KM && (!sameName || km < sameName.km)) sameName = { state, km };
    if (km <= NEAREST_KM && (!nearest || km < nearest.km)) nearest = { state, km };
  }
  if (sameName) return sameName.state;
  if (nearest) return nearest.state;
  const suffix = /-([a-z]{2})$/.exec(city.id)?.[1]?.toUpperCase();
  return suffix && statesIn(places).has(suffix) ? suffix : null;
}

const statesCache = new WeakMap<readonly PlaceRow[], Set<string>>();
function statesIn(places: readonly PlaceRow[]): Set<string> {
  let set = statesCache.get(places);
  if (!set) {
    set = new Set(places.map((p) => p[1]));
    statesCache.set(places, set);
  }
  return set;
}

let cached: { atlasVersion: string | null; towns: TownListEntry[] } | null = null;

/** The list, built once per process: the atlas only changes with a deploy. Sorted by name, then state. */
export function townList(): { atlasVersion: string | null; towns: TownListEntry[] } {
  if (cached) return cached;
  const towns = allCities()
    .map((c) => ({ id: c.id, name: c.name, state: stateFor(c), country: c.country, lat: c.lat, lng: c.lng }))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || (a.state ?? "").localeCompare(b.state ?? "", "en"));
  cached = { atlasVersion: atlasExportedAt(), towns };
  return cached;
}
