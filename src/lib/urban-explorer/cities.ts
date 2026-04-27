import "server-only";
import type { City } from "./types";
import { listCities, getCity } from "./firestore";
import { cacheGet, cacheSet } from "@/lib/routing/cache";

const ALL_CITIES_CACHE_KEY = "allCities";
const ALL_CITIES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getAllCities(): Promise<City[]> {
  const cached = cacheGet<City[]>(ALL_CITIES_CACHE_KEY);
  if (cached) return cached;

  const { items, dropped } = await listCities();
  if (dropped.length > 0) {
    console.warn(
      `[cities] ${dropped.length} cities failed schema validation and were dropped`
    );
  }
  cacheSet(ALL_CITIES_CACHE_KEY, items, ALL_CITIES_TTL_MS);
  return items;
}

export async function lookupCity(cityId: string): Promise<City | undefined> {
  return (await getCity(cityId)) ?? undefined;
}
