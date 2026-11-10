import { describe, it, expect } from "vitest";
import { clientTag } from "@/lib/today/client";

/** The car's client tag for the log line (docs/car-api.md): forgiving, and only ever plain characters. */
describe("clientTag", () => {
  const u = (qs: string) => `http://localhost/api/today?lat=1&lng=2${qs}`;
  it("reads car-<version> from the query", () => {
    expect(clientTag(u("&client=car-0.2.0"))).toBe("car-0.2.0");
  });
  it("logs - for a missing or malformed tag, never the raw text", () => {
    expect(clientTag(u(""))).toBe("-");
    for (const bad of ["Car-0.2", "car 0.2", "car-0.2%0Afake", "-car", "a".repeat(41), "car_0.2", '"x"']) {
      expect(clientTag(u(`&client=${bad}`))).toBe("-");
    }
  });
});
