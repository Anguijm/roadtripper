import "server-only";
import type { City } from "./types";
import { listCities, getCity } from "./firestore";
import { cacheGet, cacheSet } from "@/lib/routing/cache";
import cityFallbackJson from "@/data/city_fallback.json";

const ALL_CITIES_CACHE_KEY = "allCities";
const ALL_CITIES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Shorter TTL for fallback so we pick up a recovered Firestore within minutes.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

const CITY_FALLBACK = cityFallbackJson as unknown as City[];

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
  let items: City[];
  let dropped: { id: string; reason: string }[];

  try {
    ({ items, dropped } = await listCities());
  } catch (e) {
    console.error("[cities] listCities() failed — using static fallback:", e);
    cacheSet(ALL_CITIES_CACHE_KEY, CITY_FALLBACK, FALLBACK_TTL_MS);
    return CITY_FALLBACK;
  }

  if (dropped.length > 0) {
    const docIds = dropped.map((d) => d.id).join(", ");
    console.warn(
      `[cities] ${dropped.length} cities failed schema validation and were dropped: ${docIds}`
    );
  }

  // Total parse failure: use the static fallback so the user still gets
  // recommendations. Cache short-TTL so we recover when the pipeline fixes.
  if (items.length === 0 && dropped.length > 0) {
    console.error(
      "[cities] all cities failed schema validation — using static fallback"
    );
    cacheSet(ALL_CITIES_CACHE_KEY, CITY_FALLBACK, FALLBACK_TTL_MS);
    return CITY_FALLBACK;
  }

  cacheSet(ALL_CITIES_CACHE_KEY, items, ALL_CITIES_TTL_MS);
  return items;
}

export async function lookupCity(cityId: string): Promise<City | undefined> {
  return (await getCity(cityId)) ?? undefined;
}
