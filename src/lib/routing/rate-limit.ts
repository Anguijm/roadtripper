import "server-only";

/**
 * Per-IP in-memory rate limiters. Adequate for low-traffic single-instance
 * deployments. Migrate to Upstash Ratelimit (or Cloud Armor) when traffic
 * grows or when scaling beyond 1 Cloud Run instance.
 *
 * Two layers:
 *   1. Short-window limiter (`checkRateLimit`)  — 20 req / 60s window per IP.
 *      Protects against burst-style abuse on /plan and the recompute action.
 *   2. Daily quota (`checkDailyQuota`)          — caps Routes-API-spending
 *      operations (recompute) at MAX_DAILY_RECOMPUTE per IP per UTC day.
 *      Compensating control for cost-amplification DoS on the unauth'd
 *      `recomputeAndRefreshAction` (Council ISC-S6-SEC-3, S7-SEC-2).
 *   3. Recompute spacing limiter (`checkRecomputeSpacing`) — at most one
 *      recompute per 1500ms per IP. Bounds the worst-case server-side rate
 *      a scripted client can drive even if it bypasses the client-side
 *      `requestIdRef` (Council ISC-S6-SEC-7).
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return { ok: true, remaining: MAX_REQUESTS - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds: retryAfter };
  }

  bucket.count += 1;
  return { ok: true, remaining: MAX_REQUESTS - bucket.count, retryAfterSeconds: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily quota for cost-amplifying operations (Routes API recomputes).

interface DailyBucket {
  count: number;
  /** Unix-day index = floor(now/86400000). Resets when day rolls over (UTC). */
  day: number;
}

const dailyBuckets = new Map<string, DailyBucket>();
// Lowered from 200 → 25 in PR C: radial 1×N matrix call costs ~$1.29 vs the old
// ~$0.005 diagonal call. At the old limit, a single IP could drive ~$258/day.
const MAX_DAILY_RECOMPUTE = 25;

export function checkDailyQuota(ip: string): RateLimitResult {
  const today = Math.floor(Date.now() / 86_400_000);
  const bucket = dailyBuckets.get(ip);

  if (!bucket || bucket.day !== today) {
    dailyBuckets.set(ip, { count: 1, day: today });
    return { ok: true, remaining: MAX_DAILY_RECOMPUTE - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= MAX_DAILY_RECOMPUTE) {
    // Retry after midnight UTC
    const msUntilNextDay = 86_400_000 - (Date.now() % 86_400_000);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(msUntilNextDay / 1000),
    };
  }
  bucket.count += 1;
  return {
    ok: true,
    remaining: MAX_DAILY_RECOMPUTE - bucket.count,
    retryAfterSeconds: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-IP minimum spacing between recompute calls.

const lastRecomputeAt = new Map<string, number>();
const MIN_RECOMPUTE_GAP_MS = 1500;

export function checkRecomputeSpacing(ip: string): RateLimitResult {
  const now = Date.now();
  const last = lastRecomputeAt.get(ip) ?? 0;
  if (now - last < MIN_RECOMPUTE_GAP_MS) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((MIN_RECOMPUTE_GAP_MS - (now - last)) / 1000),
    };
  }
  lastRecomputeAt.set(ip, now);
  return { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-IP minimum spacing between neighborhood panel fetches.

const lastNeighborhoodAt = new Map<string, number>();
const MIN_NEIGHBORHOOD_GAP_MS = 300;

export function checkNeighborhoodSpacing(ip: string): RateLimitResult {
  const now = Date.now();
  const last = lastNeighborhoodAt.get(ip) ?? 0;
  if (now - last < MIN_NEIGHBORHOOD_GAP_MS) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((MIN_NEIGHBORHOOD_GAP_MS - (now - last)) / 1000),
    };
  }
  lastNeighborhoodAt.set(ip, now);
  return { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency cache: de-duplicates daily quota decrements within a 60-second
// window. Keyed on `${ip}:${requestId}`. Prevents double-charging when a
// client retransmits the same request ID (framework retry or rapid double-submit).

const idempotencyKeys = new Map<string, number>(); // key → timestamp
// 60 s covers any realistic client retry window (network timeout, double-click)
// while remaining short enough that a genuinely new request for the same user
// action (e.g., after a page refresh) gets a fresh quota slot.
const IDEMPOTENCY_TTL_MS = 60_000;

/** Returns true if this (ip, requestId) pair has already consumed a quota slot. */
export function isQuotaDuplicate(ip: string, requestId: string): boolean {
  const key = `${ip}:${requestId}`;
  const ts = idempotencyKeys.get(key);
  if (ts === undefined) return false;
  if (Date.now() - ts > IDEMPOTENCY_TTL_MS) {
    idempotencyKeys.delete(key);
    return false;
  }
  return true;
}

export function markQuotaRequestId(ip: string, requestId: string): void {
  idempotencyKeys.set(`${ip}:${requestId}`, Date.now());
}

/**
 * Periodic cleanup so the bucket maps don't grow unbounded.
 * Lazily called on each rate-check.
 */
function sweep() {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.windowStart >= WINDOW_MS * 2) {
      buckets.delete(ip);
    }
  }
  // Prune day buckets older than 2 days.
  const today = Math.floor(now / 86_400_000);
  for (const [ip, bucket] of dailyBuckets.entries()) {
    if (today - bucket.day >= 2) dailyBuckets.delete(ip);
  }
  // Prune spacing entries older than 1 minute.
  for (const [ip, ts] of lastRecomputeAt.entries()) {
    if (now - ts >= 60_000) lastRecomputeAt.delete(ip);
  }
  for (const [ip, ts] of lastNeighborhoodAt.entries()) {
    if (now - ts >= 60_000) lastNeighborhoodAt.delete(ip);
  }
  // Prune idempotency keys older than 2× TTL.
  for (const [k, ts] of idempotencyKeys.entries()) {
    if (now - ts >= IDEMPOTENCY_TTL_MS * 2) idempotencyKeys.delete(k);
  }
}

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 5 * 60_000;

export function maybeSweep() {
  const now = Date.now();
  if (now - lastSweep >= SWEEP_INTERVAL_MS) {
    sweep();
    lastSweep = now;
  }
}

/**
 * Extract the client IP from Next.js request headers.
 * Behind App Hosting / Cloud Run, the rightmost x-forwarded-for entry is the
 * client; left entries are proxies the request hopped through.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim());
    return parts[parts.length - 1] ?? "unknown";
  }
  return headers.get("x-real-ip") ?? "unknown";
}
