"use server";

import { headers } from "next/headers";
import { LatLngSchema } from "@/lib/plan/types";
import { snapToCity } from "@/lib/atlas/queries";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";
import type { SnapResult } from "@/lib/geo/locate";

/**
 * Nearest atlas city to a point, for labelling a located origin.
 *
 * The input is whatever the client sent, so it is validated before anything
 * else, and the call shares the per-IP rate limit with the plan page. The
 * lookup is a scan of the cities table in SQLite; no external service sees
 * the coordinates. A broken atlas is reported, not thrown, because the
 * caller has a perfectly good origin without the label.
 */
export async function snapOriginAction(input: unknown): Promise<SnapResult> {
  const parsed = LatLngSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  maybeSweep();
  const ip = getClientIp(await headers());
  if (!checkRateLimit(ip).ok) return { ok: false, code: "rate_limited" };

  try {
    const s = snapToCity(parsed.data);
    return {
      ok: true,
      snap: s
        ? { city: { id: s.city.id, name: s.city.name, lat: s.city.lat, lng: s.city.lng }, distanceKm: s.distanceKm }
        : null,
    };
  } catch (err) {
    console.error("[snapOrigin] atlas lookup failed:", err instanceof Error ? err.constructor.name : "unknown");
    return { ok: false, code: "atlas_unavailable" };
  }
}
