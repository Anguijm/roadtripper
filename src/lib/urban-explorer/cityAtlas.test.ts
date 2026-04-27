import { describe, it, expect } from "vitest";
import { localizedText, NeighborhoodLiteSchema } from "./cityAtlas";

describe("localizedText", () => {
  it("returns the requested locale when present", () => {
    expect(localizedText({ en: "Hello", ja: "こんにちは" }, "ja")).toBe("こんにちは");
  });

  it("falls back to en when the locale is missing", () => {
    expect(localizedText({ en: "Hello" }, "ja")).toBe("Hello");
  });

  it("defaults to en when no locale is passed", () => {
    expect(localizedText({ en: "Hello" })).toBe("Hello");
  });
});

describe("NeighborhoodLiteSchema", () => {
  const valid = {
    id: "the-strip",
    name: { en: "The Strip" },
    trending_score: 85,
  };

  it("accepts a valid lite neighborhood", () => {
    expect(NeighborhoodLiteSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an optional summary", () => {
    const result = NeighborhoodLiteSchema.safeParse({
      ...valid,
      summary: { en: "The main drag." },
    });
    expect(result.success).toBe(true);
  });

  it("rejects ids with uppercase characters", () => {
    const result = NeighborhoodLiteSchema.safeParse({ ...valid, id: "The-Strip" });
    expect(result.success).toBe(false);
  });

  it("rejects ids with spaces", () => {
    const result = NeighborhoodLiteSchema.safeParse({ ...valid, id: "the strip" });
    expect(result.success).toBe(false);
  });

  it("rejects trending_score above 100", () => {
    const result = NeighborhoodLiteSchema.safeParse({ ...valid, trending_score: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects trending_score below 0", () => {
    const result = NeighborhoodLiteSchema.safeParse({ ...valid, trending_score: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (.strict())", () => {
    const result = NeighborhoodLiteSchema.safeParse({ ...valid, extra: "boom" });
    expect(result.success).toBe(false);
  });
});
