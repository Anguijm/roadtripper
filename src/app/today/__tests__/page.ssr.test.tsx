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
    expect(html).not.toContain("7 h 30 min");        // the doubled number must not appear
    expect(html).not.toContain("Denver");
    expect(html).toContain("One-way drive times");
    // Not a dead end: every city links into the planner with both ends filled.
    expect(html).toContain("Plan a trip here");
    expect(html).toMatch(/href="\/\?fromName=[^"]*fromLat=35\.2073[^"]*toName=Albuquerque[^"]*toLat=/);
  });

  it("without a point shows the start screen and never touches the browser", async () => {
    const html = await render({});
    expect(html).toContain("What is in range today?");
    expect(html).toContain("Use where I am");
    expect(html).toContain("Pick where you are first");
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

  it("renders a supplied name as text, bounded", async () => {
    const html = await render({ lat: "35.2073", lng: "-101.8338", name: "<b>x</b>" + "y".repeat(200) });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("y".repeat(100));
  });
});
