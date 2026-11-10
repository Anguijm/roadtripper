import { describe, it, expect } from "vitest";
import { abroadLabel } from "@/lib/plan/words";

describe("abroadLabel (U52)", () => {
  it("names the other country, and only when both are known and differ", () => {
    expect(abroadLabel("Canada", "United States")).toBe("in Canada");
    expect(abroadLabel("United States", "United States")).toBeNull();
    expect(abroadLabel("Canada", null)).toBeNull();
    expect(abroadLabel("", "United States")).toBeNull();
    expect(abroadLabel(undefined, "United States")).toBeNull();
    // Case and stray spaces do not make a country foreign (PR #169 council).
    expect(abroadLabel(" canada ", "Canada")).toBeNull();
    expect(abroadLabel(" Canada ", "United States")).toBe("in Canada");
  });
});
