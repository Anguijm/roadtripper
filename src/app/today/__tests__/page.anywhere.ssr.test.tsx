import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("lat=40.74&lng=-84.11&hours=4"),
}));
vi.mock("@/app/actions/snapOrigin", () => ({
  snapOriginAction: vi.fn(),
}));

import TodayPage from "@/app/today/page";
import DriveBudgetSelector from "@/components/DriveBudgetSelector";
import { todayIso } from "@/lib/plan/deadline";

/**
 * U53 (John, 2026-11-14: "Both: between towns + long days"): the /today page
 * answers between towns and on 10 h, 12 h and No limit, as the car does.
 */

const render = async (params: Record<string, string>) =>
  renderToString(await TodayPage({ searchParams: Promise.resolve(params) }));
/** Text as read, tags gone and React's comment markers too. */
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const daysFromNow = (days: number) => {
  const d = new Date(todayIso() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** On I-75, 109 km from Dayton and 112 from Toledo: no atlas town within 40 km. */
const NEAR_LIMA = { lat: "40.74", lng: "-84.11" };
/** Central Nevada, 161 km from Elko. */
const NEVADA = { lat: "39.5", lng: "-116.5" };
const AMARILLO = { lat: "35.2073", lng: "-101.8338" };

afterEach(() => vi.restoreAllMocks());

describe("between towns", () => {
  it("answers from the point, says how far the nearest town is, and lists it with about", async () => {
    const t = text(await render({ ...NEAR_LIMA, hours: "4", name: "Your location" }));
    expect(t).not.toContain("Not near a city we know");
    expect(t).toContain('From your location, 109 km from Dayton. Drive times are one way. Times that say "about" are estimates by straight line.');
    // 79 and 81 minutes by the estimate, said to the nearest 10.
    expect(t).toMatch(/Dayton about 1 h 20 min away/);
    expect(t).toMatch(/Toledo about 1 h 20 min away/);
  });

  it("never names you after the nearest town when the link has no name", async () => {
    const t = text(await render({ ...NEAR_LIMA, hours: "4" }));
    expect(t).toContain("From your location, 109 km from Dayton.");
  });

  it("keeps the notice past 650 km from every town, and says 650", async () => {
    const t = text(await render({ lat: "30", lng: "-150", hours: "5" }));
    expect(t).toContain("Not near a city we know");
    expect(t).toContain("within 650 km");
  });

  it("in a town, says no about", async () => {
    const t = text(await render({ ...AMARILLO, hours: "5" }));
    expect(t).not.toContain("about ");
    expect(t).not.toContain('say "about"');
    expect(t).toMatch(/\d+ cities within 5 hours/);
  });
});

describe("longer days", () => {
  it("on 12 hours from Fargo, reads about on towns past the drive graph and not on its own", async () => {
    // Fargo's graph holds 8 towns within 650 km; the ninth and tenth nearest are past it.
    const t = text(await render({ lat: "46.8772", lng: "-96.7898", hours: "12", name: "Fargo" }));
    expect(t).toContain('Times that say "about" are estimates by straight line.');
    const abouts = [...t.matchAll(/about (\d+) h( (\d+) min)? away/g)];
    expect(abouts.length).toBeGreaterThanOrEqual(1);
    for (const a of abouts) expect(Number(a[3] ?? 0) % 10).toBe(0);
    expect(t).toMatch(/Minneapolis \d+ h( \d+ min)? away/);
  });

  it("takes 10 and 12 hours", async () => {
    expect(text(await render({ ...AMARILLO, hours: "12" }))).toMatch(/\d+ cities within 12 hours/);
    expect(text(await render({ ...AMARILLO, hours: "10" }))).toMatch(/\d+ cities within 10 hours/);
  });

  it("on No limit, says so with no count, shows the nearest, and keeps any in the change link", async () => {
    const html = await render({ ...NEVADA, hours: "any", name: "Your location" });
    const t = text(html);
    expect(t).toContain("The nearest cities, no time limit");
    expect(t).not.toMatch(/cities within/);
    expect(t).toContain("Showing the nearest 10.");
    expect(t).not.toMatch(/Showing the nearest 10 of/);
    expect(html).toMatch(/href="\/today\?hours=any/);
    // 116 minutes by the estimate: about 2 h.
    expect(t).toMatch(/Elko about 2 h away/);
  });

  it("leaves out the deadline's line on No limit, which has no daily budget to count by", async () => {
    const deadline = { arriveBy: daysFromNow(3), toName: "Austin", toLat: "30.2672", toLng: "-97.7431" };
    expect(text(await render({ ...AMARILLO, hours: "5", ...deadline }))).toContain("you still make");
    const any = text(await render({ ...AMARILLO, hours: "any", ...deadline }));
    expect(any).toContain("Arrive in Austin by");
    expect(any).not.toContain("you still make");
    expect(any).not.toContain("you miss");
  });
});

describe("the chips", () => {
  it("offer 2 to 12 h and No limit on the start screen, with the link's choice pressed", async () => {
    const start = await render({ hours: "any" });
    const chips = [...start.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[2], m[1]]);
    expect(chips.map((c) => c[0])).toEqual(["2 h", "3 h", "4 h", "5 h", "6 h", "8 h", "10 h", "12 h", "No limit"]);
    expect(chips.filter((c) => c[1] === "true").map((c) => c[0])).toEqual(["No limit"]);
    const twelve = await render({ hours: "12" });
    expect(twelve).toMatch(/aria-pressed="true"[^>]*>12 h</);
  });

  it("leave /plan's daily budget at 2 to 8 h", () => {
    const html = renderToString(createElement(DriveBudgetSelector, { value: 5, onChange: () => {} }));
    const labels = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    expect(labels).toEqual(["2 h", "3 h", "4 h", "5 h", "6 h", "8 h"]);
  });
});
