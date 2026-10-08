import { describe, it, expect } from "vitest";
import { readableDetail, onTheMapLine, TAG_WORD_NOUNS } from "../text";

/**
 * The mapper's own text as a line about a place (Gauntlet U16). For 8,838 of
 * the 27,976 places on the map it is a single tag value, and the card showed
 * it as the whole line — one read only "tourism".
 */

describe("the mapper's text, read as a line", () => {
  it("keeps what the mapper actually wrote", () => {
    expect(readableDetail("A mural of the plains, painted in 1999.")).toBe("A mural of the plains, painted in 1999.");
    expect(readableDetail("  roadside oddity  ")).toBe("roadside oddity");
  });

  it("says a plain-noun tag in the card's own sentence, which tells more than the kind", () => {
    expect(readableDetail("statue")).toBe("On the map as a statue; nothing written about it yet.");
    expect(readableDetail("Sculpture")).toBe("On the map as a sculpture; nothing written about it yet.");
    expect(readableDetail("observation")).toBe("On the map as an observation tower; nothing written about it yet.");
  });

  it("drops tag-speak, so the card falls back to the place's kind", () => {
    for (const tag of ["tourism", "history", "local", "commercial", "military", "transport", "animal", "art", "yes", "historic", "civic"]) {
      expect(readableDetail(tag), tag).toBeNull();
    }
  });

  it("has nothing to say for no text", () => {
    for (const d of [null, undefined, "", "   "]) expect(readableDetail(d)).toBeNull();
  });

  it("uses 'an' before a vowel", () => {
    expect(onTheMapLine("arch")).toBe("On the map as an arch; nothing written about it yet.");
    expect(onTheMapLine("obelisk")).toBe("On the map as an obelisk; nothing written about it yet.");
  });

  it("lists only words a person in a car would say with an 'a' in front", () => {
    // The table is the judgement. Pin the two biggest — 2,388 sculptures and
    // 1,923 statues — and keep it free of the tag-speak that started this.
    expect(TAG_WORD_NOUNS.sculpture).toBe("sculpture");
    expect(TAG_WORD_NOUNS.statue).toBe("statue");
    for (const tag of ["tourism", "history", "local", "commercial", "yes"]) {
      expect(TAG_WORD_NOUNS[tag], tag).toBeUndefined();
    }
  });
});
