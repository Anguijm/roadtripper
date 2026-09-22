import "server-only";
// City data originates from the UE pipeline (untrusted external source).
// Render name/vernacularName/loreAnchor as plain text only — never
// dangerouslySetInnerHTML. See CLAUDE.md and council.yml grep enforcement.
import { allCities } from "@/lib/atlas/queries";
import type { City } from "./cityAtlas";

/**
 * Cities now come from the local atlas (`data/atlas.sqlite`), not a live
 * cross-project Firestore read.
 *
 * What went away with that change:
 *  - The 24h in-process cache. A local indexed read of 277 rows takes tens of
 *    microseconds, so caching it cost memory and bought nothing.
 *  - The cache-stampede coalescing promise, which existed only to protect the
 *    network call.
 *  - `city_fallback.json`. It was a 258-city static standby for Firestore being
 *    unreachable; the atlas ships with the build and cannot be unreachable
 *    without the app itself being gone.
 *
 * These remain async so every existing caller keeps working unchanged.
 */

export async function getAllCities(): Promise<City[]> {
  return allCities();
}

export async function lookupCity(cityId: string): Promise<City | undefined> {
  return allCities().find((c) => c.id === cityId);
}
