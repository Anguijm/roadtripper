import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { offeredTowns, onlyOffered } from "../detours";
import { waypointCities, cityContextFor } from "@/lib/routing/recommend";
import { buildRankedGroupsWith } from "@/lib/routing/scoring";
import { getPersona } from "@/lib/personas";
import { spareDays, SPARE_DAYS_FOR_DETOURS } from "../trip-state";
import { makesProgress, isOutOfTheWay, MAX_DETOUR_RATIO_WITH_SLACK } from "@/lib/routing/progress";
import { tagOutOfTheWay } from "@/lib/routing/radial";
import type { CityContext } from "@/lib/routing/scoring";

const city = (id: string, outOfTheWay?: boolean): CityContext => ({ id, name: id, vibeClass: null, detourMinutes: 60, lat: 0, lng: 0, ...(outOfTheWay ? { outOfTheWay } : {}) });
const fetch = (cities: CityContext[]) => ({ status: "fresh" as const, cities, waypoints: cities.map((c) => ({ cityId: c.id })), neighborhoods: {} });

describe("towns out of the way, with a day to spare (U21)", () => {
  const atlas = new Database("data/atlas.sqlite", { readonly: true });
  const byId = (id: string) => atlas.prepare("select lat, lng from cities where id = ?").get(id) as { lat: number; lng: number };
  const amarillo = byId("amarillo"), austin = byId("austin");

  it("tags Oklahoma City out of the way on Amarillo to Austin and lets the slack limit in, but never a town behind", () => {
    const okc = byId("oklahoma-city");
    expect(makesProgress(okc, amarillo, austin)).toBe(false);
    expect(makesProgress(okc, amarillo, austin, MAX_DETOUR_RATIO_WITH_SLACK)).toBe(true);
    expect(isOutOfTheWay(okc, amarillo, austin)).toBe(true);
    expect(isOutOfTheWay(byId("lubbock-tx"), amarillo, austin)).toBe(false);
    // West to go east: Albuquerque and El Paso are never ahead, whatever the ratio.
    for (const id of ["albuquerque", "el-paso-tx"]) expect(makesProgress(byId(id), amarillo, austin, 99)).toBe(false);
  });

  it("marks exactly the candidates past the on-the-way limit", () => {
    const cs = [{ city: { id: "oklahoma-city", ...byId("oklahoma-city") }, oneWayDriveMinutes: 250 }, { city: { id: "lubbock-tx", ...byId("lubbock-tx") }, oneWayDriveMinutes: 100 }];
    const tagged = tagOutOfTheWay(cs as never, amarillo, austin);
    expect(tagged.map((c) => !!c.outOfTheWay)).toEqual([true, false]);
  });

  it("offers an out-of-the-way town only with room, after every town on the way, with its places", () => {
    const f = fetch([city("okc", true), city("lubbock"), city("abilene")]);
    const tight = offeredTowns(f, false);
    expect(tight.cities.map((c) => c.id)).toEqual(["lubbock", "abilene"]);
    expect(tight.waypoints.map((w) => w.cityId)).toEqual(["lubbock", "abilene"]);
    expect(offeredTowns(f, true).cities.map((c) => c.id)).toEqual(["lubbock", "abilene", "okc"]);
    // Nothing out of the way, nothing changes: the same object back.
    const plain = fetch([city("a"), city("b")]);
    expect(offeredTowns(plain, false)).toBe(plain);
  });

  it("counts the spare days as the deadline does, and none for an undated trip", () => {
    // 7 h 45 min at 4 h a day needs 2 days.
    expect(spareDays([], 5, 4, 465)).toBe(3);
    expect(spareDays([], 2, 4, 465)).toBe(0);
    expect(spareDays([], 1, 4, 465)).toBe(0); // never below zero
    expect(spareDays([], null, 4, 465)).toBeNull();
    // A stop 1 h 40 min out uses a day (an overnight), and the 6 h 5 min left needs two more.
    expect(spareDays([{ originCityId: "__origin__", destinationCityId: "lubbock-tx", durationSeconds: 100 * 60, distanceMeters: 1 }], 5, 4, 365)).toBe(2);
    expect(SPARE_DAYS_FOR_DETOURS).toBe(1);
  });

  it("lists a town out of the way after every town on the way, however near it is", () => {
    const f = fetch([{ ...city("okc", true), detourMinutes: 30 }, { ...city("lubbock"), detourMinutes: 200 }]);
    const groups = buildRankedGroupsWith(f as never, getPersona(undefined));
    expect(groups.map((g) => [g.cityId, !!g.outOfTheWay])).toEqual([["lubbock", false], ["okc", true]]);
  });

  it("draws only the offered towns on the map", () => {
    const markers = [{ id: "okc" }, { id: "lubbock" }];
    expect(onlyOffered(markers, { cities: [{ id: "lubbock" }] }).map((m) => m.id)).toEqual(["lubbock"]);
  });

  it("fetches places for the towns on the way first, so one out of the way never takes a slot", () => {
    const cand = (id: string, minutes: number, outOfTheWay?: boolean) => ({ city: { id, name: id, lat: 0, lng: 0 }, oneWayDriveMinutes: minutes, ...(outOfTheWay ? { outOfTheWay } : {}) });
    const cs = [cand("okc", 10, true), ...Array.from({ length: 10 }, (_, i) => cand(`t${i}`, 20 + i))];
    const picked = waypointCities(cs as never).map((c) => c.city.id);
    expect(picked).toHaveLength(10);
    expect(picked).not.toContain("okc");
    expect(cityContextFor(cs[0] as never).outOfTheWay).toBe(true);
    expect(cityContextFor(cs[1] as never).outOfTheWay).toBeUndefined();
  });
});
