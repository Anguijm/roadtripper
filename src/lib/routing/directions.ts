import "server-only";

export interface DirectionsResult {
  encodedPolyline: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  bounds: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
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
  }>;
  error?: { message: string };
}

export class RoutesApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "RoutesApiError";
  }
}

/**
 * Compute a driving route between two points using the Google Routes API v2.
 * Server-side only — uses GOOGLE_MAPS_KEY (not the public client key).
 */
export async function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DirectionsResult> {
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_KEY environment variable not set");
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
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.viewport",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: {
            location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          units: "IMPERIAL",
        }),
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
  };
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return `${Math.round(miles)} mi`;
}
