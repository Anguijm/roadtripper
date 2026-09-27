import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/actions/snapOrigin", () => ({ snapOriginAction: vi.fn() }));

import Home from "@/app/page";

const render = async (params: Record<string, string>) =>
  renderToString(await Home({ searchParams: Promise.resolve(params) }));

describe("the home page, server-rendered", () => {
  it("opens empty by default", async () => {
    const html = await render({});
    expect(html).toContain("Plan your road trip");
    expect(html).toContain("Just today");
    expect(html).not.toContain('value="Near Amarillo"');
  });

  it("opens with both ends filled when handed off from the today screen", async () => {
    const html = await render({
      fromName: "Near Amarillo", fromLat: "35.2073", fromLng: "-101.8338",
      toName: "Albuquerque", toLat: "35.0844", toLng: "-106.6504",
    });
    expect(html).toContain('value="Near Amarillo"');
    expect(html).toContain('value="Albuquerque"');
  });

  it("opens in arrive-by mode with the date when handed a deadline", async () => {
    const html = await render({ dateMode: "arrival", endDate: "2026-10-14" });
    expect(html).toContain("Arrive by Oct 14");
    // a bad date opens the picker with nothing selected
    expect(await render({ dateMode: "arrival", endDate: "2026-02-31" })).toContain("Select arrival date");
    // no mode means a range, whatever the dates
    expect(await render({ startDate: "2026-10-10", endDate: "2026-10-14" })).toContain("Oct 10 → Oct 14");
  });

  it("ignores a handoff with bad coordinates and escapes the names", async () => {
    expect(await render({ fromName: "x", fromLat: "999", fromLng: "0" })).not.toContain('value="x"');
    const html = await render({ fromName: "<b>x</b>", fromLat: "35.2", fromLng: "-101.8" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
