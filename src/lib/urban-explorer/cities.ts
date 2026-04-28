import "server-only";
// City data originates from the UE pipeline (untrusted external source).
// Render name/vernacularName/loreAnchor as plain text only — never
// dangerouslySetInnerHTML. See CLAUDE.md and council.yml grep enforcement.
import { z } from "zod/v4";
import { CitySchema, type City } from "./cityAtlas";
import { listCities } from "./firestore";
import { cacheGet, cacheSet } from "@/lib/routing/cache";
import cityFallbackJson from "@/data/city_fallback.json";

const ALL_CITIES_CACHE_KEY = "allCities";
const ALL_CITIES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Shorter TTL for fallback so we pick up a recovered Firestore within minutes.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

// Validate the static fallback at module load so a malformed file fails loudly
// at startup rather than silently producing a runtime TypeError later.
const _fallbackParse = z.array(CitySchema).safeParse(cityFallbackJson);
if (!_fallbackParse.success) {
  console.error(
    "[cities] city_fallback.json failed Zod validation — fallback disabled:",
    _fallbackParse.error.issues.map((i) => i.message).join("; ")
  );
}
const CITY_FALLBACK: City[] = _fallbackParse.success
  ? _fallbackParse.data.filter((c) => !c.isArchived)
  : [];

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
  // Always route through getAllCities so cache, coalescing, and fallback logic
  // apply uniformly — avoids N+1 Firestore reads on a cold cache.
  const cities = await getAllCities();
  return cities.find((c) => c.id === cityId);
}
