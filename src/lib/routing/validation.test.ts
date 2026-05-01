import { describe, it, expect } from "vitest";
import { validateLatLng, validateBudget, InvalidRouteParamsError } from "./validation";

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
