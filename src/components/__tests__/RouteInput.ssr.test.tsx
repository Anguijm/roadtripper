import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/actions/snapOrigin", () => ({
  snapOriginAction: vi.fn(),
}));

import RouteInput from "@/components/RouteInput";

/**
 * The home page is the first thing that renders, and it renders on the
 * server first. Node has a `navigator` with no `geolocation`, so any read of
 * `navigator.geolocation.getCurrentPosition` or `navigator.permissions.query`
 * during render throws here, exactly as it would in Cloud Run.
 */
describe("RouteInput server render", () => {
  it("renders without touching the browser and offers the location control inside the From box", () => {
    const html = renderToString(<RouteInput />);
    expect(html).toContain('aria-label="Here, use where I am"');
    expect(html).toContain("Here</button>");
    expect(html).toContain("Start city");
    expect(html).not.toContain("Finding you");
    // The fold is closed with nothing handed in, and open when a date is.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(renderToString(<RouteInput initialEndDate="2026-10-14" />)).toContain('aria-haspopup="dialog"');
    expect(renderToString(<RouteInput initialDateMode="arrival" />)).toContain("Pick the arrival date");
  });

  it("shows a given origin's name in the From box", () => {
    const html = renderToString(
      <RouteInput initialFrom={{ placeId: "geo:35.22000,-101.83000", name: "Near Amarillo", lat: 35.22, lng: -101.83 }} />
    );
    expect(html).toContain('value="Near Amarillo"');
  });
});
