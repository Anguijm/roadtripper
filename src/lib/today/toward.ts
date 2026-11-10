import "server-only";

import { planToday } from "@/lib/today/plan";
import { parseTodayQuery, rankedPlaces, waypointsOrDegraded, type TodayApiPlace } from "@/lib/today/api";
import { allCities, cityRadiiKm, driveGraphPaceMinutesPerKm, driveMinutesBetween, haversineKm, snapToCity, SNAP_RADIUS_KM } from "@/lib/atlas/queries";
import { roadsideToward } from "@/lib/roadside/store";
import type { RoadsideMarker } from "@/lib/roadside/along";
import { orderRoadside } from "@/lib/roadside/order";
import { answeredMood, type MoodId } from "@/lib/roadside/tags";
import { roadsideKindWord } from "@/lib/plan/words";
import { placeNameKey } from "@/lib/plan/days";
import { detourKm, estimateMinutes, inCone } from "@/lib/today/cone";
import type { RadialCandidate } from "@/lib/routing/radial";
import type { LatLng } from "@/lib/plan/types";
import type { City } from "@/lib/urban-explorer/types";

/**
 * GET /api/today/toward for the car app (docs/car-api.md, agreed with the
 * roadtripper-car session 2026-11-10): today's towns AND roadside stops in
 * the general direction of a destination, as one list ordered by the time it
 * takes to reach each from here.
 *
 * John's rulings the same day: the destination is typed on the phone (it
 * arrives as a point) or picked from the town list (an atlas id); the
 * direction is a rough cone with no Routes call (src/lib/today/cone.ts);
 * the car navigates to one stop at a time, keeping the stops by id.
 *
 * Atlas and roadside store reads only: no paid call of any kind. Towns' times
 * come from the drive graph; everything else is straight-line km at the
 * graph's median pace, and says so (`estimated`).
 */
export const TOWARD_API_VERSION = 1;

/**
 * Towns and roadside stops chosen before the merge, and the cap after it.
 * The car's host shows about six rows and the phone all of them; the car
 * session asked for 12 to 15 and a small body (an answer is about 12 to 22
 * KB). Eight of each keeps a mix when one kind is plentiful; 8 + 8 + the
 * destination is 17, so the cap of 15 drops the two farthest. Towns are
 * also bounded by the places pipeline, which reads at most
 * MAX_WAYPOINT_CITIES (10) towns: MAX_TOWN_ROWS + 1 must stay within it.
 * Raising any of these: re-check the body size and the tests in
 * src/lib/today/__tests__/toward.test.ts.
 */
export const MAX_TOWN_ROWS = 8;
export const MAX_STOP_ROWS = 8;
export const MAX_ROWS = 15;
/**
 * Within this of the destination you have arrived. A metro's own radius in
 * the atlas is 25 km and a town's 10, so 15 km is "in town" for most places
 * without calling the suburbs of a big city arrival; the same town on both
 * ends counts too. The car then asks /api/today for the town's own list.
 * Tested in toward.test.ts ("says arrived within 15 km").
 */
export const ARRIVED_KM = 15;
/** A town without its own radius in the registry is matched within this. */
const DEFAULT_TOWN_RADIUS_KM = 10;

type Here = { cityId: string; name: string; lat: number; lng: number; distanceKm: number; country: string };

export interface TowardDestination {
  /** The atlas town the destination is, or null for a place the atlas does not have. */
  cityId: string | null;
  name: string | null;
  /** The point asked for (a typed place), or the town's centre when picked by id. */
  lat: number;
  lng: number;
  country: string | null;
  /** One way from here: the drive graph when both ends are atlas towns with a stored pair, else an estimate. */
  driveMinutes: number;
  estimated: boolean;
  /** Whether today's hours reach it. */
  withinToday: boolean;
}

interface RowBase {
  /** Unique across types: an atlas city id, or an OSM id ("osm:node:..."), which atlas ids never resemble. */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** From here, whole minutes: the drive graph for a town, an estimate for a stop. */
  reachMinutes: number;
  estimated: boolean;
  /** Extra minutes against heading straight to the destination. Always an estimate. */
  detourMinutes: number;
  kind: string;
  /** Plain text or null. Untrusted model or encyclopedia text: render as text. */
  line: string | null;
  badge: "pick" | "good" | null;
  country: string | null;
  /** The nearest atlas town's name for a roadside stop, within the atlas's snap radius; null for a town. */
  near: string | null;
  isDestination: boolean;
}

export type TowardRow = (RowBase & { type: "town"; places: TodayApiPlace[] }) | (RowBase & { type: "stop" });

