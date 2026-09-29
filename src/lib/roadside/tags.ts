/**
 * What a roadside place is, and what you are in the mood for.
 *
 * Two levels, because they answer different questions. A **tag** is what a
 * place is: a waterfall, a war memorial, a giant fibreglass thing. A place
 * carries several, each with its own probability from the scorer. A
 * **mood** is what you tap at the top of the screen; it rolls up a handful
 * of tags. Eighteen tags and eight moods, agreed with the operator on
 * 2026-09-30 after the clusters were counted in the store: four clusters
 * hold more than four thousand places, four more hold one to three
 * thousand, and the tail drops under seven hundred. Eighteen reaches the
 * bottom of that tail.
 *
 * Why two levels and not one: a chip has to fit a phone, and U5 settled
 * that five chips already wrap to two rows. Eight is the most the screen
 * can carry. But eight labels are too coarse to score a place against, and
 * "is this Outdoors?" is a worse question for a model than "is this a
 * waterfall?". So the model answers the narrow question and the screen
 * asks the broad one.
 *
 * Nothing here calls a model or reads the store. The scores come from the
 * store, precomputed, because the app must answer with no model in the
 * loop at use time.
 */

/** A thing a place can be. One probability per tag per place, from the scorer. */
export const ROADSIDE_TAGS = [
  "big_view",
  "waterfall",
  "rock_and_cave",
  "garden",
  "old_building",
  "war_memorial",
  "pioneer",
  "native_american",
  "public_art",
  "museum",
  "science_and_space",
  "roadside_oddity",
  "giant_thing",
  "trains_and_industry",
  "bridge_or_tower",
  "cars_and_racing",
  "famous_food",
  "sports_place",
] as const;

export type RoadsideTag = (typeof ROADSIDE_TAGS)[number];

/** What you tap. Eight, in the order the chips are drawn. */
export const MOODS = ["outdoors", "history", "art", "museums", "oddities", "machines", "food", "sports"] as const;

export type MoodId = (typeof MOODS)[number];

export interface MoodConfig {
  id: MoodId;
  /** The chip's one short word, sentence case (quality bar, rule 1). */
  label: string;
  /*
   * There is deliberately no glyph here. U6 round 2: the eight chips
   * carried geometric characters (▲ ■ ● ◇ ★ ◆ ◗ ◐) and the critic failed
   * them on rule 2. They rendered at wildly different sizes in the body
   * face — Food's and Sports' were a fraction of the label and unreadable
   * at arm's length — none of them depicted its mood, Museums' hollow ◇
   * and Machines' solid ◆ differed only by fill, which is the signal this
   * app uses everywhere for "chosen", and the two half-circles read as
   * carets promising an expand that is not there.
   *
   * The eight labels are one plain word each and stand on their own. The
   * chosen chip is marked by its fill, its weight and `aria-pressed`, none
   * of which was ever the glyph's job, so nothing is lost by its going.
   * Bringing icons back means one drawn set at one size, each shape
   * depicting its mood, no two differing only by fill — not characters
   * picked out of a font.
   */
  /** The tags this mood rolls up. A place's mood score is its best of these. */
  tags: readonly RoadsideTag[];
  /**
   * The fill behind the chosen chip. Every one is light enough to carry
   * the near-black body colour as text, which is the contrast rule the
   * council raised on U1. A new or edited colour has to clear 4.5 to 1
   * against `#0d1117`; the test "fills a chosen chip with something the
   * body colour can be read on" computes that and fails if it does not,
   * so this is checked rather than trusted.
   */
  accentColor: string;
}

export const MOOD_CONFIG: Readonly<Record<MoodId, MoodConfig>> = {
  outdoors: {
    id: "outdoors",
    label: "Outdoors",
    tags: ["big_view", "waterfall", "rock_and_cave", "garden"],
    accentColor: "#7ee787",
  },
  history: {
    id: "history",
    label: "History",
    tags: ["old_building", "war_memorial", "pioneer", "native_american"],
    accentColor: "#d29922",
  },
  art: {
    id: "art",
    label: "Art",
    tags: ["public_art"],
    accentColor: "#bc8cff",
  },
  museums: {
    id: "museums",
    label: "Museums",
    tags: ["museum", "science_and_space"],
    accentColor: "#79c0ff",
  },
  oddities: {
    id: "oddities",
    label: "Oddities",
    tags: ["roadside_oddity", "giant_thing"],
    accentColor: "#ffa657",
  },
  machines: {
    id: "machines",
    label: "Machines",
    tags: ["trains_and_industry", "bridge_or_tower", "cars_and_racing"],
    accentColor: "#a5d6ff",
  },
  food: {
    id: "food",
    label: "Food",
    tags: ["famous_food"],
    accentColor: "#f0883e",
  },
  sports: {
    id: "sports",
    label: "Sports",
    tags: ["sports_place"],
    accentColor: "#56d4dd",
  },
} as const;

