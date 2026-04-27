import "server-only";
import type { City } from "./types";
import { listCities, getCity } from "./firestore";
import { cacheGet, cacheSet } from "@/lib/routing/cache";

const ALL_CITIES_CACHE_KEY = "allCities";
const ALL_CITIES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Singleton in-flight promise — prevents cache stampede on cold start.
// Concurrent requests that all miss the cache share one Firestore read.
let _inflightLoad: Promise<City[]> | null = null;

export async function getAllCities(): Promise<City[]> {
  const cached = cacheGet<City[]>(ALL_CITIES_CACHE_KEY);
  if (cached) return cached;

  if (!_inflightLoad) {
    _inflightLoad = _fetchAndCache().finally(() => {
      _inflightLoad = null;
    });
  }

  return _inflightLoad;
}

async function _fetchAndCache(): Promise<City[]> {
  const { items, dropped } = await listCities();
  if (dropped.length > 0) {
    console.warn(
      `[cities] ${dropped.length} cities failed schema validation and were dropped`
    );
  }
  // Total parse failure: throw so the Server Action routes to degraded state.
  // This keeps empty-collection (valid) distinguishable from all-dropped (error).
  if (items.length === 0 && dropped.length > 0) {
    throw new Error(
      `[cities] all ${dropped.length} cities failed schema validation — city list unavailable`
    );
  }
  cacheSet(ALL_CITIES_CACHE_KEY, items, ALL_CITIES_TTL_MS);
  return items;
}

export async function lookupCity(cityId: string): Promise<City | undefined> {
  return (await getCity(cityId)) ?? undefined;
}
