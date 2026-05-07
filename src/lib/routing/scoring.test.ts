import { describe, it, expect } from "vitest";
import {
  tierForType,
  scoreWaypoint,
  scoreNeighborhood,
  buildRankedGroups,
  TOP_WAYPOINTS_PER_CITY,
  typeWeight,
} from "./scoring";
import { PERSONAS } from "@/lib/personas";
import type { LiteWaypoint, WaypointFetchResult } from "./scoring";

const outdoorsman = PERSONAS.outdoorsman;
const foodie = PERSONAS.foodie;

const makeWaypoint = (overrides: Partial<LiteWaypoint> = {}): LiteWaypoint => ({
  id: "wp-1",
  cityId: "las-vegas",
  name: "Test Spot",
  type: "nature",
  trendingScore: 80,
  neighborhoodId: null,
  ...overrides,
});

describe("tierForType", () => {
  it("returns primary for a primary type", () => {
    expect(tierForType("nature", outdoorsman)).toBe("primary");
  });

  it("returns secondary for a secondary type", () => {
    expect(tierForType("landmark", outdoorsman)).toBe("secondary");
  });

  it("returns other for an unmatched type", () => {
    expect(tierForType("nightlife", outdoorsman)).toBe("other");
  });
});

describe("scoreWaypoint", () => {
  it("applies type weight and vibe bonus correctly for a primary-vibe match", () => {
    // nature is primary (weight 1.0), FLUID_TROPIC is preferred (bonus 1.2)
    // score = 80 * 1.0 * 1.2 / 10 = 9.6
    const { score, tier } = scoreWaypoint(
      makeWaypoint({ trendingScore: 80, type: "nature" }),
      "FLUID_TROPIC",
      outdoorsman,
      10
    );
    expect(score).toBeCloseTo(9.6);
    expect(tier).toBe("primary");
  });

  it("clamps detour to 5 minutes minimum", () => {
    // detour 1 min → clamped to 5
    const { score: clamped } = scoreWaypoint(
      makeWaypoint({ trendingScore: 50, type: "nature" }),
      null,
      outdoorsman,
      1
    );
    const { score: atMin } = scoreWaypoint(
      makeWaypoint({ trendingScore: 50, type: "nature" }),
      null,
      outdoorsman,
      5
    );
    expect(clamped).toBeCloseTo(atMin);
  });

  it("returns lower score for other-tier type", () => {
    const { score: primary } = scoreWaypoint(makeWaypoint({ type: "nature" }), null, outdoorsman, 10);
    const { score: other } = scoreWaypoint(makeWaypoint({ type: "nightlife" }), null, outdoorsman, 10);
    expect(primary).toBeGreaterThan(other);
  });

  it("applies no vibe bonus for non-preferred vibe", () => {
    // NEON_GRID is not in outdoorsman.preferredVibes
    const { score: noBonus } = scoreWaypoint(makeWaypoint({ trendingScore: 80 }), "NEON_GRID", outdoorsman, 10);
    const { score: withBonus } = scoreWaypoint(makeWaypoint({ trendingScore: 80 }), "FLUID_TROPIC", outdoorsman, 10);
    expect(withBonus).toBeCloseTo(noBonus * 1.2);
  });

  it("returns 1.0 vibe multiplier for null vibeClass", () => {
    const { score: nullVibe } = scoreWaypoint(makeWaypoint({ trendingScore: 60, type: "food" }), null, foodie, 10);
    // food is primary for foodie (weight 1.0), no vibe bonus (1.0)
    expect(nullVibe).toBeCloseTo(60 * 1.0 * 1.0 / 10);
  });
});

