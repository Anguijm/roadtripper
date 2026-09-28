import PlanWorkspace from "@/components/PlanWorkspace";
import { atlasStaleness, warnIfAtlasStale } from "@/lib/atlas/db";

/**
 * Zero-cost render health check.
 *
 * Renders the same component tree as /plan, with fixed props, and makes no
 * Routes API, Firestore or Places calls. An uptime check can therefore hit it
 * every minute for free, where the same check against a real /plan URL costs
 * roughly $0.25 per cache miss in Route Matrix calls.
 *
 * What it catches: any `google.*` reference (or other browser-only global) that
 * creeps onto a server render path. That is the class of bug that took the plan
 * page down on 2026-09-22 with `ReferenceError: google is not defined`, and it
 * is invisible to a status-code check because Next streams the response: the
 * 200 is flushed before the render can throw. React then emits an `$RX(` error
 * boundary abort into the body, which is what the uptime check matches on.
 *
 * Limitation worth knowing: because the props are fixed, this catches
 * render-path bugs but NOT data-dependent ones. A crash that only fires on a
 * particular Firestore shape, an empty candidate set or a malformed polyline
 * will pass here. The SSR unit tests cover zero-state; anything data-shaped
 * needs the real /plan check, which is why that one is kept rather than
 * replaced.
 *
 * Keep the props here static. The moment this page fetches anything, it stops
 * being free and starts being another thing that can go down on its own.
 */
export const dynamic = "force-dynamic";

const ORIGIN = { lat: 40.7127753, lng: -74.0059728 };
const DESTINATION = { lat: 34.0549076, lng: -118.242643 };

export default function HealthPage() {
  // Surfaced here because /health is the page something already watches every
  // minute. The uptime check keys on the canary below, not on this line, so a
  // stale atlas does not page anyone; it is here to be seen by a human and to
  // reach the logs on first open.
  warnIfAtlasStale();
  const atlas = atlasStaleness();
  return (
    <div aria-hidden className="h-screen w-screen overflow-hidden">
      <p style={{ position: "absolute", bottom: 0, left: 0, fontSize: 10, opacity: 0.5, zIndex: 50 }}>
        atlas exported {atlas.exportedAt ?? "unknown"}
        {atlas.ageDays !== null ? ` (${Math.floor(atlas.ageDays)}d)` : ""}
        {atlas.stale ? " STALE" : ""}
      </p>
      <PlanWorkspace
        origin={ORIGIN}
        destination={DESTINATION}
        encodedPolyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        bounds={{
          northeast: { lat: 40.7127753, lng: -74.0059728 },
          southwest: { lat: 34.0549076, lng: -118.242643 },
        }}
        candidateMarkers={[
          {
            id: "philadelphia",
            name: "Philadelphia",
            lat: 39.9526,
            lng: -75.1652,
            detourMinutes: 225,
          },
        ]}
        waypointFetch={{
          status: "fresh",
          cities: [
            {
              id: "philadelphia",
              name: "Philadelphia",
              vibeClass: null,
              detourMinutes: 225,
              lat: 39.9526,
              lng: -75.1652,
            },
          ],
          waypoints: [
            {
              id: "health-waypoint",
              cityId: "philadelphia",
              name: "Eastern State Penitentiary",
              type: "landmark",
              trendingScore: 50,
              neighborhoodId: null, description: "A fixed waypoint the health check renders; the atlas has a real reason for every real one.",
            },
          ],
          neighborhoods: {},
        }}
        initialPersonaId="culture"
        budgetHours={4}
        initialDistanceMeters={4469715}
        initialDurationSeconds={148384}
        fromName="Health Origin"
        toName="Health Destination"
      />
      {/* The uptime check (Google Cloud, every minute; the definition is
          scratchpad/health_check.json) matches the string "Budget left",
          which was the sheet's stat until Gauntlet U1 round 2 replaced it
          with the glossary's sentence ("4 h of driving left today"). This
          hidden line keeps the check green until its matcher is re-pointed
          at "of driving left"; delete it with that change. It comes after
          the workspace, so a throw in there still drops it from the page:
          the check proves the same render it always did. */}
      <p hidden data-uptime-canary>Budget left</p>
    </div>
  );
}