export type TowardApiResponse =
  | {
      version: 1;
      status: "ok";
      generatedAt: string;
      origin: LatLng;
      here: Here;
      hours: number;
      moods: MoodId[];
      destination: TowardDestination;
      placesComplete: boolean;
      stops: TowardRow[];
    }
  | { version: 1; status: "arrived"; generatedAt: string; here: Here; hours: number; moods: MoodId[]; destination: TowardDestination }
  | { version: 1; status: "no-city"; generatedAt: string }
  | { version: 1; status: "no-graph"; generatedAt: string; here: Here }
  | { version: 1; status: "unknown-destination"; message: string }
  | { version: 1; status: "bad-request"; message: string }
  | { version: 1; status: "rate-limited"; retryAfterSeconds: number }
  | { version: 1; status: "error"; message: string };

export type TowardTarget = { kind: "city"; id: string } | { kind: "point"; at: LatLng };

export type TowardQuery =
  | { ok: true; origin: LatLng; hours: number; moods: MoodId[]; to: TowardTarget }
  | { ok: false; message: string };

const CITY_ID = /^[a-z0-9-]{1,80}$/;

/**
 * /api/today's query (lat, lng, hours, moods, same rules), plus exactly one
 * destination: `to=<atlas town id>`, or `toLat` and `toLng`. Both, or
 * neither, is a 400.
 */
export function parseTowardQuery(q: URLSearchParams): TowardQuery {
  const base = parseTodayQuery(q);
  if (!base.ok) return base;
  const to = (q.get("to") ?? "").trim();
  const toLatRaw = (q.get("toLat") ?? "").trim();
  const toLngRaw = (q.get("toLng") ?? "").trim();
  const hasPoint = toLatRaw !== "" || toLngRaw !== "";
  if (to !== "" && hasPoint) return { ok: false, message: "give either to, or toLat and toLng, not both" };
  if (to !== "") {
    if (!CITY_ID.test(to)) return { ok: false, message: "to must be an atlas town id from /api/today/towns" };
    return { ...base, to: { kind: "city", id: to } };
  }
  if (!hasPoint) return { ok: false, message: "a destination is required: to=<atlas town id>, or toLat and toLng" };
  const lat = Number(toLatRaw);
  const lng = Number(toLngRaw);
  if (toLatRaw === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, message: "toLat must be a number between -90 and 90" };
  if (toLngRaw === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, message: "toLng must be a number between -180 and 180" };
  return { ...base, to: { kind: "point", at: { lat, lng } } };
}

/**
 * The atlas town a typed point is: the nearest town whose own radius holds
 * it (25 km for a metro, 10 a town, 3 a village), or none.
 */
export function townAt(point: LatLng, cities: readonly City[] = allCities(), radii: ReadonlyMap<string, number> = cityRadiiKm()): City | null {
  let best: { city: City; km: number } | null = null;
  for (const c of cities) {
    const km = haversineKm(point, c);
    if (km <= (radii.get(c.id) ?? DEFAULT_TOWN_RADIUS_KM) && (!best || km < best.km)) best = { city: c, km };
  }
  return best?.city ?? null;
}

