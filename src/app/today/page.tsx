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
import { parseIsoDate, deadlineLine, todayIso, daysUntil } from "@/lib/plan/deadline";
import { feasibility, feasibilityLine } from "@/lib/plan/feasibility";
import { snapToCity, driveMinutesBetween, driveGraphPaceMinutesPerKm } from "@/lib/atlas/queries";
import { haversineKm } from "@/lib/routing/polyline";

interface TodaySearchParams {
  lat?: string;
  lng?: string;
  hours?: string;
  persona?: string;
  name?: string;
  /** The trip's deadline and where it is for, when there is one. */
  arriveBy?: string;
  toName?: string;
  toLat?: string;
  toLng?: string;
}

/** The deadline, if the link carried a real date and a real destination. */
function deadlineFrom(params: TodaySearchParams) {
  const endDate = parseIsoDate(params.arriveBy);
  const point = pointFrom(params.toLat, params.toLng);
  if (!endDate || !point) return null;
  return { endDate, point, toName: placeNameFrom(params.toName, "your destination") };
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
  const deadline = deadlineFrom(params);
  const deadlineText = deadline
    ? deadlineLine({ toName: deadline.toName, endDate: deadline.endDate, today: todayIso() })
    : null;
  // Carried through the start screen's Go, so locating does not lose it.
  const carry = deadline
    ? { arriveBy: deadline.endDate, toName: deadline.toName, toLat: String(deadline.point.lat), toLng: String(deadline.point.lng) }
    : undefined;

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
        <TodayStart initialHours={hours} initialPersonaId={personaId} carry={carry} deadlineText={deadlineText} />
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

  // The feasibility line, per city, when there is a deadline: how long you
  // can stay there and still make the destination. Minutes on to the
  // destination come from the graph when the pair exists; otherwise from the
  // graph's median pace over the straight line, and the sentence says so.
  const destCity = deadline ? (snapToCity(deadline.point)?.city ?? null) : null;
  const daysToDeadline = deadline ? daysUntil(deadline.endDate, todayIso()) : 0;
  const pace = deadline ? driveGraphPaceMinutesPerKm() : 0;
  const feasibilityFor = (cityId: string): string | null => {
    if (!deadline) return null;
    // hoursFrom only ever returns a preset from 2 to 8, so this cannot fail;
    // it is here so the budget's sign is checked where the budget is used,
    // since maxNights throws on zero.
    if (!(hours > 0)) return null;
    const city = cityById.get(cityId);
    if (!city) return null;
    if (destCity && destCity.id === cityId) return null;  // that city is the destination
    const exact = destCity ? driveMinutesBetween(cityId, destCity.id) : null;
    const minutesOn = exact ?? haversineKm(city, deadline.point) * pace;
    const f = feasibility({
      daysToDeadline,
      budgetMinutes: hours * 60,
      minutesToCity: oneWay.get(cityId) ?? 0,
      minutesCityToDestination: minutesOn,
    });
    return feasibilityLine(f, { toName: deadline.toName, endDate: deadline.endDate, estimated: exact === null });
  };
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
        {deadline && deadlineText && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-[#f0f6fc]" role="status">{deadlineText}</p>
            {/* The trip itself, from here to the deadline's destination, in
                arrival mode so the planner keeps the date as a deadline. */}
            <Link
              href={`/?${new URLSearchParams({
                fromName: whereLabel,
                fromLat: origin.lat.toString(),
                fromLng: origin.lng.toString(),
                toName: deadline.toName,
                toLat: deadline.point.lat.toString(),
                toLng: deadline.point.lng.toString(),
                dateMode: "arrival",
                endDate: deadline.endDate,
              }).toString()}`}
              className="self-start text-xs font-mono uppercase tracking-widest text-[#8b949e] underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
            >
              {`Plan the trip to ${deadline.toName} from here`}
            </Link>
          </div>
        )}
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
                const verdict = feasibilityFor(g.cityId);
                return verdict ? <p className="text-sm text-[#f0f6fc] mb-2">{verdict}</p> : null;
              })()}
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
        <Link href={`/today?${new URLSearchParams({ hours: String(hours), persona: personaId, ...(carry ?? {}) }).toString()}`} className="underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none">
          Change where or how long
        </Link>
      </p>
    </Shell>
  );
}
