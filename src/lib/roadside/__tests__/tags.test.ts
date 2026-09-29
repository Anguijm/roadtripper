import { describe, it, expect } from "vitest";
import {
  ROADSIDE_TAGS,
  MOODS,
  MOOD_CONFIG,
  TAG_MOOD,
  TAG_QUESTIONS,
  MAX_MOODS,
  MOOD_ANSWERED,
  SORT_MODES,
  SORT_LABELS,
  moodScore,
  rankFor,
  toggleMood,
  type RoadsideTag,
  type TagScores,
} from "@/lib/roadside/tags";

/** The near-black the chosen chip carries as text; the fill must hold it. */
const BODY_ON_ACCENT = "#0d1117";

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the vocabulary the operator approved", () => {
  it("is eighteen tags under eight moods", () => {
    expect(ROADSIDE_TAGS).toHaveLength(18);
    expect(MOODS).toHaveLength(8);
    expect(new Set(ROADSIDE_TAGS).size).toBe(18);
    expect(new Set(MOODS).size).toBe(8);
  });

  it("puts every tag under exactly one mood, and no mood claims a tag that does not exist", () => {
    const claimed = MOODS.flatMap((m) => MOOD_CONFIG[m].tags);
    // Every tag claimed once, no more and no less.
    expect([...claimed].sort()).toEqual([...ROADSIDE_TAGS].sort());
    expect(new Set(claimed).size).toBe(claimed.length);
    for (const tag of ROADSIDE_TAGS) expect(MOOD_CONFIG[TAG_MOOD[tag]].tags).toContain(tag);
  });

  it("asks a question for every tag, and asks nothing it cannot store", () => {
    for (const tag of ROADSIDE_TAGS) {
      const q = TAG_QUESTIONS[tag];
      expect(q, tag).toBeTruthy();
      // A question a person could answer about the place in front of them,
      // not a sentence fragment and not an essay.
      expect(q.length, tag).toBeGreaterThan(30);
      expect(q.length, tag).toBeLessThan(400);
      expect(q.trim().endsWith("."), tag).toBe(true);
    }
    expect(Object.keys(TAG_QUESTIONS).sort()).toEqual([...ROADSIDE_TAGS].sort());
  });

  it("labels the chips in plain words with no glossary word and no invented shorthand", () => {
    const never = /candidates|persona|waypoint|neighborhood|primary|recompute|budget left/i;
    for (const mood of MOODS) {
      const { label, glyph } = MOOD_CONFIG[mood];
      expect(label, mood).not.toMatch(never);
      // Sentence case: a capital then lower case, one word.
      expect(label, mood).toMatch(/^[A-Z][a-z]+$/);
      expect(glyph.length, mood).toBeGreaterThan(0);
    }
    // Every chip is told apart by its word and its glyph, not by colour alone.
    expect(new Set(MOODS.map((m) => MOOD_CONFIG[m].label)).size).toBe(8);
    expect(new Set(MOODS.map((m) => MOOD_CONFIG[m].glyph)).size).toBe(8);
  });

  it("fills a chosen chip with something the body colour can be read on", () => {
    for (const mood of MOODS) {
      const ratio = contrast(MOOD_CONFIG[mood].accentColor, BODY_ON_ACCENT);
      // 4.5 is the readable-text bar; the council raised exactly this on U1.
      expect(ratio, `${mood} ${MOOD_CONFIG[mood].accentColor}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("names the two ways the list can be ordered", () => {
    expect(SORT_MODES).toEqual(["best", "along"]);
    expect(SORT_LABELS.best).toBe("Best match");
    expect(SORT_LABELS.along).toBe("Along the road");
  });
});

describe("how well a place answers one mood", () => {
  it("takes its best tag in that mood, not the average", () => {
    const scores: TagScores = { waterfall: 0.9, big_view: 0.1, garden: 0.0 };
    // Averaging the four Outdoors tags would give about 0.25 and bury it.
    expect(moodScore(scores, "outdoors")).toBeCloseTo(0.9);
  });

  it("reads a tag the store never wrote as no answer at all", () => {
    expect(moodScore({}, "outdoors")).toBe(0);
    expect(moodScore({ museum: 0.99 }, "outdoors")).toBe(0);
  });

  it("ignores tags that belong to other moods", () => {
    const scores: TagScores = { museum: 0.95, waterfall: 0.4 };
    expect(moodScore(scores, "museums")).toBeCloseTo(0.95);
    expect(moodScore(scores, "outdoors")).toBeCloseTo(0.4);
  });
});

describe("how a place ranks for what is chosen", () => {
  const bigTexan: TagScores = { famous_food: 0.9, roadside_oddity: 0.8, giant_thing: 0.6 };
  const waterfall: TagScores = { waterfall: 0.95 };
  const smallMuseum: TagScores = { museum: 0.5 };

  it("falls back to the general score when nothing is chosen", () => {
    expect(rankFor(bigTexan, 0.42, [])).toBe(0.42);
    expect(rankFor({}, 0.7, [])).toBe(0.7);
  });

  it("uses that mood alone when one is chosen, and bands on whether it is answered at all", () => {
    expect(rankFor(bigTexan, 0.42, ["food"])).toBeCloseTo(2 + 0.9);
    expect(rankFor(waterfall, 0.42, ["outdoors"])).toBeCloseTo(2 + 0.95);
    // A place with nothing to say about the one chosen mood keeps its
    // general score and sits under everything that answered.
    expect(rankFor(waterfall, 0.42, ["food"])).toBeCloseTo(0.42);
    expect(rankFor(bigTexan, 0.42, ["food"])).toBeGreaterThan(rankFor(waterfall, 0.99, ["food"]));
  });

  it("puts a weak answer above a strong general score, because the chips are what was asked for", () => {
    // A middling museum beats a spectacular waterfall when Museums is
    // tapped. Tapping a chip has to change the list or it is not a control.
    expect(rankFor(smallMuseum, 0.1, ["museums"])).toBeGreaterThan(rankFor(waterfall, 0.99, ["museums"]));
  });

  it("puts a place that answers both in the top band, ordered by its weaker mood", () => {
    // Food and Oddities: the steakhouse answers both (0.9 and 0.8).
    expect(rankFor(bigTexan, 0.42, ["food", "oddities"])).toBeCloseTo(2 + 0.8);
  });

  it("puts a place that answers one in the middle band and one that answers neither at the bottom", () => {
    const onlyFood: TagScores = { famous_food: 0.95 };
    expect(rankFor(onlyFood, 0.42, ["food", "oddities"])).toBeCloseTo(1 + 0.95);
    // Neither: it keeps its general score, which is still an order.
    expect(rankFor(waterfall, 0.42, ["food", "oddities"])).toBeCloseTo(0.42);
  });

  it("ranks both above one above neither, and drops nothing off the list", () => {
    const onlyFood: TagScores = { famous_food: 0.95 };
    const chosen = ["food", "oddities"] as const;
    const ranked = [waterfall, onlyFood, bigTexan]
      .map((s, i) => ({ i, r: rankFor(s, 0.5, chosen) }))
      .sort((a, b) => b.r - a.r);
    // The steakhouse first, then the thing that is one of the two, then the
    // thing that is neither - and all three are still here.
    expect(ranked.map((x) => x.i)).toEqual([2, 1, 0]);
    expect(ranked).toHaveLength(3);
  });

  it("orders the tail instead of flattening it to zero", () => {
    // The flaw the first cut had: ranking on the weakest mood alone gave
    // every place that missed either mood exactly zero, so everything below
    // the both-matches came back in whatever order it arrived in.
    const chosen = ["food", "oddities"] as const;
    const strongOne: TagScores = { famous_food: 0.9 };
    const weakOne: TagScores = { famous_food: 0.4 };
    const nothing: TagScores = { waterfall: 0.99 };
    const keys = [strongOne, weakOne, nothing].map((s) => rankFor(s, 0.2, chosen));
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBeGreaterThan(keys[1]);
    expect(keys[1]).toBeGreaterThan(keys[2]);
  });

  it("does not let a faint trace of a mood count as answering it", () => {
    // Two 0.1s are not an answer to anything; that place belongs at the
    // bottom with its general score, not in the top band on 0.1.
    const faint: TagScores = { famous_food: 0.1, roadside_oddity: 0.1 };
    expect(rankFor(faint, 0.3, ["food", "oddities"])).toBeCloseTo(0.3);
    expect(MOOD_ANSWERED).toBeGreaterThan(0.1);
  });

  it("does not let a strong single tag beat a place that answers both", () => {
    // 0.95 on one chosen mood loses to 0.8-and-0.8 on both. This is the
    // whole point of the weaker-of-two rule.
    const loud: TagScores = { famous_food: 0.95 };
    const balanced: TagScores = { famous_food: 0.8, roadside_oddity: 0.8 };
    const chosen = ["food", "oddities"] as const;
    expect(rankFor(balanced, 0.5, chosen)).toBeGreaterThan(rankFor(loud, 0.5, chosen));
  });

  it("carries the same rule on if more moods than the screen allows ever arrive", () => {
    // Two of the three answered, so the middle band, ordered by the best.
    expect(rankFor(bigTexan, 0.42, ["food", "oddities", "museums"])).toBeCloseTo(1 + 0.9);
  });
});

describe("choosing and unchoosing", () => {
  it("adds one", () => {
    expect(toggleMood([], "food")).toEqual(["food"]);
    expect(toggleMood(["food"], "oddities")).toEqual(["food", "oddities"]);
  });

  it("takes one away when it is tapped again", () => {
    expect(toggleMood(["food", "oddities"], "food")).toEqual(["oddities"]);
    expect(toggleMood(["food"], "food")).toEqual([]);
  });

  it("keeps at most two, dropping the one chosen longest ago", () => {
    const next = toggleMood(["food", "oddities"], "museums");
    expect(next).toHaveLength(MAX_MOODS);
    expect(next).toEqual(["oddities", "museums"]);
  });

  it("never refuses a tap silently", () => {
    // Whatever is already chosen, a tap changes the set. A chip that looks
    // tappable and does nothing is the one behaviour rule 3 forbids.
    for (const mood of MOODS) {
      const before = ["food", "oddities"] as const;
      const after = toggleMood(before, mood);
      expect(after, mood).not.toEqual([...before]);
    }
  });

  it("returns a new array and leaves the one it was given alone", () => {
    const before: RoadsideTag[] = [];
    const chosen = ["food"] as const;
    const after = toggleMood(chosen, "museums");
    expect(chosen).toEqual(["food"]);
    expect(after).not.toBe(chosen);
    expect(before).toHaveLength(0);
  });
});