/** The answer for a parsed query; `now` is injectable for tests. */
export async function towardAnswer(origin: LatLng, to: TowardTarget, hours: number, moods: MoodId[], now: Date = new Date()): Promise<TowardApiResponse> {
  const generatedAt = now.toISOString();
  const cities = allCities();

  let destCity: City | null;
  let destAt: LatLng;
  if (to.kind === "city") {
    destCity = cities.find((c) => c.id === to.id) ?? null;
    if (!destCity) return { version: 1, status: "unknown-destination", message: `no atlas town with id "${to.id}"; the ids are in /api/today/towns` };
    destAt = { lat: destCity.lat, lng: destCity.lng };
  } else {
    destCity = townAt(to.at, cities);
    destAt = to.at;
  }

  const plan = planToday(origin, hours);
  if (plan.reach === "no-city" || !plan.here) return { version: 1, status: "no-city", generatedAt };
  const here: Here = {
    cityId: plan.here.city.id,
    name: plan.here.city.name,
    lat: plan.here.city.lat,
    lng: plan.here.city.lng,
    distanceKm: Math.round(plan.here.distanceKm * 10) / 10,
    country: plan.here.city.country,
  };
  if (plan.reach === "no-graph") return { version: 1, status: "no-graph", generatedAt, here };

  const pace = driveGraphPaceMinutesPerKm();
  const graphMinutes = destCity ? driveMinutesBetween(here.cityId, destCity.id) : null;
  const driveMinutes = graphMinutes !== null ? Math.round(graphMinutes) : estimateMinutes(haversineKm(origin, destAt), pace);
  const destination: TowardDestination = {
    cityId: destCity?.id ?? null,
    name: destCity?.name ?? null,
    lat: destAt.lat,
    lng: destAt.lng,
    country: destCity ? destCity.country || null : null,
    driveMinutes,
    estimated: graphMinutes === null,
    withinToday: driveMinutes <= hours * 60,
  };

  if (haversineKm(origin, destAt) <= ARRIVED_KM || (destCity !== null && destCity.id === here.cityId)) {
    return { version: 1, status: "arrived", generatedAt, here, hours, moods, destination };
  }

  // Towns: today's reach from the drive graph, in the cone, never here and
  // never the destination itself, which has its own row. The most on-the-way
  // are chosen (least detour), then shown by time: choosing the nearest let
  // wide early detours crowd out towns on the road further down (Cleveland
  // and Akron over Cincinnati, toward Mammoth Cave, on the first run).
  const towns = plan.reachable
    .filter((r) => r.city.id !== here.cityId && r.city.id !== destCity?.id && inCone(origin, destAt, r.city))
    .map((r) => ({ r, detour: detourKm(origin, destAt, r.city) }))
    .sort((a, b) => a.detour - b.detour || a.r.oneWayDriveMinutes - b.r.oneWayDriveMinutes)
    .slice(0, MAX_TOWN_ROWS)
    .map((x) => x.r);
  const destRow: RadialCandidate | null =
    destCity && destination.withinToday ? { city: destCity, oneWayDriveMinutes: driveMinutes } : null;
  const candidates = destRow ? [...towns, destRow] : towns;

  const fetchResult = await waypointsOrDegraded(candidates, "[api/today/toward]");
  const placesByTown = rankedPlaces(fetchResult, moods);

  const townRows: TowardRow[] = candidates.map((r) => ({
    type: "town",
    id: r.city.id,
    name: r.city.name,
    lat: r.city.lat,
    lng: r.city.lng,
    reachMinutes: Math.round(r.oneWayDriveMinutes),
    estimated: r === destRow ? destination.estimated : false,
    detourMinutes: estimateMinutes(detourKm(origin, destAt, r.city), pace),
    kind: "Town",
    line: null,
    badge: null,
    country: r.city.country || null,
    near: null,
    isDestination: r === destRow,
    places: placesByTown.get(r.city.id)?.places ?? [],
  }));

  // Roadside stops: in the cone and within the km today's hours cover at the
  // graph's pace, chosen by pickStops.
  const named = new Set(townRows.flatMap((t) => (t.type === "town" ? t.places.map((p) => placeNameKey(p.name)) : [])));
  const stopRows: TowardRow[] = [];
  for (const s of pickStops(roadsideToward(origin, destAt, (hours * 60) / pace), moods, named)) {
    stopRows.push({
      type: "stop",
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      reachMinutes: estimateMinutes(s.alongKm, pace),
      estimated: true,
      detourMinutes: estimateMinutes(detourKm(origin, destAt, s), pace),
      kind: roadsideKindWord(s.kind),
      line: s.about,
      badge: moods.length > 0 && answeredMood(s.scores, moods) !== null ? "good" : null,
      country: null,
      near: snapToCity(s, SNAP_RADIUS_KM)?.city.name ?? null,
      isDestination: false,
    });
  }

  // One list by time from here; past the cap, the farthest go first, never
  // the destination's own row.
  const rows = [...townRows, ...stopRows].sort(
    (a, b) => a.reachMinutes - b.reachMinutes || (a.type === b.type ? 0 : a.type === "town" ? -1 : 1) || a.name.localeCompare(b.name, "en")
  );
  while (rows.length > MAX_ROWS) {
    const last = rows.map((r) => r.isDestination).lastIndexOf(false);
    // At most one row is the destination, so a row that is not exists
    // whenever the cap is passed; the guard keeps a future change from
    // splicing at -1, which would drop the last row, the destination.
    if (last < 0) break;
    rows.splice(last, 1);
  }

  return {
    version: 1,
    status: "ok",
    generatedAt,
    origin,
    here,
    hours,
    moods,
    destination,
    placesComplete: fetchResult.status === "fresh",
    stops: rows,
  };
}

/**
 * Which roadside stops make the list. With a mood chosen, a stop that answers
 * none is left out (U50's rule for Along the way); then the strongest, as the
 * sheet ranks them (`orderRoadside` "best"). A stop named like a place already
 * in one of the answer's towns is that place and appears once, as the place;
 * two stops of one name appear once. At most `max`.
 */
export function pickStops(stops: readonly RoadsideMarker[], moods: readonly MoodId[], placeNames: ReadonlySet<string>, max: number = MAX_STOP_ROWS): RoadsideMarker[] {
  const kept = moods.length === 0 ? [...stops] : stops.filter((s) => answeredMood(s.scores, moods) !== null);
  const seen = new Set<string>();
  const out: RoadsideMarker[] = [];
  for (const s of orderRoadside(kept, [...moods], "best")) {
    if (out.length >= max) break;
    const key = placeNameKey(s.name);
    if (placeNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
