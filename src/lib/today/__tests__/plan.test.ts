import { describe, it, expect } from "vitest";
import { planToday, NEAREST_TOWN_MAX_KM } from "../plan";
import { allCities, driveGraphPaceMinutesPerKm, haversineKm, SNAP_RADIUS_KM } from "@/lib/atlas/queries";
import { formatDrive, hoursFrom, pointFrom, placeNameFrom, DEFAULT_HOURS, MAX_PLACE_NAME_LENGTH } from "../presets";

// Real atlas, real graph. These are the numbers the screen shows.
const DOWNTOWN_AMARILLO = { lat: 35.2073, lng: -101.8338 };
const MIDDLE_OF_THE_PACIFIC = { lat: 30.0, lng: -150.0 };
/** On I-75, 109 km from Dayton and 112 from Toledo: no atlas town within 40 km. */
const NEAR_LIMA_OHIO = { lat: 40.74, lng: -84.11 };
/** Out to sea east of Honolulu, the nearest atlas town: about 600 and 700 km. */
const HONOLULU_600_KM = { lat: 21.3, lng: -152.1 };
const HONOLULU_700_KM = { lat: 21.3, lng: -151.1 };

const names = (plan: ReturnType<typeof planToday>) => plan.reachable.map((r) => r.city.name);

describe("planToday", () => {
  it("answers five hours from Amarillo with the cities the graph puts in range, nearest first", () => {
    const plan = planToday(DOWNTOWN_AMARILLO, 5);
    expect(plan.reach).toBe("hit");
    expect(plan.here?.city.name).toMatch(/^Amarillo/);
    expect(plan.here?.distanceKm).toBeLessThan(5);

    const n = names(plan);
    expect(n.some((x) => x.startsWith("Albuquerque"))).toBe(true);
    expect(n.some((x) => x.startsWith("Lubbock"))).toBe(true);
    expect(n.some((x) => x.startsWith("Oklahoma City"))).toBe(true);
    expect(n.some((x) => x.startsWith("Denver"))).toBe(false);

    const mins = plan.reachable.map((r) => r.oneWayDriveMinutes);
    expect(Math.max(...mins)).toBeLessThanOrEqual(300);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });

  it("fewer hours is a subset of more hours", () => {
    const two = new Set(names(planToday(DOWNTOWN_AMARILLO, 2)));
    const five = new Set(names(planToday(DOWNTOWN_AMARILLO, 5)));
    expect(two.size).toBeLessThan(five.size);
    for (const c of two) expect(five.has(c)).toBe(true);
  });

  it("says no-city, not an empty answer, for a point with no atlas city near it", () => {
    const plan = planToday(MIDDLE_OF_THE_PACIFIC, 5);
    expect(plan.reach).toBe("no-city");
    expect(plan.here).toBeNull();
    expect(plan.reachable).toEqual([]);
  });

  it("rejects a budget that is not a positive number", () => {
    expect(() => planToday(DOWNTOWN_AMARILLO, 0)).toThrow(/positive/);
    expect(() => planToday(DOWNTOWN_AMARILLO, NaN)).toThrow(/positive/);
  });
});

describe("planToday between towns (the car's request, 2026-11-14)", () => {
  it("keeps the /today page's no-city when betweenTowns is not asked", () => {
    expect(planToday(NEAR_LIMA_OHIO, 4).reach).toBe("no-city");
  });

  it("stands at the nearest town and measures every town today covers from the point itself", () => {
    const plan = planToday(NEAR_LIMA_OHIO, 4, { betweenTowns: true });
    expect(plan.reach).toBe("between");
    expect(plan.here?.city.id).toBe("dayton");
    expect(plan.here?.distanceKm).toBeGreaterThan(SNAP_RADIUS_KM);
    const pace = driveGraphPaceMinutesPerKm();
    // Every town within four hours by the estimate, and only those: not the
    // graph's neighbours of Dayton, which is 80 minutes away.
    const expected = allCities().filter((c) => haversineKm(NEAR_LIMA_OHIO, c) * pace <= 240).map((c) => c.id).sort();
    expect(plan.reachable.map((r) => r.city.id).sort()).toEqual(expected);
    for (const r of plan.reachable) expect(r.oneWayDriveMinutes).toBeCloseTo(haversineKm(NEAR_LIMA_OHIO, r.city) * pace, 6);
    const mins = plan.reachable.map((r) => r.oneWayDriveMinutes);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    // You are not in Dayton, so it is a town in the list, the nearest.
    expect(plan.reachable.slice(0, 2).map((r) => r.city.id)).toEqual(["dayton", "toledo-oh"]);
  });

  it("changes nothing within 40 km of a town", () => {
    expect(planToday(DOWNTOWN_AMARILLO, 5, { betweenTowns: true })).toEqual(planToday(DOWNTOWN_AMARILLO, 5));
  });

  it("says no-city only past 650 km from every town", () => {
    expect(NEAREST_TOWN_MAX_KM).toBe(650);
    expect(planToday(HONOLULU_600_KM, 5, { betweenTowns: true })).toMatchObject({ reach: "between", here: { city: { id: "honolulu" } }, reachable: [] });
    expect(planToday(HONOLULU_700_KM, 8, { betweenTowns: true })).toMatchObject({ reach: "no-city", here: null, reachable: [] });
    expect(planToday(MIDDLE_OF_THE_PACIFIC, 8, { betweenTowns: true }).reach).toBe("no-city");
  });
});

describe("presets", () => {
  it("formats one-way drive time the way people say it", () => {
    expect(formatDrive(45)).toBe("45 min");
    expect(formatDrive(120)).toBe("2 h");
    expect(formatDrive(130.4)).toBe("2 h 10 min");
    expect(formatDrive(225)).toBe("3 h 45 min");
    expect(formatDrive(-3)).toBe("0 min");
  });

  it("reads a point from two URL strings and treats blank as missing, not Null Island", () => {
    expect(pointFrom("35.2", "-101.8")).toEqual({ lat: 35.2, lng: -101.8 });
    expect(pointFrom("0", "0")).toEqual({ lat: 0, lng: 0 });   // explicit zeros are a real point
    expect(pointFrom("", "")).toBeNull();                        // Number("") is 0; must not become (0,0)
    expect(pointFrom(" ", "-101.8")).toBeNull();
    expect(pointFrom(undefined, "-101.8")).toBeNull();
    expect(pointFrom("abc", "-101.8")).toBeNull();
    expect(pointFrom("95", "0")).toBeNull();
    expect(pointFrom("0", "181")).toBeNull();
    expect(pointFrom("Infinity", "0")).toBeNull();
  });

  it("bounds a place name and falls back when it is blank", () => {
    expect(placeNameFrom("  Near Amarillo ", "x")).toBe("Near Amarillo");
    expect(placeNameFrom("", "Your location")).toBe("Your location");
    expect(placeNameFrom(undefined, "Start")).toBe("Start");
    expect(placeNameFrom("y".repeat(200), "x")).toHaveLength(MAX_PLACE_NAME_LENGTH);
  });

  it("reads hours from the URL and falls back to five for anything else", () => {
    expect(hoursFrom("3")).toBe(3);
    expect(hoursFrom(8)).toBe(8);
    for (const bad of ["7", "abc", "", undefined, null, -1, "5.5"]) expect(hoursFrom(bad)).toBe(DEFAULT_HOURS);
    expect(DEFAULT_HOURS).toBe(5);
  });
});
