import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import TripCard from "@/components/TripCard";
import type { SavedTrip } from "@/lib/trips/types";

const BASE: SavedTrip = {
  id: "t1",
  fromName: "Amarillo", toName: "Austin",
  fromLat: 35.2073, fromLng: -101.8338, toLat: 30.2672, toLng: -97.7431,
  budgetHours: 4, personaId: "nerd", stops: [],
  createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z",
};

const hrefOf = (html: string) => decodeURIComponent(html.match(/href="(\/plan\?[^"]+)"/)?.[1] ?? "");
/** The card's text with the date spans opened: the dates sit in `.num` spans and the words outside them (U2). */
const flat = (html: string) => html.replace(/<!-- -->/g, "").replace(/<\/?span[^>]*>/g, "");

describe("a saved trip card remembers the deadline", () => {
  it("reopens an arrival-date trip in arrival mode, with the start date left to be re-derived", () => {
    const html = renderToString(
      <TripCard trip={{ ...BASE, dateMode: "arrival", startDate: "2026-10-12", endDate: "2026-10-14" }} onDeleted={() => {}} />
    );
    const href = hrefOf(html);
    expect(href).toContain("dateMode=arrival");
    expect(href).toContain("endDate=2026-10-14");
    expect(href).not.toContain("startDate=");
    expect(flat(html)).toContain("Arrive by Oct 14, 2026");
    // The words are in the body face; only the date is in the mono face.
    expect(html).toContain('Arrive by <span class="num">Oct 14, 2026</span>');
  });

  it("reopens a range trip exactly as before, and a trip saved before the field existed", () => {
    const range = renderToString(
      <TripCard trip={{ ...BASE, startDate: "2026-10-10", endDate: "2026-10-14" }} onDeleted={() => {}} />
    );
    const href = hrefOf(range);
    expect(href).toContain("startDate=2026-10-10");
    expect(href).toContain("endDate=2026-10-14");
    expect(href).not.toContain("dateMode=");
    expect(range).not.toContain("Arrive by");
    expect(flat(range)).toContain("Oct 10, 2026 to Oct 14, 2026");
    expect(range).toContain('<span class="num">Oct 10, 2026</span> to <span class="num">Oct 14, 2026</span>');
  });
});
