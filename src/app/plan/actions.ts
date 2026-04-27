"use server";

import { headers } from "next/headers";
import {
  computeRouteWithStops,
  RoutesApiError,
  type DirectionsResult,
} from "@/lib/routing/directions";
import { haversineKm } from "@/lib/routing/polyline";
import { findCandidateCities } from "@/lib/routing/candidates";
import { fetchWaypointsForCandidates } from "@/lib/routing/recommend";
import {
  detourCapForBudget,
  isBudgetHoursInRange,
} from "@/lib/routing/validation";
import type { WaypointFetchResult } from "@/lib/routing/scoring";
import {
  checkRateLimit,
  checkDailyQuota,
  checkRecomputeSpacing,
  getClientIp,
  maybeSweep,
} from "@/lib/routing/rate-limit";

/**
 * Server Action — recompute the driving route through a set of
 * client-selected intermediate stops AND refresh the candidate
 * city + waypoint set against the new corridor. Invoked from
 * `PlanWorkspace` when the user adds or removes a stop. Returns a
 * discriminated union — never throws across the RSC boundary.
 *
 * Rate-limit accounting (Council ISC-S7-SEC-2):
 *   ONE call to this action = ONE burst slot + ONE spacing slot
 *   + ONE daily quota slot, regardless of how many backend services
 *   it fans out to internally. Do NOT add per-service charges in
 *   future refactors.
 *
 * Council ISC anchors (Sessions 6 + 7 pre-EXECUTE gates):
 *   S6-SEC-1  every stop coord validated (finite + range + NA bbox)
 *   S6-SEC-2  server-side max-stops cap, dedupe, payload-shape rejection
 *   S6-SEC-3  per-IP daily quota
 *   S6-SEC-4  fixed error enum — never forwards upstream error strings
 *   S6-SEC-6  defensive cap mirrored in computeRouteWithStops
 *   S6-SEC-7  per-IP recompute spacing limiter
 *   S6-ARCH-4 return type is JSON-safe (numbers + strings + nested plain objects)
 *   S7-SEC-1  budgetHours validated in same shape/range block
 *   S7-SEC-2  single-charge documentation (above)
 *   S7-SEC-4  catch around candidates pipeline returns ONLY {degraded:true}
 *   S7-ARCH-2 partial-failure path: route still ships, recommendations marked degraded
 *   S7-ARCH-3 explicit `waypointStatus` discriminator
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

/** Discriminator for the recommendation refresh half of the response.
 *  - "fresh"    : recommendations were re-fetched against the new corridor
 *  - "degraded" : recommendations could NOT be refreshed; client should
 *                 keep its prior `liveWaypointFetch` and surface a notice
 *                 (Council ISC-S7-ARCH-2 / S7-PROD-1) */
export type WaypointRefreshStatus = "fresh" | "degraded";

export type RecomputeAndRefreshResult =
  | {
      ok: true;
      route: DirectionsResult;
      waypointStatus: "fresh";
      waypointFetch: WaypointFetchResult;
    }
  | {
      ok: true;
      route: DirectionsResult;
      waypointStatus: "degraded";
      waypointFetch: null;
    }
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

export async function recomputeAndRefreshAction(
  origin: PlainLatLng,
  destination: PlainLatLng,
  stops: ReadonlyArray<RecomputeStopInput>,
  budgetHours: number,
  selectedCityId?: string
): Promise<RecomputeAndRefreshResult> {
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

  // ── Shape + range validation (BEFORE daily quota — Council S6 + S7-SEC-1) ──
  if (!isFiniteLatLng(origin) || !inNorthAmerica(origin)) {
    return { ok: false, error: "invalid_input" };
  }
  if (!isFiniteLatLng(destination) || !inNorthAmerica(destination)) {
    return { ok: false, error: "invalid_input" };
  }
  if (!isBudgetHoursInRange(budgetHours)) {
    return { ok: false, error: "invalid_input" };
  }
  if (
    selectedCityId !== undefined &&
    !/^[a-z0-9-]{1,100}$/.test(selectedCityId)
  ) {
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

  // ── Daily quota (cost-amplification ceiling — single charge per call) ──
  const daily = checkDailyQuota(ip);
  if (!daily.ok) {
    return { ok: false, error: "quota_exceeded", retryAfterSeconds: daily.retryAfterSeconds };
  }

  // ── Stage 1: Routes API recompute ──────────────────────────────────────
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
    console.error("[recomputeAndRefreshAction] route stage failed:", e);
    return { ok: false, error: "internal_error" };
  }

  // Stage 2: candidate refresh against the new polyline. If this fails,
  // ship the route with `waypointStatus: "degraded"` so the client keeps
  // its previous recommendations on screen (Council S7-ARCH-2 / PROD-1 / SEC-4).
  try {
    const validatedCandidates = await findCandidateCities(route.encodedPolyline, {
      maxDetourMinutes: detourCapForBudget(budgetHours),
    });
    const waypointFetch = await fetchWaypointsForCandidates(validatedCandidates, selectedCityId);
    console.info(
      `[recomputeAndRefreshAction] ok stops=${cleanStops.length} status=fresh dailyRemaining=${daily.remaining}`
    );
    return { ok: true, route, waypointStatus: "fresh", waypointFetch };
  } catch (e) {
    // SEC-4: log server-side; surface ONLY the degraded flag to the client.
    console.error("[recomputeAndRefreshAction] candidate refresh failed:", e);
    return { ok: true, route, waypointStatus: "degraded", waypointFetch: null };
  }
}
