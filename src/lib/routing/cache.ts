import "server-only"; // keeps this module out of client bundles
import { createHash } from "node:crypto";

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
 *
 * SHA-256 truncated to 16 hex chars (64 bits). Structured JSON input keeps
 * the `candidates:` namespace orthogonal to other key kinds by construction.
 * One-time cold cache at deploy when upgrading from the prior charCodeAt
 * implementation — in-memory LRU only, no migration needed.
 */
export function candidateCacheKey(
  encodedPolyline: string,
  maxDetourMinutes: number
): string {
  const payload = JSON.stringify({ kind: "candidates", polyline: encodedPolyline, maxDetourMinutes });
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `candidates:${hash}`;
}

/**
 * Cache key for the waypoint fetch stage. Independent of persona and
 * detour cap — scoring is downstream and runs on the client. The key is
 * the sorted, deduped city id set so that different candidate orderings for
 * the same city set hit the same cache entry.
 *
 * SHA-256 truncated to 16 hex chars (64 bits). Structured JSON input keeps
 * the `waypoints:` namespace orthogonal to other key kinds by construction.
 * One-time cold cache at deploy when upgrading from the prior raw-join
 * implementation — in-memory LRU only, no migration needed.
 */
export function waypointsCacheKey(cityIds: readonly string[]): string {
  const sorted = [...new Set(cityIds)].sort();
  const payload = JSON.stringify({ kind: "waypoints", cityIds: sorted });
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `waypoints:${hash}`;
}

/**
 * Cache key for the per-stop neighborhood fetch (S8). Lives in its own
 * namespace so it never collides with `waypointsCacheKey` even if a city
 * id ever contained a separator-like character. Per S8 plan SEC-1 +
 * ARCH-1, the key is structured-hashed (JSON-of-an-object, then a
 * cryptographic hash) rather than a raw string concat. The kind tag is
 * stable so the two namespaces are orthogonal by construction.
 *
 * Shares the single LRU declared above; max-entries cap is unchanged.
 *
 * Hash function: SHA-256 truncated to 16 hex chars (64 bits). Replaces
 * the manual `charCodeAt` loop used elsewhere in this file because that
 * loop mishandles non-BMP Unicode (surrogate pairs collapse to two
 * 16-bit halves with the same numeric weight as their leading half).
 * Roadtripper city ids are ASCII slugs today so the bug is theoretical,
 * but S8a council R2 (bugs) flagged it correctly and SHA-256 is the
 * standard answer. All three key helpers in this file now use the same
 * structured-hash approach.
 *
 * Caller precondition: `cityId` MUST be validated at its Server Action
 * boundary before reaching this function (regex `^[a-z0-9-]+$` matches
 * the upstream NeighborhoodSchema id rule). This helper trusts its input;
 * the validation lives one layer up. S8b's `fetchNeighborhoods` server
 * action enforces this.
 */
export function neighborhoodsCacheKey(cityId: string): string {
  const payload = JSON.stringify({ kind: "neighborhoods", cityId });
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `neighborhoods:${hash}`;
}
