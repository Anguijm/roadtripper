import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * The shorter home (Gauntlet U4): three things and the button, the dates
 * and the mood under one fold, an example line with two real names. The
 * page is rendered on the server as /health renders it, with the store's
 * names replaced by a fixture so the test reads the same whether or not a
 * store sits in data/ (the store-backed rule has its own test in
 * src/lib/roadside/__tests__/examples.test.ts).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/actions/snapOrigin", () => ({ snapOriginAction: vi.fn() }));
vi.mock("@/lib/roadside/examples", () => ({
  homeExampleNames: () => ["Meteor Crater", "The Thing"] as const,
}));

import Home from "@/app/page";
import { MORE_CLOSED_LABEL, MORE_OPEN_LABEL } from "@/components/RouteInput";
import { exampleLine } from "@/lib/plan/words";

/** React puts a comment between adjacent text and an expression, and writes the apostrophe as an entity. */
const render = async (params: Record<string, string>) =>
  renderToString(await Home({ searchParams: Promise.resolve(params) }))
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");

/** The disclosure control: the one button with aria-expanded and no popup. */
const disclosure = (html: string) => /<button[^>]*aria-expanded="(true|false)"(?![^>]*aria-haspopup)[^>]*>(.*?)<\/button>/.exec(html);

describe("the home's fold, server-rendered", () => {
  it("keeps the dates and the mood folded under More when the URL carries no date", async () => {
    const html = await render({});
    const control = disclosure(html);
    expect(control?.[1]).toBe("false");
    expect(control?.[2]).toContain(MORE_CLOSED_LABEL);
    expect(control?.[0]).toMatch(/class="[^"]*\bmin-h-\[44px\]/);
    // Closed, the dates control and the chips are not in the markup.
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Trip dates");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain(MORE_OPEN_LABEL + "</button>");
    // Between the title and the button: the example line, From, To, the
    // hours; the fold comes after the button and its reason.
    const order = ["Plan your road trip", "along your road.", ">From<", ">To<", "Each day I will drive up to", "Plan the trip", "Choose where you start first", MORE_CLOSED_LABEL, "Built on Urban Explorer"];
    const at = order.map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0), order.filter((_, i) => at[i] < 0).join(", ")).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toMatch(/<button type="submit" disabled="" [^>]*>Plan the trip<\/button>/);
  });

  it("opens More when the URL carries dateMode, startDate or endDate, however they parse", async () => {
    const carried: Record<string, string>[] = [
      { dateMode: "arrival", endDate: "2026-10-14" },
      { startDate: "2026-10-10", endDate: "2026-10-14" },
      { dateMode: "range" },
      { endDate: "2026-02-31" },
    ];
    for (const params of carried) {
      const html = await render(params);
      const control = disclosure(html);
      expect(control?.[1], JSON.stringify(params)).toBe("true");
      expect(control?.[2], JSON.stringify(params)).toContain(MORE_OPEN_LABEL);
      expect(html, JSON.stringify(params)).toContain('aria-haspopup="dialog"');
      expect(html, JSON.stringify(params)).toContain("Trip dates");
      expect(html, JSON.stringify(params)).toContain('role="radiogroup"');
      expect(html, JSON.stringify(params)).toContain("I'm in the mood for");
    }
    // A handed-in deadline shows in the fold; a bad date opens the fold with nothing picked.
    expect(await render({ dateMode: "arrival", endDate: "2026-10-14" })).toContain("Arrive by <span class=\"num\">Oct 14</span>");
    expect(await render({ endDate: "2026-02-31" })).toContain("Pick the dates");
  });

  it("puts Use where I am inside the From box, at its right end, with the words on it", async () => {
    const html = await render({});
    // The input and the control share the box: the button follows the
    // input inside the same element, nothing between them.
    expect(html).toMatch(/<input[^>]*placeholder="Start city"[^>]*\/?><button[^>]*aria-label="Use where I am"[^>]*>/);
    const control = /<button[^>]*aria-label="Use where I am"[^>]*>(.*?)<\/button>/.exec(html);
    expect(control?.[0]).toMatch(/class="[^"]*\bmin-h-\[44px\]/);
    expect(control?.[1].replace(/<[^>]+>/g, "")).toContain("Where I am");
    // Not a second button under the field.
    expect(html.match(/Use where I am/g)?.length).toBe(1);
    expect(html).not.toContain("Finding you");
  });

  it("says what comes back with the store's two names, in a sentence under the title", async () => {
    const html = await render({});
    expect(html).toContain("Places like the Meteor Crater and the Thing, along your road.");
    expect(html.indexOf("Plan your road trip")).toBeLessThan(html.indexOf("Places like the Meteor Crater"));
    expect(html).not.toContain("Where you start, where you end");
  });

  it("pins the sentence's shape: the fixture, a name that already starts with The, and the fallback", () => {
    expect(exampleLine(["Cadillac Ranch", "the Big Texan"])).toBe("Places like the Cadillac Ranch and the Big Texan, along your road.");
    expect(exampleLine(["Meteor Crater", "The Thing"])).toBe("Places like the Meteor Crater and the Thing, along your road.");
    expect(exampleLine([" The Big Texan Steak Ranch ", "Blue Whale of Catoosa"])).toBe("Places like the Big Texan Steak Ranch and the Blue Whale of Catoosa, along your road.");
  });
});
