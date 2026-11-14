import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import Figures from "@/components/Figures";

/** A figure and its unit stay on one line (U28); km since trips abroad read km (John, 2026-11-15). */
describe("Figures", () => {
  it("keeps 800 km, 497 mi, 8 h and 3 min each on one line, digits in mono", () => {
    const html = renderToString(<Figures text="800 km · 8 h 3 min on the road, 497 mi" />).replace(/<!-- -->/g, "");
    for (const [n, unit] of [["800", "km"], ["8", "h"], ["3", "min"], ["497", "mi"]]) {
      expect(html).toMatch(new RegExp(`<span class="whitespace-nowrap">(· )?<span class="num">${n}</span> ${unit}</span>`));
    }
  });
});