/**
 * Every tag belongs to exactly one mood. Checked by a test rather than by
 * construction, because the readable form above is the one a person edits.
 */
export const TAG_MOOD: Readonly<Record<RoadsideTag, MoodId>> = Object.freeze(
  Object.fromEntries(MOODS.flatMap((m) => MOOD_CONFIG[m].tags.map((t) => [t, m]))) as Record<RoadsideTag, MoodId>
);

/**
 * At most two moods at a time. Three produces a list that matches nothing
 * (the top band below needs every chosen mood answered, and three narrow
 * moods rarely all hold) and a third row of chips the phone has no room
 * for: `src/components/MoodChips.tsx` lays the chips out at `basis-[30%]`,
 * so three fit a row, and U5 measured eight chips at three rows on a
 * 390 px screen. Raising this means re-measuring there, and the chip
 * layout is pinned by `src/app/__tests__/home.fold.ssr.test.tsx` and
 * `src/app/__tests__/stylesheet.test.ts`.
 */
export const MAX_MOODS = 2;

/** A place's probability per tag, as the store holds it. A missing tag reads as zero. */
export type TagScores = Partial<Readonly<Record<RoadsideTag, number>>>;

/**
 * A stored tag score, or zero if it is not one.
 *
 * The scores come from a SQLite table written by a bench script in another
 * repository, so this module cannot assume they are sound. A `NaN` would
 * silently lose every comparison and read as absent, which is survivable;
 * an `Infinity` or a 9e9 would win every comparison and put one place at
 * the top of every list for ever, which is not. Anything that is not a
 * finite number in 0 to 1 is treated as no answer, which is the same thing
 * the code does with a tag the store never wrote.
 */
function scoreOf(scores: TagScores | null | undefined, tag: RoadsideTag): number {
  const p = scores?.[tag];
  return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p : 0;
}

/**
 * How well a place answers one mood: its best tag within that mood. Best,
 * not average: a spectacular waterfall is a good Outdoors stop whether or
 * not it also has a view, and averaging would punish a place for being
 * one thing well.
 */
export function moodScore(scores: TagScores | null | undefined, mood: MoodId): number {
  let best = 0;
  for (const tag of MOOD_CONFIG[mood].tags) {
    const p = scoreOf(scores, tag);
    if (p > best) best = p;
  }
  return best;
}

/**
 * A general score the module can trust: a finite number in 0 to 1, and 0
 * for anything else. Non-finite becomes 0 rather than 1 deliberately. An
 * `Infinity` clamped upward to 1 would win every comparison and pin one
 * place to the top of the unbanded list for ever, which is the exact
 * failure `scoreOf` exists to prevent; a corrupt value is not an answer,
 * so it reads as no answer.
 */
function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
}

/**
 * How strong a mood's score has to be before the place counts as being
 * that kind of thing at all. Below it the place is not "a bit of an
 * Outdoors stop", it is simply not one, and a stack of 0.1s must never add
 * up to an answer.
 *
 * Provisional at 0.35. It is a judgement about a distribution that did not
 * exist when it was written: no tag had been scored. Moving it means
 * re-reading `src/lib/roadside/__tests__/tags.test.ts`, which names the
 * bands by number and pins the band arithmetic. It must stay above zero
 * and below 1: at zero the bands collide (see `rankFor`), and at 1 nothing
 * ever reaches the top band.
 */
export const MOOD_ANSWERED = 0.35;

/**
 * Inside a band, how much of the order is the mood and how much is the
 * general "would you pull over for this" score.
 *
 * Nine to one, and the one matters. Tagging the store on 2026-09-30 put
 * the Rose Bowl and a college practice field both at 0.99 for
 * `sports_place`, because both are unarguably about sport; their general
 * scores were 0.06 and 0.04. On the mood alone the list would have put
 * them in whatever order they came out of the database. The general score
 * is the only thing that separates them, so it breaks the tie.
 *
 * It cannot overturn a real difference in the mood: a tenth of general
 * score is worth about a ninetieth of mood score, so a place has to be
 * near-tied on the mood before the general score decides anything.
 */
export const MOOD_WEIGHT = 0.9;
export const GENERAL_WEIGHT = 1 - MOOD_WEIGHT;

