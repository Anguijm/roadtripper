import { describe, it, expect } from "vitest";
import { validateLatLng, validateBudget, hopReachMinutes, HOP_REACH_MAX_MINUTES, InvalidRouteParamsError } from "./validation";

describe("hopReachMinutes", () => {
  it("converts budget hours to minutes", () => {
    expect(hopReachMinutes(3)).toBe(180);
    expect(hopReachMinutes(5)).toBe(300);
  });

  it("caps at HOP_REACH_MAX_MINUTES (480 min = 8h)", () => {
    expect(hopReachMinutes(8)).toBe(480);
    expect(hopReachMinutes(10)).toBe(480);
    expect(hopReachMinutes(100)).toBe(HOP_REACH_MAX_MINUTES);
  });

  it("rounds fractional hours", () => {
    expect(hopReachMinutes(1.5)).toBe(90);
  });
});

describe("validateLatLng", () => {
  it("accepts valid coordinates", () => {
    expect(() => validateLatLng("34.05", "-118.24")).not.toThrow();
  });

  it("throws on missing params", () => {
    expect(() => validateLatLng(undefined, "-118.24")).toThrow(InvalidRouteParamsError);
    expect(() => validateLatLng("34.05", undefined)).toThrow(InvalidRouteParamsError);
  });

  it("throws on lat out of range", () => {
    expect(() => validateLatLng("91", "0")).toThrow(InvalidRouteParamsError);
    expect(() => validateLatLng("-91", "0")).toThrow(InvalidRouteParamsError);
  });

  it("throws on lng out of range", () => {
    expect(() => validateLatLng("0", "181")).toThrow(InvalidRouteParamsError);
    expect(() => validateLatLng("0", "-181")).toThrow(InvalidRouteParamsError);
  });

  it("throws on non-finite values", () => {
    expect(() => validateLatLng("NaN", "0")).toThrow(InvalidRouteParamsError);
    expect(() => validateLatLng("Infinity", "0")).toThrow(InvalidRouteParamsError);
  });
});

describe("validateBudget", () => {
  it("accepts valid budget", () => {
    expect(validateBudget("4")).toBe(4);
    expect(validateBudget("1")).toBe(1);
    expect(validateBudget("24")).toBe(24);
  });

  it("defaults to 4 when undefined", () => {
    expect(validateBudget(undefined)).toBe(4);
  });

  it("throws on out-of-range budget", () => {
    expect(() => validateBudget("0")).toThrow(InvalidRouteParamsError);
    expect(() => validateBudget("25")).toThrow(InvalidRouteParamsError);
  });
});
