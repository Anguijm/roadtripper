import { headers } from "next/headers";
import Link from "next/link";
import TodayStart from "@/components/TodayStart";
import TodayPersonaBar from "@/components/TodayPersonaBar";
import { planToday } from "@/lib/today/plan";
import { hoursFrom, formatDrive, pointFrom, placeNameFrom } from "@/lib/today/presets";
import { fetchWaypointsForCandidates, MAX_WAYPOINT_CITIES } from "@/lib/routing/recommend";
import { buildRankedGroups, type WaypointFetchResult } from "@/lib/routing/scoring";
import { parsePersonaId, PERSONAS } from "@/lib/personas";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";
import { NEAR_THRESHOLD_KM } from "@/lib/geo/locate";

interface TodaySearchParams {
  lat?: string;
  lng?: string;
  hours?: string;
  persona?: string;
  name?: string;
}

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0d1117]">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors"
        >
          ← Roadtripper
        </Link>
        <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Today</span>
      </header>
      <main className="flex-1 p-6">
        <div className="w-full max-w-md mx-auto">{children}</div>
      </main>
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="border border-[#30363d] bg-[#161b22] p-6 flex flex-col gap-3">
      <p className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">{title}</p>
      <p className="text-sm text-[#b0b9c2]">{text}</p>
      <Link
        href="/today"
        className="self-start min-h-[44px] text-sm font-mono uppercase tracking-widest border border-[#30363d] hover:border-[#6e7681] px-4 py-2 text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
      >
        Type a city
      </Link>
    </div>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<TodaySearchParams>;
}) {
  const params = await searchParams;
  const personaId = parsePersonaId(params.persona);
  const hours = hoursFrom(params.hours);

  // No point yet: ask. The start screen locates on its own once permission
  // has been granted, so this is the page that opens knowing your city.
  // Blank, missing, or nonsense coordinates are all "no point".
  const origin = pointFrom(params.lat, params.lng);
  if (!origin) {
    return (
      <Shell>
        <div className="mb-6">
          <h1 className="text-2xl font-mono tracking-tight text-[#f0f6fc] mb-2">What is in range today?</h1>
          <p className="text-sm text-[#8b949e]">No destination needed. Where you are, how long you have, what you like.</p>
        </div>
        <TodayStart initialHours={hours} initialPersonaId={personaId} />
      </Shell>
    );
  }

  // Everything below is SQLite, but it is still CPU on a shared box, so the
  // same per-IP limiter as the plan page applies.
  maybeSweep();
  const limit = checkRateLimit(getClientIp(await headers()));
  if (!limit.ok) {
    return (
      <Shell>
        <Notice title="Slow down" text={`Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`} />
      </Shell>
    );
  }

  const plan = planToday(origin, hours);
  const whereLabel = placeNameFrom(params.name, plan.here ? plan.here.city.name : "Your location");

  if (plan.reach === "no-city") {
    return (
      <Shell>
        <Notice
          title="Not near a city we know"
          text="There is no atlas city within 40 km of that point, so the drive graph cannot answer from here. Type the nearest city instead."
        />
      </Shell>
    );
  }
  if (plan.reach === "no-graph") {
    return (
      <Shell>
        <Notice
          title={`No drive times for ${plan.here?.city.name ?? "this city"}`}
          text="The atlas knows the city but has no drive graph rows for it yet. Type a nearby city instead."
        />
      </Shell>
    );
  }

  // The pipeline answers "fresh", or "degraded" with the cities still present
  // and some or all waypoints missing. It is not expected to throw, but the
  // city list is the answer and must survive if it does: a throw becomes
  // "degraded" with the cities from the graph and no spots.
  let fetchResult: WaypointFetchResult;
  try {
    fetchResult = await fetchWaypointsForCandidates(plan.reachable);
  } catch (err) {
    console.error("[today] waypoint pipeline threw:", err instanceof Error ? err.constructor.name : "unknown");
    fetchResult = {
      status: "degraded",
      cities: plan.reachable.slice(0, MAX_WAYPOINT_CITIES).map((r) => ({
        id: r.city.id, name: r.city.name, vibeClass: null, detourMinutes: r.oneWayDriveMinutes * 2, lat: r.city.lat, lng: r.city.lng,
      })),
      waypoints: [],
      neighborhoods: {},
      failures: [{ kind: "waypoints", reason: err instanceof Error ? err.message : "unknown" }],
    };
  }
  // The city list is still the answer; the spots are not, so the page says
  // so rather than showing "nothing here yet" for a city whose read failed.
  const spotsDegraded = fetchResult.status === "degraded";
  const groups = buildRankedGroups(fetchResult, personaId);
  const oneWay = new Map(plan.reachable.map((r) => [r.city.id, r.oneWayDriveMinutes]));
  const cityById = new Map(plan.reachable.map((r) => [r.city.id, r.city]));
  const shown = groups.length;
  const total = plan.reachable.length;
  const persona = PERSONAS[personaId];

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-mono tracking-tight text-[#f0f6fc] mb-1">
          {total === 0 ? `Nothing within ${hours} hours` : `${total} ${total === 1 ? "city" : "cities"} within ${hours} hours`}
        </h1>
        <p className="text-sm text-[#8b949e]">
          From {whereLabel}
          {/* Same 3 km as the "Near <city>" label, imported so it cannot drift:
              inside it you are in the city; beyond it, say how far. The
              boundary is pinned at exactly 3.0 by locate.test.ts. */}
          {plan.here && plan.here.distanceKm > NEAR_THRESHOLD_KM ? `, ${Math.round(plan.here.distanceKm)} km from ${plan.here.city.name}` : ""}
          . One-way drive times.
        </p>
        {spotsDegraded && (
          <p className="mt-2 text-xs font-mono text-[#ff7b72]" role="status">
            The cities are right, but some spots could not be loaded just now.
          </p>
        )}
      </div>

      <div className="mb-5">
        <TodayPersonaBar activePersonaId={personaId} />
      </div>

      {total === 0 ? (
        <Notice title="Try more hours" text={`No atlas city is within ${hours} hours of ${whereLabel}.`} />
      ) : (
        <ol className="flex flex-col gap-4" aria-label={`Cities within ${hours} hours, nearest first`}>
          {groups.map((g) => (
            <li key={g.cityId} className="border border-[#30363d] bg-[#161b22] p-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h2 className="text-base font-mono text-[#f0f6fc]">{g.cityName}</h2>
                <span className="text-sm font-mono text-[#8b949e] whitespace-nowrap">
                  {formatDrive(oneWay.get(g.cityId) ?? g.detourMinutes / 2)}
                </span>
              </div>
              {/* The way out of this screen into the trip planner: start and
                  end filled in, so "five hours, Albuquerque looks good" is one
                  tap from a route. Every group comes from plan.reachable, so
                  the lookup cannot miss; if it ever did, no link is better
                  than a link to the equator. */}
              {(() => {
                const city = cityById.get(g.cityId);
                if (!city) return null;
                return (
                  <Link
                    href={`/?${new URLSearchParams({
                      fromName: whereLabel,
                      fromLat: origin.lat.toString(),
                      fromLng: origin.lng.toString(),
                      toName: g.cityName,
                      toLat: city.lat.toString(),
                      toLng: city.lng.toString(),
                    }).toString()}`}
                    className="inline-block mb-2 text-xs font-mono uppercase tracking-widest text-[#8b949e] underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
                  >
                    Plan a trip here
                  </Link>
                );
              })()}
              {g.rows.length === 0 ? (
                <p className="text-xs font-mono text-[#8b949e]">
                  {spotsDegraded ? "Spots did not load." : `Nothing in the atlas for a ${persona.label.toLowerCase()} here yet.`}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {g.rows.map((w) => (
                    <li key={w.waypointId} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-[#f0f6fc]">{w.name}</span>
                      <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e] whitespace-nowrap">{w.type.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-5 text-xs font-mono text-[#8b949e]">
        {shown < total ? `Showing the nearest ${shown} of ${total}. ` : ""}
        <Link href={`/today?hours=${hours}&persona=${personaId}`} className="underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none">
          Change where or how long
        </Link>
      </p>
    </Shell>
  );
}