/**
 * How a place ranks for what is chosen. This is a **sort key, not a
 * probability**: it runs from 0 to 3 and must never be compared against a
 * threshold meant for a score. Use `moodScore` for that.
 *
 * Three bands, highest first, because the operator asked for bubbling up
 * rather than filtering down (2026-09-30) and a screen that is never empty
 * still has to put the right thing on top:
 *
 * - **2, answers every chosen mood.** Ordered among themselves by their
 *   weakest mood, so a place that is solidly both beats one that is
 *   brilliant at one and barely scrapes the other.
 * - **1, answers some but not all.** Ordered by its best chosen mood.
 * - **0, answers none.** Ordered by the general score, which is the
 *   scorer's answer to "is this worth pulling over for" and the order the
 *   list has always used.
 *
 * The bands are what makes the tail useful. A first cut ranked on the
 * weakest mood alone; every place missing either mood then scored exactly
 * zero and the whole tail came back in arbitrary order, which the tests
 * caught. Banding keeps the promise that what matches both is on top while
 * still ordering everything underneath it.
 *
 * Nothing chosen is the general score, unbanded, so the ordinary list is
 * exactly what it was before any of this.
 *
 * Why the bands cannot run into each other. Both the mood part and the
 * general part are 0 to 1 and the weights sum to 1, so the within-band
 * part is itself 0 to 1 and band 0 is at most 1. A place reaches band 1
 * only by answering a mood, so its mood part is at least `MOOD_ANSWERED`
 * and its key is at least 1 + 0.9 × 0.35, above everything in band 0; and
 * its key is at most 2. A place reaches band 2 only by answering every
 * chosen mood, so its key is at least 2 + 0.9 × 0.35, above everything in
 * band 1. The separation rests entirely on `MOOD_ANSWERED` being greater
 * than zero; at zero, band 1 could reach 2 and tie the bottom of band 2.
 * The test "keeps the three bands from ever running into each other"
 * walks the range and holds this.
 */
export function rankFor(scores: TagScores | null | undefined, generalScore: number, chosen: readonly MoodId[]): number {
  if (chosen.length === 0) return clamp01(generalScore);
  let weakest = Infinity;
  let best = 0;
  let answered = 0;
  for (const mood of chosen) {
    const s = moodScore(scores, mood);
    if (s < weakest) weakest = s;
    if (s > best) best = s;
    if (s >= MOOD_ANSWERED) answered++;
  }
  const general = clamp01(generalScore);
  if (answered === chosen.length) return 2 + weakest * MOOD_WEIGHT + general * GENERAL_WEIGHT;
  if (answered > 0) return 1 + best * MOOD_WEIGHT + general * GENERAL_WEIGHT;
  // Not banded: a place that answers nothing keeps the general score, which
  // is 0 to 1 and so sits under every banded key.
  return clamp01(generalScore);
}

/**
 * Add or remove a mood, keeping at most `MAX_MOODS`. Tapping a chosen one
 * turns it off. Choosing a third drops the one chosen longest ago, so the
 * tap always does something visible rather than being silently refused,
 * which is the one behaviour a chip that looks tappable must not have.
 */
export function toggleMood(chosen: readonly MoodId[], mood: MoodId): MoodId[] {
  if (chosen.includes(mood)) return chosen.filter((m) => m !== mood);
  const next = [...chosen, mood];
  return next.slice(Math.max(0, next.length - MAX_MOODS));
}

/** How the list is ordered under the chips. */
export const SORT_MODES = ["best", "along"] as const;
export type SortMode = (typeof SORT_MODES)[number];

/**
 * The lead-in over the sort control, so the two words after it finish a
 * sentence a person would say: "Show me best first", "Show me along the
 * road" (quality bar, rule 1).
 *
 * U6 round 1: the critic read the control as two more mood chips, because
 * it sat in the chip grid with no lead-in and nothing to say what it was
 * for. The words are half the fix; the shape is the other half.
 */
export const SORT_LEAD = "Show me";

/**
 * The words on the sort control. "Along the road" rather than "by
 * distance": inside a day the two are the same thing, and the first is
 * what a person in a car would say (quality bar, rule 1). Lower case
 * because each one continues `SORT_LEAD` rather than starting a label.
 */
export const SORT_LABELS: Readonly<Record<SortMode, string>> = {
  best: "best first",
  along: "along the road",
};

/**
 * The question each tag is asked, as the scorer sends it. They live beside
 * the vocabulary on purpose: a tag whose question drifts from its name is
 * a tag that means one thing in the store and another on the screen, and
 * nothing in the types would catch it.
 *
 * Each is a yes-or-no about the place itself, answerable from a name, a
 * category and whatever description line the place has. More than half the
 * places in the store have only a name and a category, and the questions
 * are written so that is usually enough: a thing called "Miller Overlook"
 * answers `big_view` from its name alone.
 */
