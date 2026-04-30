import "server-only";

export interface DirectionsResult {
  encodedPolyline: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  bounds: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  /** Per-leg breakdown: legs[i] = drive from stop[i-1] (or origin) to stop[i].
   *  The final element is the leg from the last intermediate stop to destination. */
  legs: Array<{ durationSeconds: number; distanceMeters: number }>;
}

interface RoutesApiResponse {
  routes?: Array<{
    distanceMeters: number;
    duration: string;
    polyline: { encodedPolyline: string };
    viewport: {
      low: { latitude: number; longitude: number };
      high: { latitude: number; longitude: number };
    };
    legs?: Array<{
      duration: string;
      distanceMeters: number;
    }>;
  }>;
  error?: { message: string };
}

export class RoutesApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "RoutesApiError";
  }
}

/** Defensive cap on intermediate stops at the helper boundary.
 *  Mirrored by the action's cap (Council ISC-S6-SEC-6). */
const MAX_INTERMEDIATES = 7;

/**
 * Compute a driving route between two points (optionally through ordered
 * intermediate stops) using the Google Routes API v2.
 *
 * Server-side only — uses GOOGLE_MAPS_KEY (not the public client key).
 */
export async function computeRouteWithStops(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  stops: ReadonlyArray<{ lat: number; lng: number }>
): Promise<DirectionsResult> {
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_KEY environment variable not set");
  }

  // Defense in depth — Council ISC-S6-SEC-6
  if (stops.length > MAX_INTERMEDIATES) {
    throw new RoutesApiError(
      `computeRouteWithStops: too many stops (${stops.length} > ${MAX_INTERMEDIATES})`
    );
  }

  // Body is constructed field-by-field — never spread client objects.
  // Council ISC-S6-SEC-6 (prevents `sideOfRoad` / `vehicleHeading` / `via` injection).
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    units: "IMPERIAL",
  };

  // Routes API rejects an empty `intermediates: []` — only set the field
  // when we actually have stops.
  if (stops.length > 0) {
    body.intermediates = stops.map((s) => ({
      location: { latLng: { latitude: s.lat, longitude: s.lng } },
    }));
    // Intentionally NOT passing `optimizeWaypointOrder` — preserve the
    // user-controlled order from the Itinerary.
  }

  let response: Response;
  try {
    response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.viewport,routes.legs.duration,routes.legs.distanceMeters",
        },
        body: JSON.stringify(body),
      }
    );
  } catch {
    throw new RoutesApiError("Routes API request failed");
  }

  if (!response.ok) {
    // Don't include response body in the thrown error to avoid leaking
    // potentially sensitive details (or the API key in edge cases) to logs.
    throw new RoutesApiError(`Routes API returned ${response.status}`, response.status);
  }

  let data: RoutesApiResponse;
  try {
    data = await response.json();
  } catch {
    throw new RoutesApiError("Routes API returned an invalid response");
  }

  if (data.error) {
    throw new RoutesApiError("Routes API error");
  }

  const route = data.routes?.[0];
  if (!route) {
    throw new RoutesApiError("No route found between origin and destination");
  }

  return {
    encodedPolyline: route.polyline.encodedPolyline,
    totalDistanceMeters: route.distanceMeters,
    totalDurationSeconds: parseInt(route.duration.replace("s", ""), 10),
    bounds: {
      northeast: { lat: route.viewport.high.latitude, lng: route.viewport.high.longitude },
      southwest: { lat: route.viewport.low.latitude, lng: route.viewport.low.longitude },
    },
    legs: (route.legs ?? []).map((l) => ({
      durationSeconds: parseInt(l.duration.replace("s", ""), 10),
      distanceMeters: l.distanceMeters,
    })),
  };
}

/**
 * Convenience wrapper — compute a route with no intermediate stops.
 */
export function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DirectionsResult> {
  return computeRouteWithStops(origin, destination, []);
}
