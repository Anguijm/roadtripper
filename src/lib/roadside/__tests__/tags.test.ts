import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import {
  ROADSIDE_TAGS,
  MOODS,
  MOOD_CONFIG,
  TAG_MOOD,
  TAG_QUESTIONS,
  MAX_MOODS,
  MOOD_ANSWERED,
  MOOD_WEIGHT,
  GENERAL_WEIGHT,
  SORT_MODES,
  SORT_LABELS,
  SORT_LEAD,
  parseMoods,
  MOODS_PARAM,
  moodScore,
  rankFor,
  toggleMood,
  tagQuestionsJson,
  type RoadsideTag,
  type TagScores,
} from "@/lib/roadside/tags";

/**
 * The near-black the chosen chip carries as text; the fill must hold it.
 * The one source of truth for it is `--background` in
 * `src/app/globals.css`, which `MoodChips.tsx` names as
 * `text-[#0d1117]` on the chosen chip. If the app's background changes,
 * change it here too or this test guards the wrong pair.
 */
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
      // not a sentence fragment and not an essay. The floor is there
      // because a bare "This place is a museum." gives the model nothing to
      // separate a museum from a heritage centre; the ceiling because the
      // scorer sends all eighteen in one request and its state-plus-question
      // budget is finite (STATE_TOKEN_CAP in jev-lab's bench/jev_client.py),
      // so eighteen essays would not fit beside a place's description.
      expect(q.length, tag).toBeGreaterThan(30);
      expect(q.length, tag).toBeLessThan(400);
      expect(q.trim().endsWith("."), tag).toBe(true);
    }
    expect(Object.keys(TAG_QUESTIONS).sort()).toEqual([...ROADSIDE_TAGS].sort());
  });

  it("labels the chips in plain words with no glossary word and no invented shorthand", () => {
    const never = /candidates|persona|waypoint|neighborhood|primary|recompute|budget left/i;
    for (const mood of MOODS) {
      const { label } = MOOD_CONFIG[mood];
      expect(label, mood).not.toMatch(never);
      // Sentence case: a capital then lower case, one word.
      expect(label, mood).toMatch(/^[A-Z][a-z]+$/);
    }
    // Every chip is told apart by its word. There is no glyph: U6 round 2
    // failed the eight geometric characters on rule 2, and the word is
    // what carries a chip's identity now.
    expect(new Set(MOODS.map((m) => MOOD_CONFIG[m].label)).size).toBe(8);
    expect(MOODS.every((m) => !("glyph" in MOOD_CONFIG[m]))).toBe(true);
  });

  it("fills a chosen chip with something the body colour can be read on", () => {
    for (const mood of MOODS) {
      const ratio = contrast(MOOD_CONFIG[mood].accentColor, BODY_ON_ACCENT);
      // 4.5 is the readable-text bar; the council raised exactly this on U1.
      expect(ratio, `${mood} ${MOOD_CONFIG[mood].accentColor}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("names the two ways the list can be ordered, as the end of a sentence", () => {
    // U6 round 1: the critic read the control as two more mood chips, in
    // part because its words were labels standing alone. Each now finishes
    // SORT_LEAD, so the screen says a sentence a person would say (rule 1).
    expect(SORT_MODES).toEqual(["best", "along"]);
    expect(SORT_LEAD).toBe("Show me");
    expect(SORT_LABELS.best).toBe("best first");
    expect(SORT_LABELS.along).toBe("along the road");
    for (const m of SORT_MODES) {
      expect(`${SORT_LEAD} ${SORT_LABELS[m]}`, m).toMatch(/^Show me [a-z]/);
    }
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
  /** The key a place lands on inside each band, spelled out once. */
  const band2 = (weakest: number, general: number) => 2 + weakest * MOOD_WEIGHT + general * GENERAL_WEIGHT;
  const band1 = (best: number, general: number) => 1 + best * MOOD_WEIGHT + general * GENERAL_WEIGHT;

  const bigTexan: TagScores = { famous_food: 0.9, roadside_oddity: 0.8, giant_thing: 0.6 };
  const waterfall: TagScores = { waterfall: 0.95 };
  const smallMuseum: TagScores = { museum: 0.5 };

  it("falls back to the general score when nothing is chosen", () => {
    expect(rankFor(bigTexan, 0.42, [])).toBe(0.42);
    expect(rankFor({}, 0.7, [])).toBe(0.7);
  });

  it("uses that mood alone when one is chosen, and bands on whether it is answered at all", () => {
    expect(rankFor(bigTexan, 0.42, ["food"])).toBeCloseTo(band2(0.9, 0.42));
    expect(rankFor(waterfall, 0.42, ["outdoors"])).toBeCloseTo(band2(0.95, 0.42));
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
    expect(rankFor(bigTexan, 0.42, ["food", "oddities"])).toBeCloseTo(band2(0.8, 0.42));
  });

  it("puts a place that answers one in the middle band and one that answers neither at the bottom", () => {
    const onlyFood: TagScores = { famous_food: 0.95 };
    expect(rankFor(onlyFood, 0.42, ["food", "oddities"])).toBeCloseTo(band1(0.95, 0.42));
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

  it("breaks a tie on the mood with the general score, so the Rose Bowl beats a practice field", () => {
    // Both are unarguably about sport and the tagging run put both at
    // 0.99; only "would you pull over for this" separates them.
    const roseBowl: TagScores = { sports_place: 0.99 };
    const practiceField: TagScores = { sports_place: 0.99 };
    expect(rankFor(roseBowl, 0.06, ["sports"])).toBeGreaterThan(rankFor(practiceField, 0.04, ["sports"]));
  });

  it("does not let the general score overturn a real difference in the mood", () => {
    // A place half a point better on the mood wins however dull it is.
    const strongMood: TagScores = { museum: 0.9 };
    const weakMood: TagScores = { museum: 0.4 };
    expect(rankFor(strongMood, 0.0, ["museums"])).toBeGreaterThan(rankFor(weakMood, 1.0, ["museums"]));
    expect(MOOD_WEIGHT).toBeGreaterThan(GENERAL_WEIGHT * 5);
  });

  it("keeps the three bands from ever running into each other", () => {
    // The whole ordering rests on this. Band 0 is at most 1, band 1 runs
    // 1 + MOOD_ANSWERED to 2, band 2 runs 2 + MOOD_ANSWERED to 3. Walk the
    // range and check no key from a lower band can reach a higher one.
    const chosen = ["food", "oddities"] as const;
    let maxBand0 = -Infinity;
    let minBand1 = Infinity;
    let maxBand1 = -Infinity;
    let minBand2 = Infinity;
    for (let a = 0; a <= 1.0001; a += 0.01) {
      for (let b = 0; b <= 1.0001; b += 0.01) {
        const scores: TagScores = { famous_food: Math.min(a, 1), roadside_oddity: Math.min(b, 1) };
        // The general score is part of the within-band key now, so take
        // each band at its worst case: the highest a lower band can reach
        // (general 1) against the lowest a higher band can fall to
        // (general 0).
        const answered = [a, b].filter((x) => x >= MOOD_ANSWERED).length;
        if (answered === 2) minBand2 = Math.min(minBand2, rankFor(scores, 0, chosen));
        else if (answered === 1) {
          minBand1 = Math.min(minBand1, rankFor(scores, 0, chosen));
          maxBand1 = Math.max(maxBand1, rankFor(scores, 1, chosen));
        } else maxBand0 = Math.max(maxBand0, rankFor(scores, 1, chosen));
      }
    }
    expect(maxBand0).toBeLessThan(minBand1);
    expect(maxBand1).toBeLessThan(minBand2);
  });

  it("is not thrown off by a score the store should never have written", () => {
    // The scores come from a SQLite table a bench script in another repo
    // writes. A NaN would lose every comparison and read as absent, which
    // is survivable; an Infinity would win every comparison and pin one
    // place to the top of every list for ever, which is not.
    const rubbish = { famous_food: Infinity, roadside_oddity: NaN } as unknown as TagScores;
    expect(moodScore(rubbish, "food")).toBe(0);
    expect(rankFor(rubbish, 0.5, ["food"])).toBeCloseTo(0.5);
    const tooBig = { museum: 9e9 } as unknown as TagScores;
    expect(moodScore(tooBig, "museums")).toBe(0);
    const negative = { museum: -1 } as unknown as TagScores;
    expect(moodScore(negative, "museums")).toBe(0);
  });

  it("answers rather than throwing when there are no scores at all", () => {
    // A place the tagging pass has not reached yet reads as no scores.
    expect(moodScore(null, "food")).toBe(0);
    expect(moodScore(undefined, "food")).toBe(0);
    expect(rankFor(null, 0.42, ["food"])).toBeCloseTo(0.42);
    expect(rankFor(undefined, 0.42, [])).toBeCloseTo(0.42);
  });

  it("keeps an unbanded key inside the range a banded one is measured against", () => {
    // A general score outside 0 to 1 would break the band separation the
    // test above proves, so it is clamped rather than trusted.
    expect(rankFor({}, 5, ["food"])).toBeLessThanOrEqual(1);
    expect(rankFor({}, -3, ["food"])).toBeGreaterThanOrEqual(0);
    expect(rankFor({}, NaN, ["food"])).toBe(0);
  });

  it("clamps the general score with no mood chosen, which is how the list first loads", () => {
    // The no-mood path is not an edge: it is the state of the list before
    // anyone taps a chip, so it is the most travelled line in the function.
    // It returned `generalScore` untouched, so one corrupt row reached the
    // comparator unchecked on the default screen.
    expect(rankFor({}, NaN, [])).toBe(0);
    expect(rankFor({}, Infinity, [])).toBe(0);
    expect(rankFor({}, -Infinity, [])).toBe(0);
    expect(rankFor({}, 5, [])).toBe(1);
    expect(rankFor({}, -3, [])).toBe(0);
    expect(rankFor({}, 0.42, [])).toBeCloseTo(0.42);
  });

  it("keeps a corrupt row from outranking a real one when no mood is chosen", () => {
    // An Infinity clamped upward to 1 would tie the best real place and
    // win on a stable sort. Treating it as no answer puts it at the
    // bottom, which is where a row nothing can be read from belongs.
    const rows = [
      { id: "corrupt", general: Infinity },
      { id: "good", general: 0.9 },
      { id: "poor", general: 0.1 },
    ];
    const order = [...rows]
      .sort((a, b) => rankFor({}, b.general, []) - rankFor({}, a.general, []))
      .map((r) => r.id);
    expect(order).toEqual(["good", "poor", "corrupt"]);
  });

  it("carries the same rule on if more moods than the screen allows ever arrive", () => {
    // Two of the three answered, so the middle band, ordered by the best.
    expect(rankFor(bigTexan, 0.42, ["food", "oddities", "museums"])).toBeCloseTo(band1(0.9, 0.42));
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


describe("the file the tagging bench reads", () => {
  // The bench lives in another repository (jev-lab,
  // bench/roadside_tag_score.py) and reads data/tag-questions.json for the
  // eighteen questions instead of keeping its own copy, so that a tag
  // cannot mean one thing to the scorer that wrote a score and another to
  // the list that ranks on it. Nothing enforced that: the file was
  // produced by hand and was not in the repository at all, so the module
  // and the scorer could drift apart without anything failing.
  const committed = () =>
    readFileSync(fileURLToPath(new URL("../../../../data/tag-questions.json", import.meta.url)), "utf8");

  it("is committed and matches the vocabulary exactly", () => {
    // If this fails, run `bun run tags:export` and commit the result.
    expect(committed()).toBe(tagQuestionsJson());
  });

  it("carries every tag and every mood in the shape the bench indexes by", () => {
    const doc = JSON.parse(committed()) as {
      tags: string[];
      questions: Record<string, string>;
      moods: Record<string, string[]>;
    };
    expect(doc.tags).toEqual([...ROADSIDE_TAGS]);
    for (const tag of ROADSIDE_TAGS) expect(doc.questions[tag]).toBe(TAG_QUESTIONS[tag]);
    expect(Object.keys(doc.moods)).toEqual([...MOODS]);
    // Every tag rolls up into exactly one mood, which is what lets the
    // bench's per-tag score become a mood score without a second table.
    expect(Object.values(doc.moods).flat().sort()).toEqual([...ROADSIDE_TAGS].sort());
  });
});


describe("the moods a link carries", () => {
  it("reads the ones it knows, in the order they were given", () => {
    expect(parseMoods("food")).toEqual(["food"]);
    expect(parseMoods("food,outdoors")).toEqual(["food", "outdoors"]);
    // Order is kept because toggleMood drops the one chosen longest ago,
    // and that has to mean the same after a reload as before it.
    expect(parseMoods("outdoors,food")).toEqual(["outdoors", "food"]);
    expect(parseMoods(" food , outdoors ")).toEqual(["food", "outdoors"]);
  });

  it("drops anything it cannot read rather than choosing a mood nobody asked for", () => {
    for (const raw of ["", ",", ",,,", "banana", "FOOD", "food;outdoors", "  "]) {
      expect(parseMoods(raw), JSON.stringify(raw)).toEqual([]);
    }
    for (const raw of [undefined, null, 0, 42, [], {}, true, [1, 2], [null]]) {
      expect(parseMoods(raw), JSON.stringify(raw)).toEqual([]);
    }
  });

  it("reads a repeated parameter, which is how a link can spell it", () => {
    // `?moods=food&moods=sports` reaches a page as `string[]`, which is
    // what Next types a searchParams value as. It read as nothing at all
    // until council round 2 on #94, throwing away a choice the link plainly
    // made. Both spellings of the same link now agree.
    expect(parseMoods(["food", "sports"])).toEqual(["food", "sports"]);
    expect(parseMoods("food,sports")).toEqual(["food", "sports"]);
    expect(parseMoods(["food,sports"])).toEqual(["food", "sports"]);
    expect(parseMoods(["food"])).toEqual(["food"]);
    // The cap and the de-duplication hold across the parts, not within one.
    expect(parseMoods(["food", "sports", "museums"])).toEqual(["food", "sports"]);
    expect(parseMoods(["food", "food"])).toEqual(["food"]);
    // A mixed array drops what it cannot read and keeps what it can.
    expect(parseMoods(["banana", "food"])).toEqual(["food"]);
    expect(parseMoods([null, "food", 7])).toEqual(["food"]);
  });

  it("never returns more than the screen can show, whatever the link says", () => {
    expect(parseMoods("food,outdoors,museums")).toEqual(["food", "outdoors"]);
    expect(parseMoods(MOODS.join(","))).toHaveLength(MAX_MOODS);
    // A repeat is not a second choice.
    expect(parseMoods("food,food")).toEqual(["food"]);
    expect(parseMoods("food,food,outdoors")).toEqual(["food", "outdoors"]);
  });

  it("is not hurt by an outsized or hostile parameter", () => {
    // The parameter comes off a URL anyone can edit. It is read, not
    // trusted: nothing here indexes by it, and the result is a list of
    // known ids or nothing at all.
    expect(parseMoods("x".repeat(100_000))).toEqual([]);
    expect(parseMoods(Array(50_000).fill("banana").join(","))).toEqual([]);
    expect(parseMoods("<script>alert(1)</script>")).toEqual([]);
    expect(parseMoods("__proto__,constructor")).toEqual([]);
    expect(parseMoods("food," + "x".repeat(100_000))).toEqual(["food"]);
    // Whatever comes back is always a real mood the vocabulary knows.
    for (const raw of ["food,banana", "banana,food", "__proto__,food"]) {
      for (const m of parseMoods(raw)) expect(MOODS, raw).toContain(m);
    }
  });

  it("names the parameter once, for every screen that writes it", () => {
    expect(MOODS_PARAM).toBe("moods");
  });
});
