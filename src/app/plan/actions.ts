"use server";

import { headers } from "next/headers";
import {
  computeRouteWithStops,
  RoutesApiError,
  type DirectionsResult,
} from "@/lib/routing/directions";
import { haversineKm } from "@/lib/routing/polyline";
import {
  checkRateLimit,
  checkDailyQuota,
  checkRecomputeSpacing,
  getClientIp,
  maybeSweep,
} from "@/lib/routing/rate-limit";

/**
 * Server Action — recompute the driving route through a set of
 * client-selected intermediate stops. Invoked from `PlanWorkspace` when
 * the user adds or removes a stop. Returns a discriminated union — never
 * throws across the RSC boundary.
 *
 * Council ISC anchors (Session 6 pre-EXECUTE gate):
 *   SEC-1  every stop coord validated (finite + range + NA bbox)
 *   SEC-2  server-side max-stops cap, dedupe, payload-shape rejection
 *   SEC-3  per-IP daily quota
 *   SEC-4  fixed error enum — never forwards upstream error strings
 *   SEC-6  defensive cap mirrored in computeRouteWithStops
 *   SEC-7  per-IP recompute spacing limiter
 *   ARCH-4 return type is JSON-safe (numbers + strings + nested plain objects)
 */

const MAX_STOPS = 7;
const MAX_GREAT_CIRCLE_KM_TOTAL = 6000;

// North America bbox (matches the spirit of the existing validation —
// the project explicitly targets US/Canada road trips).
const NA_LAT_MIN = 14;
const NA_LAT_MAX = 72;
const NA_LNG_MIN = -170;
const NA_LNG_MAX = -50;

/** Fixed safe-error enum — never leak upstream messages. */
export type RecomputeErrorCode =
  | "invalid_input"
  | "too_many_stops"
  | "rate_limited"
  | "quota_exceeded"
  | "upstream_unavailable"
  | "internal_error";

export type RecomputeRouteResult =
  | { ok: true; route: DirectionsResult }
  | { ok: false; error: RecomputeErrorCode; retryAfterSeconds?: number };

interface PlainLatLng {
  lat: number;
  lng: number;
}

function isFiniteLatLng(p: unknown): p is PlainLatLng {
  if (p === null || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.lat === "number" &&
    typeof obj.lng === "number" &&
    Number.isFinite(obj.lat) &&
    Number.isFinite(obj.lng)
  );
}

function inNorthAmerica(p: PlainLatLng): boolean {
  return (
    p.lat >= NA_LAT_MIN &&
    p.lat <= NA_LAT_MAX &&
    p.lng >= NA_LNG_MIN &&
    p.lng <= NA_LNG_MAX
  );
}

interface RecomputeStopInput {
  cityId: string;
  lat: number;
  lng: number;
}

function isStopInput(s: unknown): s is RecomputeStopInput {
  if (s === null || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.cityId === "string" &&
    obj.cityId.length > 0 &&
    obj.cityId.length < 256 &&
    typeof obj.lat === "number" &&
    typeof obj.lng === "number" &&
    Number.isFinite(obj.lat) &&
    Number.isFinite(obj.lng)
  );
}

export async function recomputeRouteAction(
  origin: PlainLatLng,
  destination: PlainLatLng,
  stops: ReadonlyArray<RecomputeStopInput>
): Promise<RecomputeRouteResult> {
  // ── Burst + spacing gates (DoS shields — run BEFORE validation) ────────
  let ip: string;
  try {
    const h = await headers();
    ip = getClientIp(h);
  } catch {
    return { ok: false, error: "internal_error" };
  }
  maybeSweep();

  const burst = checkRateLimit(ip);
  if (!burst.ok) {
    return { ok: false, error: "rate_limited", retryAfterSeconds: burst.retryAfterSeconds };
  }
  const spacing = checkRecomputeSpacing(ip);
  if (!spacing.ok) {
    return { ok: false, error: "rate_limited", retryAfterSeconds: spacing.retryAfterSeconds };
  }

  // ── Shape + range validation ────────────────────────────────────────────
  // Run BEFORE the daily quota so malformed payloads don't burn quota.
  if (!isFiniteLatLng(origin) || !inNorthAmerica(origin)) {
    return { ok: false, error: "invalid_input" };
  }
  if (!isFiniteLatLng(destination) || !inNorthAmerica(destination)) {
    return { ok: false, error: "invalid_input" };
  }

  if (!Array.isArray(stops)) {
    return { ok: false, error: "invalid_input" };
  }
  // Cap BEFORE iterating (Council ISC-S6-SEC-2)
  if (stops.length > MAX_STOPS) {
    return { ok: false, error: "too_many_stops" };
  }

  const seenCityIds = new Set<string>();
  const cleanStops: PlainLatLng[] = [];
  for (const s of stops) {
    if (!isStopInput(s)) return { ok: false, error: "invalid_input" };
    if (!inNorthAmerica(s)) return { ok: false, error: "invalid_input" };
    if (seenCityIds.has(s.cityId)) return { ok: false, error: "invalid_input" };
    seenCityIds.add(s.cityId);
    cleanStops.push({ lat: s.lat, lng: s.lng });
  }

  // Sanity-check overall corridor length (origin → stops → destination)
  // — same spirit as `validateRouteParams`. Catches "Tokyo to NYC via
  // London" attempts.
  const path: PlainLatLng[] = [origin, ...cleanStops, destination];
  let totalKm = 0;
  for (let i = 1; i < path.length; i++) {
    totalKm += haversineKm(path[i - 1], path[i]);
  }
  if (totalKm > MAX_GREAT_CIRCLE_KM_TOTAL) {
    return { ok: false, error: "invalid_input" };
  }

  // ── Daily quota (cost-amplification ceiling — run AFTER validation) ────
  const daily = checkDailyQuota(ip);
  if (!daily.ok) {
    return { ok: false, error: "quota_exceeded", retryAfterSeconds: daily.retryAfterSeconds };
  }

  // ── Call Routes API ────────────────────────────────────────────────────
  let route: DirectionsResult;
  try {
    route = await computeRouteWithStops(
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
      cleanStops
    );
  } catch (e) {
    if (e instanceof RoutesApiError) {
      return { ok: false, error: "upstream_unavailable" };
    }
    console.error("[recomputeRouteAction] unexpected error:", e);
    return { ok: false, error: "internal_error" };
  }

  // Light abuse-detection log (no PII, no IP — just shape).
  console.info(
    `[recomputeRouteAction] ok stops=${cleanStops.length} dailyRemaining=${daily.remaining}`
  );

  return { ok: true, route };
}
