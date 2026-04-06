import "server-only";

/**
 * Per-IP in-memory rate limiter. Adequate for low-traffic single-instance
 * deployments. Migrate to Upstash Ratelimit (or Cloud Armor) when traffic
 * grows or when scaling beyond 1 Cloud Run instance.
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

/**
 * Periodic cleanup so the bucket map doesn't grow unbounded.
 * Lazily called on each rate-check.
 */
function sweep() {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.windowStart >= WINDOW_MS * 2) {
      buckets.delete(ip);
    }
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
