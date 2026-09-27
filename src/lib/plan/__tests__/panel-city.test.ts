import { describe, it, expect } from "vitest";
import { panelCityFor, nextPanelCityId } from "../panel-city";

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

describe("nextPanelCityId, where the panel goes when the lists change", () => {
  it("stays on a stop, and stays on a candidate that is not a stop", () => {
    expect(nextPanelCityId("lubbock-tx", stops, candidates)).toBe("lubbock-tx");
    expect(nextPanelCityId("oklahoma-city", stops, candidates)).toBe("oklahoma-city");
  });

  it("keeps a removed stop open while it is still a candidate", () => {
    expect(nextPanelCityId("lubbock-tx", [], candidates)).toBe("lubbock-tx");
  });

  it("moves to the last stop when the city has left both lists, or closes when there is none", () => {
    const two = [{ cityId: "amarillo" }, { cityId: "lubbock-tx" }];
    expect(nextPanelCityId("denver", two, candidates)).toBe("lubbock-tx");
    expect(nextPanelCityId("denver", [], [])).toBeNull();
    expect(nextPanelCityId(null, two, candidates)).toBeNull();
  });
});
