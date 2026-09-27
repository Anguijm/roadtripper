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
  it("renders without touching the browser and offers the location button", () => {
    const html = renderToString(<RouteInput />);
    expect(html).toContain("Use where I am");
    expect(html).toContain("Start city");
    expect(html).not.toContain("Finding you");
  });
});
