import { describe, it, expect } from "vitest";
import { orderRoadside } from "../order";
import type { RoadsideMarker } from "../along";

/**
 * Both orders the sort control offers (Gauntlet U6). Tested here rather
 * than through a render because the sheet's sort mode is client state: a
 * server render only ever shows "best", so an SSR test can never see the
 * other one switched on.
 */

const stop = (name: string, p: number, alongKm: number, scores?: RoadsideMarker["scores"]): RoadsideMarker =>
  ({ id: name, name, lat: 35, lng: -101, kind: "attraction", p, about: null, url: null, alongKm, scores }) as RoadsideMarker;

// General score runs one way, the road the other, so neither order is an accident.
const stadium = stop("The stadium", 0.6, 10, { sports_place: 0.99, famous_food: 0.01 });
const canyon = stop("The canyon", 0.7, 40, { big_view: 0.95 });
const diner = stop("The diner", 0.5, 80, { famous_food: 0.94, sports_place: 0.01 });
const all = [stadium, canyon, diner];
const names = (out: RoadsideMarker[]) => out.map((s) => s.name);

describe("the two orders the sheet offers", () => {
  it("best, with no mood chosen, is the general score, exactly as before U6", () => {
    expect(names(orderRoadside(all, [], "best"))).toEqual(["The canyon", "The stadium", "The diner"]);
  });

  it("best, under a mood, puts what answers it first", () => {
    expect(names(orderRoadside(all, ["food"], "best"))[0]).toBe("The diner");
    expect(names(orderRoadside(all, ["sports"], "best"))[0]).toBe("The stadium");
  });

  it("along the road is the order they come up, whatever the mood", () => {
    // The whole point of the second order: it must not be the first one
    // with a different name. Food puts the diner top in "best" and last
    // here, because it is the furthest along the road.
    expect(names(orderRoadside(all, ["food"], "along"))).toEqual(["The stadium", "The canyon", "The diner"]);
    expect(names(orderRoadside(all, [], "along"))).toEqual(["The stadium", "The canyon", "The diner"]);
    expect(names(orderRoadside(all, ["food", "sports"], "along"))).toEqual(["The stadium", "The canyon", "The diner"]);
  });

  it("switching the order actually changes the list", () => {
    expect(names(orderRoadside(all, ["food"], "best"))).not.toEqual(names(orderRoadside(all, ["food"], "along")));
  });

  it("orders two places that tie, rather than leaving them as they came", () => {
    // The Rose Bowl lesson, one layer up: a tie on the first key is broken
    // by the road and then by name, never by what the store returned.
    const a = stop("Bravo", 0.5, 20);
    const b = stop("Alpha", 0.5, 20);
    expect(names(orderRoadside([a, b], [], "best"))).toEqual(["Alpha", "Bravo"]);
    expect(names(orderRoadside([b, a], [], "best"))).toEqual(["Alpha", "Bravo"]);
    expect(names(orderRoadside([a, b], [], "along"))).toEqual(["Alpha", "Bravo"]);
    // Same first key, different road position: the road decides.
    const near = stop("Zulu", 0.5, 5);
    expect(names(orderRoadside([a, near], [], "best"))).toEqual(["Zulu", "Bravo"]);
  });

  it("never drops a place, in either order or under any mood", () => {
    for (const mode of ["best", "along"] as const) {
      for (const moods of [[], ["food"], ["machines"], ["food", "sports"]] as const) {
        expect(orderRoadside(all, moods, mode), `${mode} ${JSON.stringify(moods)}`).toHaveLength(3);
      }
    }
  });

  it("leaves the list it was given alone", () => {
    const given = [stadium, canyon, diner];
    orderRoadside(given, ["food"], "best");
    expect(names(given)).toEqual(["The stadium", "The canyon", "The diner"]);
  });
});
