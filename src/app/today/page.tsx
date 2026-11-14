import { headers } from "next/headers";
import Link from "next/link";
import TodayStart from "@/components/TodayStart";
import TodayMoodChips from "@/components/TodayMoodChips";
import { planToday } from "@/lib/today/plan";
import { todayHoursFrom, hoursParam, formatDrive, aboutMinutes, pointFrom, placeNameFrom } from "@/lib/today/presets";
import { fetchWaypointsForCandidates, MAX_WAYPOINT_CITIES } from "@/lib/routing/recommend";
import { buildRankedGroupsWith, type WaypointFetchResult } from "@/lib/routing/scoring";
import { parseMoods, MOODS_PARAM } from "@/lib/roadside/tags";
import { waypointProfileForMoods } from "@/lib/personas/moodProfile";
import { abroadLabel, kindWord } from "@/lib/plan/words";
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
  /** `string[]` when the link repeats the parameter; `parseMoods` reads both. */
  moods?: string | string[];
  /** Written by links made before U6; read only as a fallback, never written. */
  persona?: string | string[];
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
      {/* The masthead in sentence case, the body face, 16 px (quality bar,
          rules 1 and 2). */}
      <header className="flex items-center justify-between gap-4 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="min-h-[44px] flex items-center text-base text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          ← Roadtripper
        </Link>
        <span className="text-base text-[#8b949e]">Today</span>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <div className="w-full max-w-md mx-auto">{children}</div>
      </main>
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="border border-[#30363d] bg-[#161b22] p-5 flex flex-col gap-3">
      <p className="text-lg text-[#f0f6fc]">{title}</p>
      <p className="text-base text-[#b0b9c2]">{text}</p>
      <Link
        href="/today"
        className="self-start min-h-[44px] flex items-center text-base border border-[#30363d] hover:border-[#6e7681] px-4 py-2 text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
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
  const chosenMoods = parseMoods(params.moods);
  // 2 to 12, or null for no limit (U53).
  const hours = todayHoursFrom(params.hours);
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
          <h1 className="text-2xl text-[#f0f6fc] mb-2">What is in range today?</h1>
          <p className="text-base text-[#8b949e]">No destination needed. Where you are, how long you have, what you like.</p>
        </div>
        <TodayStart initialHours={hours} initialMoods={chosenMoods} carry={carry} deadlineText={deadlineText} />
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

  // The car's answer (U53, John 2026-11-14): between towns, from the point
  // itself; past the drive graph on a long day, by estimate.
  const plan = planToday(origin, hours ?? Infinity, { betweenTowns: true, beyondGraph: true });
  // Between towns the nearest town is not where you are, so it never names you.
  const whereLabel = placeNameFrom(params.name, plan.here && plan.reach !== "between" ? plan.here.city.name : "Your location");
  // Mid-sentence, after "From".
  const fromWords = whereLabel === "Your location" ? "your location" : whereLabel;

  if (plan.reach === "no-city") {
    return (
      <Shell>
        <Notice
          title="Not near a city we know"
          text="We know no city within 650 km of that point, so we cannot say what is in range from here. Type the nearest city instead."
        />
      </Shell>
    );
  }
  if (plan.reach === "no-graph") {
    return (
      <Shell>
        <Notice
          title={`No drive times from ${plan.here?.city.name ?? "this city"}`}
          text="We know the city but not the drives out of it yet. Type a nearby city instead."
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
  const groups = buildRankedGroupsWith(fetchResult, waypointProfileForMoods(chosenMoods));
  const oneWay = new Map(plan.reachable.map((r) => [r.city.id, r.oneWayDriveMinutes]));
  const cityById = new Map(plan.reachable.map((r) => [r.city.id, r.city]));
  // A straight-line estimate (between towns, or past the drive graph) reads "about" (U53).
  const estimated = new Set(plan.reachable.filter((r) => r.estimated).map((r) => r.city.id));

  // The feasibility line, per city, when there is a deadline: how long you
  // can stay there and still make the destination. Minutes on to the
  // destination come from the graph when the pair exists; otherwise from the
  // graph's median pace over the straight line, and the sentence says so.
  const destCity = deadline ? (snapToCity(deadline.point)?.city ?? null) : null;
  const daysToDeadline = deadline ? daysUntil(deadline.endDate, todayIso()) : 0;
  const pace = deadline ? driveGraphPaceMinutesPerKm() : 0;
  const feasibilityFor = (cityId: string): string | null => {
    if (!deadline) return null;
    // No limit has no daily budget to count driving days by, so no line (U53).
    // The sign check stays where the budget is used, since maxNights throws
    // on zero; todayHoursFrom only returns 2 to 12 or null.
    if (hours === null || !(hours > 0)) return null;
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
  const anyEstimated = groups.some((g) => estimated.has(g.cityId));
  // "within 5 hours", or with no limit no count at all: it would be every
  // town in the atlas, abroad included (U53).
  const within = hours === null ? null : `within ${hours} hours`;

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl text-[#f0f6fc] mb-1">
          {within === null ? "The nearest cities, no time limit" : total === 0 ? `Nothing ${within}` : `${total} ${total === 1 ? "city" : "cities"} ${within}`}
        </h1>
        <p className="text-base text-[#8b949e]">
          From {fromWords}
          {/* Same 3 km as the "Near <city>" label, imported so it cannot drift:
              inside it you are in the city; beyond it, say how far. The
              boundary is pinned at exactly 3.0 by locate.test.ts. */}
          {plan.here && plan.here.distanceKm > NEAR_THRESHOLD_KM ? `, ${Math.round(plan.here.distanceKm)} km from ${plan.here.city.name}` : ""}
          . Drive times are one way.
          {anyEstimated ? ' Times that say "about" are estimates by straight line.' : ""}
        </p>
        {deadline && deadlineText && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-base text-[#f0f6fc]" role="status">{deadlineText}</p>
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
              className="self-start min-h-[44px] flex items-center text-base text-[#8b949e] underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
            >
              {`Plan the trip to ${deadline.toName} from here`}
            </Link>
          </div>
        )}
        {spotsDegraded && (
          <p className="mt-2 text-base text-[#ff7b72]" role="status">
            The cities are right, but some spots could not be loaded just now.
          </p>
        )}
      </div>

      {/* The one mood component (Gauntlet U5) behind the results' wiring:
          a tap changes the URL's mood. */}
      <div className="mb-5">
        <TodayMoodChips chosen={chosenMoods} />
      </div>

      {total === 0 ? (
        <Notice title="Try more hours" text={`No city we know is ${within ?? "in reach"} of ${fromWords}.`} />
      ) : (
        <ol className="flex flex-col gap-4" aria-label={within === null ? "The nearest cities" : `Cities ${within}, nearest first`}>
          {groups.map((g) => (
            <li key={g.cityId} className="border border-[#30363d] bg-[#161b22] p-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                {/* A name wraps; it is never cut with an ellipsis (rule 2). */}
                <h2 className="text-lg text-[#f0f6fc] min-w-0 break-words">
                  {g.cityName}
                  {/* Across a border from here (U52): said beside the name. */}
                  {(() => {
                    const abroad = abroadLabel(cityById.get(g.cityId)?.country, plan.here?.city.country);
                    return abroad ? <span data-abroad className="ml-1 text-base text-[#8b949e] whitespace-nowrap">· {abroad}</span> : null;
                  })()}
                </h2>
                {/* A drive time, said as a phrase; the number is the one
                    thing in the mono face, "away" is in the body face
                    (quality bar, rule 2; Gauntlet U2, round 3). */}
                <span className="text-base text-[#8b949e] whitespace-nowrap" data-drive>
                  {(() => {
                    const m = oneWay.get(g.cityId) ?? g.detourMinutes / 2;
                    return estimated.has(g.cityId) ? <>about <span className="num">{formatDrive(aboutMinutes(m))}</span></> : <span className="num">{formatDrive(m)}</span>;
                  })()} away
                </span>
              </div>
              {/* The way out of this screen into the trip planner: start and
                  end filled in, so "five hours, Albuquerque looks good" is one
                  tap from a route. Every group comes from plan.reachable, so
                  the lookup cannot miss; if it ever did, no link is better
                  than a link to the equator. */}
              {(() => {
                const verdict = feasibilityFor(g.cityId);
                return verdict ? <p className="text-base text-[#f0f6fc] mb-2">{verdict}</p> : null;
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
                    className="inline-flex items-center min-h-[44px] mb-1 text-base text-[#8b949e] underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
                  >
                    Plan a trip here
                  </Link>
                );
              })()}
              {g.rows.length === 0 ? (
                <p className="text-base text-[#8b949e]">
                  {spotsDegraded ? "Spots did not load." : "Nothing here for this mood yet."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {g.rows.map((w) => (
                    <li key={w.waypointId} className="flex flex-col gap-0.5 text-base" data-spot>
                      <div className="flex items-baseline justify-between gap-3">
                        {/* A place's name wraps; it is never cut (rule 2). */}
                        <span className="text-[#f0f6fc] min-w-0 break-words">{w.name}</span>
                        <span className="text-base text-[#8b949e] whitespace-nowrap" data-kind>{kindWord(w.type)}</span>
                      </div>
                      {/* The reason to stop. Untrusted text, rendered as text; React escapes it. */}
                      {/* It wraps whole: the longest description in the atlas is 234 characters, about five lines here, and a painted ellipsis is a cut (quality bar, rule 2). */}
                      {w.description && <p className="text-base text-[#b0b9c2]" data-reason>{w.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-5 text-base text-[#8b949e]">
        {within === null ? `Showing the nearest ${shown}. ` : shown < total ? `Showing the nearest ${shown} of ${total}. ` : ""}
        <Link href={`/today?${new URLSearchParams({ hours: hoursParam(hours), ...(chosenMoods.length > 0 ? { [MOODS_PARAM]: chosenMoods.join(",") } : {}), ...(carry ?? {}) }).toString()}`} className="underline hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none">
          Change where or how long
        </Link>
      </p>
    </Shell>
  );
}
