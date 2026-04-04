import cityCacheData from "@/data/global_city_cache.json";
import type { City } from "./types";

const cityCache: City[] = cityCacheData as City[];

export function getAllCities(): City[] {
  return cityCache.filter((c) => !c.isArchived);
}

export function lookupCity(cityId: string): City | undefined {
  return cityCache.find((c) => c.id === cityId && !c.isArchived);
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearbyCityResult {
  city: City;
  distanceKm: number;
}

export function getNearbyCities(
  cityId: string,
  radiusKm: number = 200
): NearbyCityResult[] {
  const origin = lookupCity(cityId);
  if (!origin) return [];

  return getAllCities()
    .filter((c) => c.id !== cityId)
    .map((c) => ({
      city: c,
      distanceKm: haversineKm(origin.lat, origin.lng, c.lat, c.lng),
    }))
    .filter((c) => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
