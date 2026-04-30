import { describe, it, expect } from "vitest";
import { detourCapForBudget, validateLatLng, validateBudget, InvalidRouteParamsError } from "./validation";

describe("detourCapForBudget", () => {
  it("returns 45 min floor for small budgets", () => {
    expect(detourCapForBudget(1)).toBe(45);
    expect(detourCapForBudget(2)).toBe(45);
  });

  it("scales linearly between floor and cap", () => {
    expect(detourCapForBudget(4)).toBe(60);
    expect(detourCapForBudget(6)).toBe(90);
    expect(detourCapForBudget(8)).toBe(120);
  });

  it("hard-caps at 120 min for large inputs", () => {
    // 90-day trip × 16 h/day = 1440 h — must not blow past the 120 min ceiling.
    expect(detourCapForBudget(90 * 16)).toBe(120);
    expect(detourCapForBudget(1440)).toBe(120);
    expect(detourCapForBudget(10000)).toBe(120);
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
