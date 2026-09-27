/**
 * Where you are, as the trip's origin.
 *
 * Pure and browser-free by design: nothing here touches `navigator` or
 * `window`. The browser objects are passed in, so the whole path from "ask the
 * phone" to "a CitySelection for the From field" runs under a fake in tests,
 * and nothing can run during server rendering by accident (the RouteMap SSR
 * crash of session 25 was exactly a browser global read at render time).
 */

import type { LatLng } from "@/lib/plan/types";

/** The one shape of a chosen start city the form understands. */
export interface OriginSelection {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

export type LocateErrorCode = "unsupported" | "denied" | "unavailable" | "timeout";

export class LocateError extends Error {
  readonly code: LocateErrorCode;
  constructor(code: LocateErrorCode) {
    super(`locate: ${code}`);
    this.name = "LocateError";
    this.code = code;
  }
}

/** The slice of `navigator.geolocation` this module uses. */
export interface GeolocationLike {
  getCurrentPosition(
    success: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
    error?: (e: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }
  ): void;
}

/** The slice of `navigator.permissions` this module uses. */
export interface PermissionsLike {
  query(desc: { name: "geolocation" }): Promise<{ state: string }>;
}

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

/** Ten seconds: a phone with a fix answers in one or two; past ten the user is
 *  better served by typing. Five minutes of cached position is fine for a
 *  city-scale origin. */
export const LOCATE_TIMEOUT_MS = 10_000;
export const LOCATE_MAX_AGE_MS = 5 * 60_000;

/** Beyond this the label says "Near <city>" rather than claiming the city. */
export const NEAR_THRESHOLD_KM = 3;

export interface Position {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

/** What the server's snap action answers. Defined here so the client and the
 *  action share one type without the client importing the action's module. */
export type SnapResult =
  | { ok: true; snap: { city: { id: string; name: string; lat: number; lng: number }; distanceKm: number } | null }
  | { ok: false; code: "invalid" | "rate_limited" | "atlas_unavailable" };

/** Wraps the callback API in a promise with typed failures. */
export function locate(geolocation: GeolocationLike | undefined): Promise<Position> {
  if (!geolocation) return Promise.reject(new LocateError("unsupported"));
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        }),
      (e) => {
        // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
        const code: LocateErrorCode = e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable";
        reject(new LocateError(code));
      },
      { enableHighAccuracy: false, timeout: LOCATE_TIMEOUT_MS, maximumAge: LOCATE_MAX_AGE_MS }
    );
  });
}

/**
 * Whether the browser will answer without prompting. "unknown" covers a
 * browser without the Permissions API (Safari before 16) and a query that
 * throws; both mean "do not locate on your own, wait for a tap".
 */
export async function permissionState(permissions: PermissionsLike | undefined): Promise<PermissionState> {
  if (!permissions) return "unknown";
  try {
    const { state } = await permissions.query({ name: "geolocation" });
    return state === "granted" || state === "denied" || state === "prompt" ? state : "unknown";
  } catch {
    return "unknown";
  }
}

/** The words next to the From field once located. */
export function originLabel(snap: { city: { name: string }; distanceKm: number } | null): string {
  if (!snap) return "Your location";
  return snap.distanceKm > NEAR_THRESHOLD_KM ? `Near ${snap.city.name}` : snap.city.name;
}

/**
 * Ask the phone, snap to the nearest atlas city, and build the selection.
 * The exact coordinates are the origin; the city is only the label, so a
 * failed or empty snap still yields a usable origin called "Your location".
 * Rejects with LocateError only when there is no position at all.
 */
export async function locateAndSnap(deps: {
  geolocation: GeolocationLike | undefined;
  snap: (p: LatLng) => Promise<SnapResult>;
}): Promise<{ selection: OriginSelection; label: string }> {
  const pos = await locate(deps.geolocation);
  let snapped: Extract<SnapResult, { ok: true }>["snap"] = null;
  try {
    const r = await deps.snap({ lat: pos.lat, lng: pos.lng });
    if (r.ok) snapped = r.snap;
  } catch {
    // The snap is a nicety; the coordinates are the origin.
  }
  const label = originLabel(snapped);
  return {
    selection: {
      placeId: `geo:${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`,
      name: label,
      lat: pos.lat,
      lng: pos.lng,
    },
    label,
  };
}

/** One plain line for each way locating can fail. */
export function locateFailureMessage(err: unknown): string {
  const code = err instanceof LocateError ? err.code : "unavailable";
  switch (code) {
    case "denied": return "Location is off. Type your start city.";
    case "timeout": return "Took too long to find you. Type your start city.";
    case "unsupported": return "This browser cannot share location. Type your start city.";
    default: return "Could not get your location. Type your start city.";
  }
}
