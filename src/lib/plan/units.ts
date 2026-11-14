/**
 * Distances as the driver reads them: miles when the trip starts in the
 * United States, kilometres anywhere else. John's choice, 2026-11-15
 * ("Miles in the US, km abroad"), after the U53 critic twice read "109 km
 * from Dayton" as not how a US driver talks.
 *
 * The start's country is the nearest atlas town's, as for the border label
 * (U52). With no town to read it from, miles: what the app has always shown
 * on /plan. The United Kingdom also signs its roads in miles; the choice as
 * made says km abroad, so a UK start reads km until John says otherwise.
 *
 * Pure and isomorphic, for the server pages and the client sheet alike.
 */
export type DistanceUnit = "mi" | "km";

/** The divisor the app has always used for miles (`formatDistance`, `roadsideAlongText`), kept so no shown figure moves. */
export const KM_PER_MILE = 1.60934;

export function unitFor(country: string | null | undefined): DistanceUnit {
  const c = (country ?? "").trim().toLowerCase();
  return c === "" || c === "united states" ? "mi" : "km";
}

/** Whole miles or whole km, from km. */
export function inUnit(km: number, unit: DistanceUnit): number {
  return Math.round(unit === "mi" ? km / KM_PER_MILE : km);
}

/** In a sentence: "68 miles", "1 mile", "109 km". */
export function distanceWords(km: number, unit: DistanceUnit): string {
  const n = inUnit(km, unit);
  if (unit === "km") return `${n} km`;
  return n === 1 ? "1 mile" : `${n} miles`;
}
