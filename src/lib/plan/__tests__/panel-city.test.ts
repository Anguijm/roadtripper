import { describe, it, expect } from "vitest";
import { panelCityFor } from "../panel-city";

const stops = [{ cityId: "lubbock-tx", cityName: "Lubbock" }];
const candidates = [
  { id: "lubbock-tx", name: "Lubbock" },
  { id: "oklahoma-city", name: "Oklahoma City" },
];

describe("panelCityFor", () => {
  it("resolves a stop from the trip, flagged as a stop", () => {
    expect(panelCityFor("lubbock-tx", stops, candidates)).toEqual({ cityId: "lubbock-tx", cityName: "Lubbock", isStop: true });
  });

  it("resolves a candidate that is not in the trip, so its lore shows before it is added", () => {
    expect(panelCityFor("oklahoma-city", stops, candidates)).toEqual({ cityId: "oklahoma-city", cityName: "Oklahoma City", isStop: false });
  });

  it("keeps the panel on a city that leaves the trip but is still a candidate", () => {
    expect(panelCityFor("lubbock-tx", [], candidates)).toEqual({ cityId: "lubbock-tx", cityName: "Lubbock", isStop: false });
  });

  it("is null for nothing selected or a city on neither list", () => {
    expect(panelCityFor(null, stops, candidates)).toBeNull();
    expect(panelCityFor("denver", stops, candidates)).toBeNull();
  });
});
