import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("lat=35.2073&lng=-101.8338&hours=5"),
}));
vi.mock("@/app/actions/snapOrigin", () => ({
  snapOriginAction: vi.fn(),
}));

import TodayPage from "@/app/today/page";
import MoodChips from "@/components/MoodChips";
import { todayIso, formatDeadline } from "@/lib/plan/deadline";

/** A date `days` from today, as the page will count it. */
const daysFromNow = (days: number) => {
  const d = new Date(todayIso() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const render = async (params: Record<string, string>) =>
  renderToString(await TodayPage({ searchParams: Promise.resolve(params) }));

afterEach(() => vi.restoreAllMocks());

describe("the today screen, server-rendered", () => {
  it("answers 'five hours from Amarillo' from the atlas alone, with no network call", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => { throw new Error("the today screen must not call out"); });

    const html = await render({ lat: "35.2073", lng: "-101.8338", hours: "5", persona: "nerd" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toMatch(/\d+ cities within 5 hours/);
    expect(html).toContain("Albuquerque");
    expect(html).toContain("3 h 45 min");           // one-way, from the graph, not doubled
    // The time in the mono face, "away" in the body face (quality bar, rule 2).
    expect(html).toContain('<span class="num">3 h 45 min</span> away');
    expect(html).not.toMatch(/class="[^"]*\bnum\b[^"]*"[^>]*>[^<]*away</);
    expect(html).not.toContain("7 h 30 min");        // the doubled number must not appear
    expect(html).not.toContain("Denver");
    expect(html).toContain("Drive times are one way.");
    // No stop is a bare name: every spot rendered carries its reason.
    const spots = html.match(/data-spot/g)?.length ?? 0;
    const reasons = html.match(/data-reason/g)?.length ?? 0;
    expect(spots).toBeGreaterThan(0);
    expect(reasons).toBe(spots);
    // Not a dead end: every city links into the planner with both ends filled.
    expect(html).toContain("Plan a trip here");
    expect(html).toMatch(/href="\/\?fromName=[^"]*fromLat=35\.2073[^"]*toName=Albuquerque[^"]*toLat=/);
  });

  it("mounts the one mood component on the results with the URL's mood checked: its render found byte for byte, once", async () => {
    // Gauntlet U5: TodayMoodChips is the results' wiring (a tap changes
    // the URL); the markup is MoodChips', the same as on every screen.
    const html = await render({ lat: "35.2073", lng: "-101.8338", hours: "5", moods: "museums" });
    const chips = renderToString(<MoodChips chosen={["museums"]} onToggle={() => {}} />);
    expect(chips).toContain('aria-pressed="true"');
    expect(html).toContain(chips);
    expect(html.match(/data-mood-chips/g)).toHaveLength(1);
    // The start screen, before a point, mounts it too.
    const start = await render({});
    expect(start).toContain(renderToString(<MoodChips chosen={[]} onToggle={() => {}} />));
    expect(start.match(/data-mood-chips/g)).toHaveLength(1);
  });

  it("without a point shows the start screen and never touches the browser", async () => {
    const html = await render({});
    expect(html).toContain("What is in range today?");
    expect(html).toContain("Use where I am");
    // The button keeps its verb; the reason it cannot be pressed is a line
    // beside it (quality bar, rule 3).
    expect(html).toContain("Show me what&#x27;s in range");
    expect(html).toContain("Choose where you are first");
    expect(html).not.toContain("Pick where you are first");
    expect(html).toContain("5 h");
  });

  it("treats garbage or blank coordinates as no point, never as Null Island", async () => {
    for (const p of [{ lat: "abc", lng: "-101" }, { lat: "", lng: "" }, { lat: " ", lng: "-101.8" }, { lat: "35.2", lng: "" }]) {
      const html = await render(p);
      expect(html).toContain("What is in range today?");
      expect(html).not.toContain("Not near a city we know");
    }
  });

  it("says so, and offers typing, when no atlas city is near the point", async () => {
    const html = await render({ lat: "30", lng: "-150", hours: "5" });
    expect(html).toContain("Not near a city we know");
    expect(html).toContain("Type a city");
  });

  it("knows the deadline when a link carries one, and passes it into the planner", async () => {
    const withDeadline = { lat: "35.2073", lng: "-101.8338", hours: "5", arriveBy: "2026-10-14", toName: "Austin", toLat: "30.2672", toLng: "-97.7431" };
    const html = await render(withDeadline);
    expect(html).toContain("Arrive in Austin by Oct 14");
    expect(html).toContain("Plan the trip to Austin from here");
    expect(html).toMatch(/href="\/\?[^"]*toName=Austin[^"]*dateMode=arrival[^"]*endDate=2026-10-14/);
    // the per-city links are trips to those cities, not to the deadline; they carry no date
    expect(html).toMatch(/href="\/\?[^"]*toName=Albuquerque[^"]*"/);
    expect(html).not.toMatch(/toName=Albuquerque[^"]*dateMode=arrival/);
    // the change link keeps the deadline
    expect(html).toMatch(/href="\/today\?[^"]*arriveBy=2026-10-14/);

    // the start screen knows it too
    const start = await render({ arriveBy: "2026-10-14", toName: "Austin", toLat: "30.2672", toLng: "-97.7431" });
    expect(start).toContain("What is in range today?");
    expect(start).toContain("Arrive in Austin by Oct 14");
  });

  it("says how long you can stay in each city and still make the deadline", async () => {
    const endDate = daysFromNow(3);
    const html = await render({ lat: "35.2073", lng: "-101.8338", hours: "5", arriveBy: endDate, toName: "Austin", toLat: "30.2672", toLng: "-97.7431" });
    const by = `Austin by ${formatDeadline(endDate)}`;
    // Lubbock: reach today, two driving days on, so two nights (hand-checked in feasibility.test.ts)
    expect(html).toContain(`Two nights here and you still make ${by}.`);
    // Albuquerque: no graph pair to Austin, so the estimate says so
    expect(html).toMatch(new RegExp(`Roughly [a-z]+ nights? here and you still make ${by}\\.`));

    // the deadline today: the answer is no, and it says so
    const today = await render({ lat: "35.2073", lng: "-101.8338", hours: "5", arriveBy: daysFromNow(0), toName: "Austin", toLat: "30.2672", toLng: "-97.7431" });
    expect(today).toContain("Stop here and you miss Austin: one day late even driving straight on.");

    // without a deadline, no such line anywhere
    const plain = await render({ lat: "35.2073", lng: "-101.8338", hours: "5" });
    expect(plain).not.toContain("you still make");
    expect(plain).not.toContain("you miss");
  });

  it("ignores a deadline that is not a real date or has no destination", async () => {
    const cases: Record<string, string>[] = [
      { arriveBy: "2026-02-31", toName: "Austin", toLat: "30.2672", toLng: "-97.7431" },
      { arriveBy: "2026-10-14", toName: "Austin" },
      { arriveBy: "2026-10-14", toName: "Austin", toLat: "", toLng: "" },
    ];
    for (const p of cases) {
      const html = await render({ lat: "35.2073", lng: "-101.8338", hours: "5", ...p });
      expect(html).not.toContain("Arrive in");
      expect(html).not.toContain("dateMode=arrival");
    }
  });

  it("renders a supplied name as text, bounded", async () => {
    const html = await render({ lat: "35.2073", lng: "-101.8338", name: "<b>x</b>" + "y".repeat(200) });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("y".repeat(100));
  });
});
