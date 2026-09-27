/**
 * The roadside record (step 18).
 *
 * A place worth pulling over for that belongs to no city: Cadillac Ranch,
 * a lighthouse, a waterfall by the highway. Urban Explorer cannot hold
 * these because every waypoint there needs a city and a neighbourhood. A
 * roadside record needs a name, a position, and where it came from. The
 * reason may be missing until step 23 writes it.
 */

import { z } from "zod/v4";

export const RoadsideKindSchema = z.enum([
  "attraction",
  "museum",
  "viewpoint",
  "artwork",
  "theme_park",
  "zoo",
  "historic",
  "lighthouse",
  "tower",
  "waterfall",
  "arch",
  "cave",
  "other",
]);
export type RoadsideKind = z.infer<typeof RoadsideKindSchema>;

export const RoadsideStopSchema = z.object({
  /** Source-qualified, so two sources cannot collide: "osm:node:123". */
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: RoadsideKindSchema,
  source: z.enum(["osm", "wikidata", "google"]),
  /** Why you would stop. Null until step 23; untrusted text, render as text only. */
  reason: z.string().max(240).nullable(),
  /** A Wikidata Q-id when the source carried one; the door to a real reason. */
  wikidata: z.string().regex(/^Q\d+$/).nullable(),
  /** "en:Cadillac Ranch" style, when the source carried one. */
  wikipedia: z.string().max(200).nullable(),
});
export type RoadsideStop = z.infer<typeof RoadsideStopSchema>;

/** The slice of an Overpass element this needs. */
export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Which of our kinds an OSM tag set is, or null if it is none of them. */
export function kindFromTags(tags: Record<string, string>): RoadsideKind | null {
  const t = tags.tourism;
  if (t === "attraction") return "attraction";
  if (t === "museum") return "museum";
  if (t === "viewpoint") return "viewpoint";
  if (t === "artwork") return "artwork";
  if (t === "theme_park") return "theme_park";
  if (t === "zoo") return "zoo";
  if (tags.historic) return "historic";
  if (tags.man_made === "lighthouse") return "lighthouse";
  if (tags.man_made === "tower") return "tower";
  if (tags.natural === "waterfall") return "waterfall";
  if (tags.natural === "arch") return "arch";
  if (tags.natural === "cave_entrance") return "cave";
  return null;
}

/**
 * An OSM element as a roadside record, or null when it cannot be one: no
 * name, no position, or none of the kinds we pull. A way or relation uses
 * the centre Overpass computes for it.
 */
export function fromOsmElement(el: OsmElement): RoadsideStop | null {
  const tags = el.tags ?? {};
  const name = (tags.name ?? "").trim();
  if (!name) return null;
  const lat = el.type === "node" ? el.lat : el.center?.lat;
  const lng = el.type === "node" ? el.lon : el.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const kind = kindFromTags(tags);
  if (!kind) return null;
  const parsed = RoadsideStopSchema.safeParse({
    id: `osm:${el.type}:${el.id}`,
    name: name.slice(0, 200),
    lat,
    lng,
    kind,
    source: "osm",
    reason: null,
    wikidata: /^Q\d+$/.test(tags.wikidata ?? "") ? tags.wikidata : null,
    wikipedia: tags.wikipedia ? tags.wikipedia.slice(0, 200) : null,
  });
  return parsed.success ? parsed.data : null;
}
