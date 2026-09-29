import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

import MoodChips, { MOOD_LABEL } from "@/components/MoodChips";
import { PERSONAS, PERSONA_ORDER, type PersonaId } from "@/lib/personas";

/**
 * The mood chips as one component (Gauntlet U5; quality bar, rules 1, 2, 3
 * and 7). Rendered on the server standalone, as every screen renders it:
 * the label, a chip per mood with its icon and word, the active one
 * marked and filled, 48 px targets in a wrapping row that never scrolls
 * sideways, the runner's `data-mood-chips` on the root. Four moods first
 * (the spec's acceptance), then the project's five. That every screen
 * shows this same markup is glossary.ssr.test.tsx's, which finds this
 * render inside each screen's.
 */

const FOUR: readonly PersonaId[] = ["culture", "foodie", "nerd", "gearhead"];
const noop = () => {};

/** React writes the apostrophe as an entity. */
const render = (el: React.ReactElement) => renderToString(el).replace(/&#x27;/g, "'");
const chipsOf = (html: string) => html.match(/<button[^>]*role="radio"[^>]*>.*?<\/button>/g) ?? [];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the mood chips, server-rendered", () => {
  it("with four moods renders four chips, each with its icon and its word, in the order given", () => {
    const html = render(<MoodChips activeId="foodie" onChange={noop} moods={FOUR} />);
    const chips = chipsOf(html);
    expect(chips).toHaveLength(4);
    FOUR.forEach((id, i) => {
      expect(chips[i]).toContain(`<span aria-hidden="true" class="text-base leading-none">${PERSONAS[id].glyph}</span>`);
      expect(chips[i]).toContain(`<span>${PERSONAS[id].label}</span>`);
    });
    expect(html).not.toContain(PERSONAS.outdoorsman.label);
  });

  it("says the label, I'm in the mood for, once above the chips and names the group with it", () => {
    const html = render(<MoodChips activeId="foodie" onChange={noop} moods={FOUR} />);
    expect(html).toMatch(new RegExp(`<p class="[^"]*text-base[^"]*">${MOOD_LABEL}</p><div role="radiogroup" aria-label="${MOOD_LABEL}"`));
    expect(text(html).indexOf(MOOD_LABEL)).toBeLessThan(text(html).indexOf(PERSONAS.culture.label));
    expect(text(html).match(new RegExp(MOOD_LABEL, "g"))).toHaveLength(1);
    expect(MOOD_LABEL).toBe("I'm in the mood for");
  });

  it("marks the active chip alone as checked and fills it with its mood's colour; null marks none", () => {
    const html = render(<MoodChips activeId="foodie" onChange={noop} moods={FOUR} />);
    const chips = chipsOf(html);
    const checked = chips.filter((c) => c.includes('aria-checked="true"'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(PERSONAS.foodie.label);
    expect(checked[0]).toContain(`style="background-color:${PERSONAS.foodie.accentColor}"`);
    expect(checked[0]).toMatch(/class="[^"]*\bfont-semibold\b/);
    for (const c of chips.filter((c) => c.includes('aria-checked="false"'))) {
      expect(c).not.toContain("style=");
      expect(c).toMatch(/class="[^"]*\bbg-transparent\b/);
    }
    const none = render(<MoodChips activeId={null} onChange={noop} moods={FOUR} />);
    expect(none).not.toContain('aria-checked="true"');
    expect(chipsOf(none)).toHaveLength(4);
    expect(none).not.toContain("style=");
  });

  it("gives every chip a 48 px target in a wrapping row that never scrolls sideways, sharing the row three then two", () => {
    const html = render(<MoodChips activeId="foodie" onChange={noop} moods={FOUR} />);
    expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*\bflex flex-wrap\b/);
    expect(html).not.toContain("overflow-x");
    expect(html).not.toMatch(/class="[^"]*\b(?:truncate|line-clamp-\d|text-(?:xs|sm|\[1[0-5]px\]))\b/);
    for (const chip of chipsOf(html)) {
      expect(chip).toMatch(/class="[^"]*\bmin-h-\[48px\]/);
      expect(chip).toMatch(/class="[^"]*\btext-base\b/);
      expect(chip).toMatch(/class="[^"]*\bgrow\b[^"]*\bbasis-\[30%\]/);
      expect(chip).toMatch(/^<button type="button" role="radio" aria-checked="(?:true|false)"/);
    }
  });

  it("carries data-mood-chips on its root, for the runner to find on every screen", () => {
    const html = render(<MoodChips activeId="foodie" onChange={noop} moods={FOUR} />);
    expect(html).toMatch(/^<div data-mood-chips="true" class="[^"]*">/);
    expect(html.match(/data-mood-chips/g)).toHaveLength(1);
  });

  it("with no list renders the project's five, in PERSONA_ORDER, the words plain and short", () => {
    const html = render(<MoodChips activeId="culture" onChange={noop} />);
    const chips = chipsOf(html);
    expect(chips).toHaveLength(5);
    expect(chips.map((c) => /<span>([^<]*)<\/span>/.exec(c)?.[1])).toEqual(PERSONA_ORDER.map((id) => PERSONAS[id].label));
    expect(PERSONA_ORDER.map((id) => PERSONAS[id].label)).toEqual(["Culture", "Food", "Nerd", "Gear", "Outdoors"]);
    expect(chips.filter((c) => c.includes('aria-checked="true"'))).toHaveLength(1);
    expect(chips[0]).toContain('aria-checked="true"');
    // The same markup as the four, but for the chips: nothing about the
    // root, the label or the group changes with the count.
    const four = render(<MoodChips activeId="culture" onChange={noop} moods={FOUR} />);
    const shell = (h: string) => h.replace(/<button.*<\/button>/, "");
    expect(shell(html)).toBe(shell(four));
  });
});
