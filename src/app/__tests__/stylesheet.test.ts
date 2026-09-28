import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

/**
 * The stylesheet the screens are painted with, compiled from this tree the
 * way the build compiles it: Tailwind through PostCSS, the sources found
 * from the project root (Gauntlet U2, round 3; quality bar, rules 2 and 7).
 *
 * Why: the round-2 critic measured the hour buttons and the mood chips at
 * 26 px with `min-h-[48px]` on every one of them. The runner's dev server
 * had restored round 1's stylesheet from `.next/dev/cache/webpack`, and
 * that sheet had no rule for the class, no `.plan-sheet-visible`, and the
 * `line-clamp` rules round 2 had removed. A class in the markup is nothing
 * without its rule, so this reads the rules. It cannot see what a stale
 * cache serves; it proves what this tree compiles to. The purge of `.next`
 * before a round's server is the runner's, noted in the active plan.
 */
const root = resolve(__dirname, "../../..");

async function compiled(): Promise<string> {
  const from = resolve(root, "src/app/globals.css");
  const result = await postcss([tailwind({ base: root })]).process(readFileSync(from, "utf8"), { from });
  return result.css.replace(/\s+/g, " ");
}

describe("the stylesheet, compiled from this tree", () => {
  it("holds the rules the screens' classes name: 48 px chips, 44 px targets, the 16 px body face, the number face, the sheet's column", async () => {
    const css = await compiled();
    // The hour buttons and the mood chips (rule 7), and every other target.
    expect(css).toContain(".min-h-\\[48px\\] { min-height: 48px; }");
    expect(css).toContain(".min-h-\\[44px\\] { min-height: 44px; }");
    // The body face at 16 px, Geist sans; the mono face only through `.num`.
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-geist-sans\)[^}]*font-size: 1rem;/);
    expect(css).toMatch(/\.num \{ font-family: var\(--font-geist-mono\)[^}]*tabular-nums; \}/);
    // The sheet's column and its scroll box (round 2), so "Show all N" sits
    // above the fold instead of below the screen's edge.
    expect(css).toMatch(/\.plan-sheet-visible \{ display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;/);
    expect(css).toMatch(/\.plan-sheet-scroll \{ flex: 1 1 0%; min-height: 0; \}/);
    // Not checked here: that no `truncate` or `line-clamp` rule is emitted.
    // The scan reads every file in the tree, this test and the glossary
    // test among them, and a word in a test is enough to emit the rule; a
    // cut is a class on a name, and glossary.ssr.test.tsx reads the names.
    //
    // Thirty seconds, not the suite's five: Tailwind's compile scans the
    // whole tree for class names before it emits a rule, and the scan is
    // disk-bound. Here it takes about 0.4 s and the default would pass; the
    // headroom is for a CI runner with a cold disk and two cores, where a
    // timeout would read as a broken stylesheet when nothing about the
    // stylesheet changed. The number is headroom, not a measurement of a
    // slow run.
  }, 30_000);
});
