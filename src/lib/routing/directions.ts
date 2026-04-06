import "server-only";

export interface DirectionsLeg {
  startAddress: string;
  endAddress: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface DirectionsResult {
  encodedPolyline: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  legs: DirectionsLeg[];
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
    legs: Array<{
      distanceMeters: number;
      duration: string;
      startLocation: { latLng: { latitude: number; longitude: number } };
      endLocation: { latLng: { latitude: number; longitude: number } };
    }>;
    viewport: {
      low: { latitude: number; longitude: number };
      high: { latitude: number; longitude: number };
    };
  }>;
  error?: { message: string };
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

  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs,routes.viewport",
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Routes API failed (${response.status}): ${text}`);
  }

  const data: RoutesApiResponse = await response.json();
  if (data.error) {
    throw new Error(`Routes API error: ${data.error.message}`);
  }

  const route = data.routes?.[0];
  if (!route) {
    throw new Error("No route found between origin and destination");
  }

  return {
    encodedPolyline: route.polyline.encodedPolyline,
    totalDistanceMeters: route.distanceMeters,
    totalDurationSeconds: parseInt(route.duration.replace("s", ""), 10),
    legs: route.legs.map((leg) => ({
      startAddress: `${leg.startLocation.latLng.latitude},${leg.startLocation.latLng.longitude}`,
      endAddress: `${leg.endLocation.latLng.latitude},${leg.endLocation.latLng.longitude}`,
      distanceMeters: leg.distanceMeters,
      durationSeconds: parseInt(leg.duration.replace("s", ""), 10),
    })),
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
