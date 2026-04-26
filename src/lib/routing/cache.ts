import "server-only";

/**
 * Tiny LRU cache for the recommendation pipeline. Keyed by a stable string
 * derived from request inputs. In-memory single-instance — adequate for
 * dev and low-traffic prod. Migrate to a shared store (Upstash, Firestore)
 * when scaling beyond one App Hosting instance.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  // Refresh LRU position
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest (first inserted)
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Stable cache key for the candidate pipeline. The encoded polyline is the
 * canonical route fingerprint; the budget tier affects the detour cap.
 */
export function candidateCacheKey(
  encodedPolyline: string,
  maxDetourMinutes: number
): string {
  // Hash the polyline to a short prefix to keep keys bounded
  let hash = 0;
  for (let i = 0; i < encodedPolyline.length; i++) {
    hash = (hash * 31 + encodedPolyline.charCodeAt(i)) | 0;
  }
  return `candidates:${hash.toString(36)}:${encodedPolyline.length}:${maxDetourMinutes}`;
}

/**
 * Cache key for the waypoint fetch stage. Independent of persona and
 * detour cap — scoring is downstream and runs on the client. The key is
 * the sorted city id tuple so that different candidate orderings for the
 * same city set hit the same cache entry.
 */
export function waypointsCacheKey(cityIds: readonly string[]): string {
  const sorted = [...new Set(cityIds)].sort().join(",");
  return `waypoints:${sorted}`;
}

/**
 * Cache key for the per-stop neighborhood fetch (S8). Lives in its own
 * namespace so it never collides with `waypointsCacheKey` even if a city
 * id ever contained a separator-like character. Per S8 plan SEC-1 +
 * ARCH-1, the key is structured-hashed (JSON-of-an-object, then a
 * bounded-length hash) rather than a raw string concat. The kind tag is
 * stable so the two namespaces are orthogonal by construction.
 *
 * Shares the single LRU declared above; max-entries cap is unchanged.
 */
export function neighborhoodsCacheKey(cityId: string): string {
  const payload = JSON.stringify({ kind: "neighborhoods", cityId });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) | 0;
  }
  return `neighborhoods:${hash.toString(36)}:${cityId.length}`;
}
