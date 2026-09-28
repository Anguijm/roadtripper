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
import { MAX_REASON_LENGTH } from "@/lib/routing/scoring";
import { clip } from "./text";

/**
 * 200 is the same bound the saved-trip schema puts on a city or place name
 * (src/lib/trips/types.ts) and well above any real OSM name; the id gets
 * the same so a source cannot hand us a key that dwarfs its record. The
 * reason takes MAX_REASON_LENGTH, the bound every rendered description
 * already has, so a roadside reason can never be longer on screen than a
 * city waypoint's.
 */
const MAX_TEXT = 200;

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
  /** A national or state park, a nature reserve: the road goes past it. */
  "park",
  /** None of the above, but named and on Wikidata: the famous restaurant, the odd landmark. */
  "notable",
  "other",
]);
export type RoadsideKind = z.infer<typeof RoadsideKindSchema>;

export const RoadsideStopSchema = z.object({
  /** Source-qualified, so two sources cannot collide: "osm:node:123". */
  id: z.string().min(1).max(MAX_TEXT),
  name: z.string().min(1).max(MAX_TEXT),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: RoadsideKindSchema,
  source: z.enum(["osm", "wikidata", "google"]),
  /** Why you would stop. Null until step 23; untrusted text, render as text only. */
  reason: z.string().max(MAX_REASON_LENGTH).nullable(),
  /**
   * What the source itself says about the place, in one line: OSM's
   * `description` tag, else its `inscription`, else the subtype its tags
   * spell ("mural", "war memorial", "hotel"). Crowd text of any quality,
   * shown as text only and never used as a reason. Null when the tags say
   * nothing beyond the kind. Added 2026-09-28 because the encyclopedias
   * cover the wrong half: murals and small museums have no page, and this
   * is often all there is to read about them. Missing in a file written
   * before 2026-09-28 reads as null rather than failing: a corridor file
   * from the old shape is still a valid list of stops, only a poorer one,
   * and the pull's PROGRESS_VERSION keeps old and new tiles from being
   * merged. The writer (fromOsmElement) always emits it, and the record
   * test pins that, so the default hides no writer bug.
   */
  detail: z.string().max(MAX_REASON_LENGTH).nullable().default(null),
  /** A Wikidata Q-id when the source carried one; the door to a real reason. */
  wikidata: z.string().regex(/^Q\d+$/).nullable(),
  /** "en:Cadillac Ranch" style, when the source carried one. */
  wikipedia: z.string().max(MAX_TEXT).nullable(),
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

/**
 * The `historic` values people pull over for. Step 19's first ten tiles
 * held 364 `historic` entries and most were registered houses, churches
 * and cemeteries (`historic=building|house|church|yes|district`), which
 * are not stops. A memorial that is a plaque or a stone is a roadside
 * marker; Texas has thousands, and a marker is not a stop either.
 */
// To change this list: add or remove the value here, then add its real
// OSM tag set to "pulls the historic things people stop for" in
// __tests__/roadside.test.ts, taken from a corridor pull, and say which
// stop it is. The Overpass query is built from this list, so the query
// test's expected selector follows it automatically.
export const HISTORIC_STOP_VALUES = [
  "monument", "memorial", "castle", "fort", "ruins", "archaeological_site", "ship", "aircraft",
  "locomotive", "railway_car", "wreck", "battlefield", "landmark", "milestone", "boundary_stone",
  "cannon", "tank", "city_gate", "bridge",
] as const;
const MARKER_MEMORIALS = new Set(["plaque", "stone", "blue_plaque", "stele"]);

/**
 * Tags that make a named, Wikidata-linked thing not a stop however
 * notable: a town, a road, a railway, a river, a county line, a field.
 */
const NOT_A_STOP_KEYS = ["place", "highway", "railway", "waterway", "landuse", "admin_level"] as const;

/**
 * The Q-id in a `wikidata` tag, or null. The tag is meant to be "Q254602"
 * but is crowdsourced: it turns up as a full URL, as "Q1;Q2" for a thing
 * that is two things, with stray spaces, or lower-cased. The first Q-id
 * anywhere in it is the one we keep; a tag with none is no link at all.
 */
export function wikidataId(raw: string | undefined): string | null {
  const m = (raw ?? "").match(/Q\d+/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * For a Wikidata-only place ("notable"), the tag whose value says what it
 * is: "hotel", "school", "restaurant". Tried in this order because the
 * earlier keys are the more specific: a hotel is `building=hotel` and
 * also `tourism=hotel`, but a school carries `amenity=school` on a
 * `building=yes`, so `building` goes last where "yes" is skipped. To add
 * a key, put it before the less specific ones and add a real tag set to
 * "says what a Wikidata-only place is" in __tests__/roadside.test.ts.
 */
const WHAT_IT_IS_KEYS = ["amenity", "shop", "leisure", "craft", "office", "man_made", "natural", "building"] as const;
/**
 * Tags that name a subtype of one of our own kinds: "mural" under artwork,
 * "war memorial" under historic, "history" under museum. Each is the
 * subtype key OSM documents for that kind, so at most one applies to a
 * given element and the order only settles a mis-tagged one. A new kind
 * in `kindFromTags` that has a subtype key should add it here and a tag
 * set to "takes the mapper's description first…" in the tests.
 */
const SUBTYPE_KEYS = ["artwork_type", "memorial", "museum", "attraction", "tower:type", "castle_type", "ruins"] as const;

const words = (v: string) => v.replace(/_/g, " ").replace(/;/g, ", ").trim();
/** OSM's convention is lower-case "yes"; mappers write "Yes" and "YES" too, and none of them is a subtype. */
const isYes = (v: string) => v.toLowerCase() === "yes";

/**
 * What the tags say about the place beyond its kind, or null. The
 * `description` tag (an English variant accepted) is the mapper's own
 * sentence and wins; an `inscription` is what the plaque says; failing
 * both, the subtype the tags spell, and for a Wikidata-only place the
 * value of the first tag that says what it is. "yes" is no subtype.
 */
export function detailFromTags(tags: Record<string, string> | null | undefined = {}): string | null {
  // A default parameter covers undefined only; an explicit null (an element
  // JSON-decoded with "tags": null) would otherwise throw on the first read.
  if (!tags) return null;
  const description = (tags.description ?? tags["description:en"] ?? "").trim();
  if (description) return clip(description);
  const inscription = (tags.inscription ?? tags["inscription:en"] ?? "").trim();
  if (inscription) return clip(inscription);
  for (const k of SUBTYPE_KEYS) {
    const v = (tags[k] ?? "").trim();
    if (v && !isYes(v)) return clip(words(v));
  }
  for (const k of WHAT_IT_IS_KEYS) {
    const v = (tags[k] ?? "").trim();
    if (v && !isYes(v)) return clip(words(v));
  }
  return null;
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
  if (tags.historic && (HISTORIC_STOP_VALUES as readonly string[]).includes(tags.historic)) {
    if (tags.historic === "memorial" && MARKER_MEMORIALS.has(tags.memorial ?? "")) return null;
    return "historic";
  }
  if (tags.man_made === "lighthouse") return "lighthouse";
  // Observation towers are stops; radio masts (tower:type=communication) are not.
  if (tags.man_made === "tower" && tags["tower:type"] === "observation") return "tower";
  // Waterfalls are tagged `waterway=waterfall` in practice; `natural=waterfall`
  // is the old key and turned up once in the whole United States store.
  // Checked before the Wikidata-only rule below, which excludes anything with
  // a `waterway` key (rivers and creeks are not stops); a waterfall is.
  if (tags.natural === "waterfall" || tags.waterway === "waterfall") return "waterfall";
  if (tags.natural === "arch") return "arch";
  if (tags.natural === "cave_entrance") return "cave";
  if (tags.boundary === "national_park" || tags.boundary === "protected_area" || tags.leisure === "nature_reserve") return "park";
  // "Notable": named, linked to Wikidata, and claimed by no kind above. An
  // administrative boundary (a county, a city limit) is on Wikidata and is
  // named, and driving past one is not a stop, so it is excluded along
  // with the keys in NOT_A_STOP_KEYS; `boundary=administrative` needs its
  // own check because `boundary` is also how parks are tagged.
  if (wikidataId(tags.wikidata) && tags.boundary !== "administrative" && !NOT_A_STOP_KEYS.some((k) => k in tags)) {
    return "notable";
  }
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
    name: name.slice(0, MAX_TEXT),
    lat,
    lng,
    kind,
    source: "osm",
    reason: null,
    detail: detailFromTags(tags),
    wikidata: wikidataId(tags.wikidata),
    wikipedia: tags.wikipedia ? tags.wikipedia.slice(0, MAX_TEXT) : null,
  });
  return parsed.success ? parsed.data : null;
}