describe("buildRankedGroups", () => {
  const makeFreshResult = (
    cities: WaypointFetchResult["cities"],
    waypoints: LiteWaypoint[]
  ): WaypointFetchResult => ({
    status: "fresh",
    cities,
    waypoints,
    neighborhoods: {},
  });

  it("sorts cities by detour ascending", () => {
    const result = makeFreshResult(
      [
        { id: "far", name: "Far City", vibeClass: null, detourMinutes: 30, lat: 0, lng: 0 },
        { id: "near", name: "Near City", vibeClass: null, detourMinutes: 5, lat: 0, lng: 0 },
      ],
      [makeWaypoint({ cityId: "far" }), makeWaypoint({ id: "wp-2", cityId: "near" })]
    );
    const groups = buildRankedGroups(result, "outdoorsman");
    expect(groups[0].cityId).toBe("near");
    expect(groups[1].cityId).toBe("far");
  });

  it("caps waypoints per city at TOP_WAYPOINTS_PER_CITY", () => {
    const waypoints = Array.from({ length: TOP_WAYPOINTS_PER_CITY + 3 }, (_, i) =>
      makeWaypoint({ id: `wp-${i}`, trendingScore: i * 10 })
    );
    const result = makeFreshResult(
      [{ id: "las-vegas", name: "Las Vegas", vibeClass: null, detourMinutes: 10, lat: 0, lng: 0 }],
      waypoints
    );
    const groups = buildRankedGroups(result, "outdoorsman");
    expect(groups[0].rows.length).toBe(TOP_WAYPOINTS_PER_CITY);
  });

  it("returns an empty rows array for a city with no waypoints", () => {
    const result = makeFreshResult(
      [{ id: "empty-city", name: "Empty", vibeClass: null, detourMinutes: 10, lat: 0, lng: 0 }],
      []
    );
    const groups = buildRankedGroups(result, "outdoorsman");
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(0);
  });

  it("falls back to default persona for unknown personaId", () => {
    const result = makeFreshResult(
      [{ id: "las-vegas", name: "Las Vegas", vibeClass: null, detourMinutes: 10, lat: 0, lng: 0 }],
      [makeWaypoint()]
    );
    expect(() => buildRankedGroups(result, "unknown-persona-xyz")).not.toThrow();
  });
});

describe("scoreNeighborhood", () => {
  it("uses floor weight when no waypoints are present", () => {
    // floor = typeWeight("other") = 0.2
    expect(scoreNeighborhood(100, [], outdoorsman)).toBeCloseTo(100 * 0.2);
  });

  it("uses primary weight for a primary-type waypoint", () => {
    // nature is primary for outdoorsman → weight 1.0
    expect(scoreNeighborhood(80, [makeWaypoint({ type: "nature" })], outdoorsman)).toBeCloseTo(80 * 1.0);
  });

  it("uses secondary weight for a secondary-type waypoint", () => {
    // landmark is secondary for outdoorsman → weight 0.5
    expect(scoreNeighborhood(60, [makeWaypoint({ type: "landmark" })], outdoorsman)).toBeCloseTo(60 * 0.5);
  });

  it("takes the best weight from a mixed set of waypoints", () => {
    // primary (nature, 1.0) beats secondary (landmark, 0.5) and other (nightlife, 0.2)
    const waypoints = [
      makeWaypoint({ id: "a", type: "nightlife" }),
      makeWaypoint({ id: "b", type: "landmark" }),
      makeWaypoint({ id: "c", type: "nature" }),
    ];
    expect(scoreNeighborhood(50, waypoints, outdoorsman)).toBeCloseTo(50 * 1.0);
  });

  it("changes ranking order when persona changes", () => {
    // outdoorsman: nature=primary(1.0), food=other(0.2)
    // foodie: food=primary(1.0), nature=secondary(0.5)
    const natureWaypoint = [makeWaypoint({ type: "nature" })];
    const foodWaypoint = [makeWaypoint({ type: "food" })];
    const trendingScore = 100;

    const outdoorsmanNature = scoreNeighborhood(trendingScore, natureWaypoint, outdoorsman);
    const outdoorsmanFood = scoreNeighborhood(trendingScore, foodWaypoint, outdoorsman);
    expect(outdoorsmanNature).toBeGreaterThan(outdoorsmanFood);

    const foodieNature = scoreNeighborhood(trendingScore, natureWaypoint, foodie);
    const foodieFood = scoreNeighborhood(trendingScore, foodWaypoint, foodie);
    expect(foodieFood).toBeGreaterThan(foodieNature);
  });
});
