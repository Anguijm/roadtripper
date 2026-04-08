"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { APIProvider, Map as GMap, useMap } from "@vis.gl/react-google-maps";

export interface CandidateMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  detourMinutes: number;
}

interface RouteMapProps {
  origin?: google.maps.LatLngLiteral;
  destination?: google.maps.LatLngLiteral;
  encodedPolyline?: string;
  bounds?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  candidates?: CandidateMarker[];
  /** Persona accent color for the route line. Defaults to explorer blue. */
  routeColor?: string;
  /** City id currently highlighted (hovered / selected from the list) */
  highlightedCandidateId?: string | null;
  /** Fired when the user clicks a candidate marker on the map */
  onCandidateClick?: (cityId: string) => void;
}

const NYC: google.maps.LatLngLiteral = { lat: 40.7128, lng: -74.006 };
const DC: google.maps.LatLngLiteral = { lat: 38.9072, lng: -77.0369 };

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1c2128" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7d8590" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3d444d" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#262c36" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a5159" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#161b22" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1c2128" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#30363d" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/**
 * Renders a precomputed encoded polyline directly on the map.
 * Avoids a second Directions API call when the polyline was already
 * computed server-side.
 */
function PolylineRenderer({
  encodedPolyline,
  bounds,
  origin,
  destination,
  candidates,
  routeColor,
  highlightedCandidateId,
  onCandidateClick,
}: {
  encodedPolyline: string;
  bounds?: RouteMapProps["bounds"];
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  candidates?: CandidateMarker[];
  routeColor: string;
  highlightedCandidateId?: string | null;
  onCandidateClick?: (cityId: string) => void;
}) {
  const map = useMap();
  // Marker handles are imperative Google Maps objects, not React-rendered.
  // Refs avoid re-render churn (and a flash-of-wrong-highlight race that
  // happens when the build effect triggers a re-render before the
  // highlight effect runs).
  const candidateMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const previousHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !window.google?.maps?.geometry) return;

    const path = google.maps.geometry.encoding.decodePath(encodedPolyline);

    const line = new google.maps.Polyline({
      path,
      strokeColor: routeColor,
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map,
    });

    const startMarker = new google.maps.Marker({
      position: origin,
      map,
      title: "Start",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#3fb950",
        fillOpacity: 1,
        strokeColor: "#0d1117",
        strokeWeight: 2,
      },
    });

    const endMarker = new google.maps.Marker({
      position: destination,
      map,
      title: "End",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#f85149",
        fillOpacity: 1,
        strokeColor: "#0d1117",
        strokeWeight: 2,
      },
    });

    const candidateEntries: Array<[string, google.maps.Marker]> = (
      candidates ?? []
    ).map((candidate) => {
      const marker = new google.maps.Marker({
        position: { lat: candidate.lat, lng: candidate.lng },
        map,
        label: {
          text: candidate.name,
          color: "#f0f6fc",
          fontSize: "11px",
          fontWeight: "500",
          className: "rt-candidate-label",
        },
        title: `${candidate.name} (+${Math.round(candidate.detourMinutes)} min detour)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: routeColor,
          fillOpacity: 0.9,
          strokeColor: "#0d1117",
          strokeWeight: 2,
        },
      });
      if (onCandidateClick) {
        marker.addListener("click", () => onCandidateClick(candidate.id));
      }
      return [candidate.id, marker];
    });

    const candidateMarkers = candidateEntries.map(([, m]) => m);
    candidateMarkersRef.current = new Map(candidateEntries);
    // Reset highlight tracking on rebuild
    previousHighlightRef.current = null;

    if (bounds) {
      map.fitBounds(
        new google.maps.LatLngBounds(
          { lat: bounds.southwest.lat, lng: bounds.southwest.lng },
          { lat: bounds.northeast.lat, lng: bounds.northeast.lng }
        ),
        { top: 60, right: 60, bottom: 120, left: 60 }
      );
    } else {
      const b = new google.maps.LatLngBounds();
      path.forEach((p) => b.extend(p));
      map.fitBounds(b, { top: 60, right: 60, bottom: 120, left: 60 });
    }

    return () => {
      line.setMap(null);
      startMarker.setMap(null);
      endMarker.setMap(null);
      candidateMarkers.forEach((m) => m.setMap(null));
      candidateMarkersRef.current = new Map();
      previousHighlightRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, encodedPolyline, candidates, routeColor]);

  // Highlight effect: only touch the markers that actually changed
  // (previous highlight + new highlight). Avoids N-marker churn per hover.
  useEffect(() => {
    if (!window.google?.maps) return;
    const markersMap = candidateMarkersRef.current;
    if (markersMap.size === 0) return;

    const baseIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: routeColor,
      fillOpacity: 0.9,
      strokeColor: "#0d1117",
      strokeWeight: 2,
    };
    const activeIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: routeColor,
      fillOpacity: 1,
      strokeColor: "#f0f6fc",
      strokeWeight: 3,
    };

    const prev = previousHighlightRef.current;
    if (prev && prev !== highlightedCandidateId) {
      const prevMarker = markersMap.get(prev);
      if (prevMarker) {
        prevMarker.setIcon(baseIcon);
        prevMarker.setZIndex(1);
      }
    }
    if (highlightedCandidateId) {
      const nextMarker = markersMap.get(highlightedCandidateId);
      if (nextMarker) {
        nextMarker.setIcon(activeIcon);
        nextMarker.setZIndex(1000);
      }
    }
    previousHighlightRef.current = highlightedCandidateId ?? null;
  }, [highlightedCandidateId, routeColor]);

  return null;
}

function DirectionsFallback({
  origin,
  destination,
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
}) {
  const map = useMap();
  const [renderer, setRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

  const renderRoute = useCallback(async () => {
    if (!map) return;

    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#58a6ff",
        strokeWeight: 4,
        strokeOpacity: 0.8,
      },
    });

    try {
      const result = await directionsService.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      });
      directionsRenderer.setDirections(result);
      setRenderer(directionsRenderer);
    } catch (err) {
      console.error("Directions request failed:", err);
    }
  }, [map, origin, destination]);

  useEffect(() => {
    renderRoute();
    return () => {
      if (renderer) renderer.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderRoute]);

  return null;
}

export default function RouteMap({
  origin = NYC,
  destination = DC,
  encodedPolyline,
  bounds,
  candidates,
  routeColor = "#58a6ff",
  highlightedCandidateId = null,
  onCandidateClick,
}: RouteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#161b22] border border-[#30363d]">
        <p className="text-sm text-[#7d8590] font-mono uppercase tracking-widest">
          Configure NEXT_PUBLIC_GOOGLE_MAPS_KEY
        </p>
      </div>
    );
  }

  const center = {
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2,
  };

  return (
    <APIProvider apiKey={apiKey} libraries={["geometry"]}>
      <GMap
        defaultCenter={center}
        defaultZoom={7}
        gestureHandling="greedy"
        zoomControl={true}
        fullscreenControl={false}
        mapTypeControl={false}
        streetViewControl={false}
        styles={DARK_MAP_STYLES}
        className="h-full w-full"
      >
        {encodedPolyline ? (
          <PolylineRenderer
            encodedPolyline={encodedPolyline}
            bounds={bounds}
            origin={origin}
            destination={destination}
            candidates={candidates}
            routeColor={routeColor}
            highlightedCandidateId={highlightedCandidateId}
            onCandidateClick={onCandidateClick}
          />
        ) : (
          <DirectionsFallback origin={origin} destination={destination} />
        )}
      </GMap>
    </APIProvider>
  );
}
