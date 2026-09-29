import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

import MoodChips, { MOOD_LABEL, MOOD_GROUP_LABEL } from "@/components/MoodChips";
import { MOODS, MOOD_CONFIG, MAX_MOODS, toggleMood, type MoodId } from "@/lib/roadside/tags";

/**
 * The mood chips as one component (Gauntlet U5, U6; quality bar, rules 1,
 * 2, 3 and 7). Rendered on the server standalone, as every screen renders
 * it: the label, a chip per mood with its icon and word, the chosen ones
 * filled, 48 px targets in a wrapping row that never scrolls sideways, the
 * runner's `data-mood-chips` on the root. Four moods first (to show the
 * markup does not assume eight), then the project's eight.
 *
 * U6 made it a multi-select. `aria-pressed` replaces `aria-checked`, and
 * `role="group"` replaces `role="radiogroup"`, because two chips may be on
 * at once and a radiogroup promises they cannot be.
 *
 * That every screen shows this same markup is glossary.ssr.test.tsx's,
 * which finds this render inside each screen's.
 */

const FOUR: readonly MoodId[] = ["museums", "food", "oddities", "machines"];
const noop = () => {};

/** React writes the apostrophe as an entity. */
const render = (el: React.ReactElement) => renderToString(el).replace(/&#x27;/g, "'");
const chipsOf = (html: string) => html.match(/<button[^>]*aria-pressed="[^"]*"[^>]*>.*?<\/button>/g) ?? [];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the mood chips, server-rendered", () => {
  it("with four moods renders four chips, each with its word alone, in the order given", () => {
    const html = render(<MoodChips chosen={["food"]} onToggle={noop} moods={FOUR} />);
    const chips = chipsOf(html);
    expect(chips).toHaveLength(4);
    FOUR.forEach((id, i) => {
      expect(chips[i]).toContain(`<span>${MOOD_CONFIG[id].label}</span>`);
      // No glyph: U6 round 2 failed the geometric characters on rule 2.
      expect(chips[i]).not.toContain("aria-hidden");
    });
    expect(html).not.toContain(MOOD_CONFIG.outdoors.label);
  });

  it("says the label, I'm in the mood for, once above the chips and names the group with it", () => {
    const html = render(<MoodChips chosen={["food"]} onToggle={noop} moods={FOUR} />);
    expect(html).toMatch(new RegExp(`<p class="[^"]*text-base[^"]*">${MOOD_LABEL}</p><div role="group" aria-label="${MOOD_GROUP_LABEL}"`));
    expect(text(html).indexOf(MOOD_LABEL)).toBeLessThan(text(html).indexOf(MOOD_CONFIG.museums.label));
    expect(text(html).match(new RegExp(MOOD_LABEL, "g"))).toHaveLength(1);
    expect(MOOD_LABEL).toBe("I'm in the mood for");
  });

  it("tells a screen reader the group takes two, since the markup no longer says so", () => {
    // A radiogroup said "one of these" in its role. A group of toggles says
    // nothing about how many may be on, so the count is in the name, which
    // is read once on entering rather than after every tap.
    expect(MOOD_GROUP_LABEL).toBe(`${MOOD_LABEL}, choose up to ${MAX_MOODS}`);
    expect(MAX_MOODS).toBe(2);
    const html = render(<MoodChips chosen={[]} onToggle={noop} moods={FOUR} />);
    expect(html).not.toContain("radiogroup");
    expect(html).not.toContain("aria-checked");
  });

  it("marks each chosen chip pressed and fills it with its mood's colour; none chosen marks none", () => {
    const html = render(<MoodChips chosen={["food"]} onToggle={noop} moods={FOUR} />);
    const pressed = chipsOf(html).filter((c) => c.includes('aria-pressed="true"'));
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain(MOOD_CONFIG.food.label);
    expect(pressed[0]).toContain(`style="background-color:${MOOD_CONFIG.food.accentColor}"`);
    expect(pressed[0]).toMatch(/class="[^"]*\bfont-semibold\b/);
    for (const c of chipsOf(html).filter((c) => c.includes('aria-pressed="false"'))) {
      expect(c).not.toContain("style=");
      expect(c).toMatch(/class="[^"]*\bbg-transparent\b/);
    }
    const none = render(<MoodChips chosen={[]} onToggle={noop} moods={FOUR} />);
    expect(none).not.toContain('aria-pressed="true"');
    expect(chipsOf(none)).toHaveLength(4);
    expect(none).not.toContain("style=");
  });

  it("marks both chips pressed when two are chosen, each in its own colour", () => {
    // The whole point of U6: two at a time, and the screen has to show
    // which two. A single-select markup could not say this at all.
    const html = render(<MoodChips chosen={["food", "oddities"]} onToggle={noop} moods={FOUR} />);
    const pressed = chipsOf(html).filter((c) => c.includes('aria-pressed="true"'));
    expect(pressed).toHaveLength(2);
    // Each chip carries its own mood's colour. Asserted by pairing label
    // with colour rather than by position: the chips render in the list's
    // order, not the order they were chosen in, and a test that assumed
    // otherwise would break the day `MOODS` is reordered.
    for (const mood of ["food", "oddities"] as const) {
      const chip = pressed.find((c) => c.includes(`<span>${MOOD_CONFIG[mood].label}</span>`));
      expect(chip, mood).toBeDefined();
      expect(chip, mood).toContain(`style="background-color:${MOOD_CONFIG[mood].accentColor}"`);
    }
    // And the two that were not chosen are not filled.
    expect(chipsOf(html).filter((c) => c.includes('aria-pressed="false"'))).toHaveLength(2);
  });

  it("gives every chip a 48 px target in a wrapping row that never scrolls sideways, three to a row", () => {
    const html = render(<MoodChips chosen={["food"]} onToggle={noop} moods={FOUR} />);
    expect(html).toMatch(/role="group"[^>]*class="[^"]*\bflex flex-wrap\b/);
    expect(html).not.toContain("overflow-x");
    expect(html).not.toMatch(/class="[^"]*\b(?:truncate|line-clamp-\d|text-(?:xs|sm|\[1[0-5]px\]))\b/);
    for (const chip of chipsOf(html)) {
      expect(chip).toMatch(/class="[^"]*\bmin-h-\[48px\]/);
      expect(chip).toMatch(/class="[^"]*\btext-base\b/);
      expect(chip).toMatch(/class="[^"]*\bgrow\b[^"]*\bbasis-\[30%\]/);
      expect(chip).toMatch(/^<button type="button" aria-pressed="(?:true|false)"/);
    }
  });

  it("carries data-mood-chips on its root, for the runner to find on every screen", () => {
    const html = render(<MoodChips chosen={["food"]} onToggle={noop} moods={FOUR} />);
    expect(html).toMatch(/^<div data-mood-chips="true" class="[^"]*">/);
    expect(html.match(/data-mood-chips/g)).toHaveLength(1);
  });

  it("with no list renders the project's eight, in MOODS order, the words plain and short", () => {
    const html = render(<MoodChips chosen={["museums"]} onToggle={noop} />);
    const chips = chipsOf(html);
    expect(chips).toHaveLength(8);
    expect(chips.map((c) => /<span>([^<]*)<\/span>/.exec(c)?.[1])).toEqual(MOODS.map((m) => MOOD_CONFIG[m].label));
    expect(MOODS.map((m) => MOOD_CONFIG[m].label)).toEqual(["Outdoors", "History", "Art", "Museums", "Oddities", "Machines", "Food", "Sports"]);
    // Eight is what wraps three, three, two with no chip alone on a row.
    // Seven would leave one alone, which the U4 critic named as a failure.
    expect(MOODS.length % 3).not.toBe(1);
    expect(chips.filter((c) => c.includes('aria-pressed="true"'))).toHaveLength(1);
    // The same markup as the four, but for the chips: nothing about the
    // root, the label or the group changes with the count.
    const four = render(<MoodChips chosen={["museums"]} onToggle={noop} moods={FOUR} />);
    const shell = (h: string) => h.replace(/<button.*<\/button>/, "");
    expect(shell(html)).toBe(shell(four));
  });

  it("leaves the two-at-a-time rule to the screen, and toggleMood is that rule", () => {
    // The component is dumb on purpose: it reports a tap and renders what
    // it is given, so the sheet, the two forms and the URL can each own
    // their own state without three copies of the rule.
    expect(toggleMood(["food"], "oddities")).toEqual(["food", "oddities"]);
    expect(toggleMood(["food", "oddities"], "food")).toEqual(["oddities"]);
    // A third drops the one chosen longest ago, so a tap always shows.
    expect(toggleMood(["food", "oddities"], "museums")).toEqual(["oddities", "museums"]);
  });
});