export const TAG_QUESTIONS: Readonly<Record<RoadsideTag, string>> = {
  big_view: "This place exists to be looked out from: an overlook, a scenic pullout, a lookout, an observation deck or a vista point.",
  waterfall: "This place is a waterfall, a falls or a cascade.",
  rock_and_cave: "This place is a natural rock formation, a canyon, a gorge, a cave, a cavern, an arch, a butte or dunes.",
  garden: "This place is a planted garden, an arboretum, a botanical garden or a formal green space made to walk through.",
  old_building:
    "This place is a standing building or a ruin kept for its age: a fort, a mission, a courthouse, a jail, a schoolhouse, a homestead, a mill, a ghost town or a preserved historic house.",
  war_memorial: "This place commemorates a war, a battle or the people who fought in one: a battlefield, a war memorial, a veterans memorial, a preserved cannon, tank, ship or aircraft.",
  pioneer: "This place is about settling or crossing the frontier: a wagon trail, a stagecoach stop, a pony express station, a pioneer homestead or a settler monument.",
  native_american: "This place is a Native American site or memorial: a pueblo, a mound, petroglyphs, pictographs, a tribal cultural centre, or a monument to Native American people or history.",
  public_art: "This place is a work of art made to be seen in public: a sculpture, a statue, a mural, an installation or a carving.",
  museum: "This place is a museum, a heritage centre or a collection open to visitors.",
  science_and_space:
    "This place is about science, space or flight: an observatory, a planetarium, a rocket or missile, an aircraft or aviation collection, a science centre or a research site open to visitors.",
  roadside_oddity:
    "This place is a roadside oddity: strange, homemade, kitsch or funny, the kind of thing people pull over to photograph because it is odd rather than because it is important.",
  giant_thing: "This place is an oversized object built to be seen from the road, or claims to be the world's largest or biggest of something.",
  trains_and_industry:
    "This place is about railways or industry: a depot, a station, a locomotive, a caboose, a roundhouse, a mine, a mill, a furnace or a preserved factory.",
  bridge_or_tower: "This place is a structure worth looking at in itself: a notable bridge, an observation or water tower, a lighthouse, a windmill or a fire lookout.",
  cars_and_racing: "This place is about cars, motorcycles or racing: a speedway, a raceway, a drag strip, a car collection, or a landmark of a famous driving road such as Route 66.",
  famous_food:
    "This place is somewhere to eat or drink that people travel to on purpose: a landmark restaurant, a famous diner, a historic saloon, a destination barbecue, bakery, brewery or winery. An ordinary local restaurant is not.",
  sports_place: "This place is about sport: a stadium, an arena, a ballpark, a racetrack, a hall of fame, or a site where something famous in sport happened.",
};

/**
 * The vocabulary as the tagging bench reads it.
 *
 * The bench lives in another repository (jev-lab,
 * `bench/roadside_tag_score.py`) and reads `data/tag-questions.json`
 * rather than keeping its own copy of the eighteen questions, so that a
 * tag cannot come to mean one thing to the scorer that wrote the score
 * and another to the list that ranks on it. The shape is fixed by that
 * reader: `tags` in order, `questions` by tag, `moods` as the roll-up.
 *
 * `scripts/export-tag-questions.ts` is the only writer, and
 * `__tests__/tags.test.ts` compares the committed file with these bytes,
 * so editing a question without re-exporting fails CI rather than
 * silently splitting the vocabulary in two.
 */
export function tagQuestionsDocument(): {
  tags: RoadsideTag[];
  questions: Record<string, string>;
  moods: Record<string, RoadsideTag[]>;
} {
  return {
    tags: [...ROADSIDE_TAGS],
    questions: Object.fromEntries(ROADSIDE_TAGS.map((t) => [t, TAG_QUESTIONS[t]])),
    moods: Object.fromEntries(MOODS.map((m) => [m, [...MOOD_CONFIG[m].tags]])),
  };
}

/** The exact bytes `data/tag-questions.json` should hold. */
export function tagQuestionsJson(): string {
  return `${JSON.stringify(tagQuestionsDocument(), null, 1)}\n`;
}

/**
 * The chosen moods from a URL parameter, e.g. `?moods=food,outdoors`.
 *
 * Everything unreadable is dropped rather than defaulted: an unknown word,
 * a repeat, or more than `MAX_MOODS` of them. A link someone edited by
 * hand, or one made before a mood was renamed, then lands on the screen at
 * rest — which is a real state the screens already have — instead of
 * throwing or silently choosing a mood the person did not ask for.
 *
 * Order is kept, because `toggleMood` drops the one chosen longest ago and
 * that has to mean the same thing after a reload as before it.
 */
export function parseMoods(raw: unknown): MoodId[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const known = new Set<string>(MOODS);
  const out: MoodId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!known.has(id) || out.includes(id as MoodId)) continue;
    out.push(id as MoodId);
    if (out.length === MAX_MOODS) break;
  }
  return out;
}

/** The URL parameter for the chosen moods, one name for every screen that writes it. */
export const MOODS_PARAM = "moods";
