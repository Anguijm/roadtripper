/**
 * Schema for city-atlas-service data, mirrored from
 * github.com/Anguijm/city-atlas-service:src/schemas/cityAtlas.ts.
 *
 * Pipeline-written collections:
 *   cities/{cityId}
 *   cities/{cityId}/neighborhoods/{nhId}
 *   cities/{cityId}/neighborhoods/{nhId}/waypoints/{wpId}
 *   cities/{cityId}/neighborhoods/{nhId}/tasks/{taskId}
 *   vibe_neighborhoods, vibe_waypoints, vibe_tasks  (flat denorm)
 *   seasonal_variants
 *
 * Upstream divergences — fields present in pipeline output but not yet in
 * the upstream canonical schema:
 *   - CitySchema: live docs use { location: { latitude, longitude } } and
 *     carry cache_metadata; older docs / JSON cache use flat lat/lng. Schema
 *     accepts either input and normalizes to flat lat/lng. Upstream PR #26
 *     explicitly deferred CitySchema changes — separate PR needed there.
 *   - .strict() removed on Firestore-backed object schemas because the
 *     pipeline adds fields faster than upstream tracks; rely on upstream's
 *     write-time validation for typo detection.
 *
 * Previously-diverged fields now in upstream (merged Anguijm/city-atlas-service#26):
 *   - WaypointSchema: is_active, google_place_id|business_status|last_validated,
 *     enriched_at with ISO offset format (+00:00)
 *   - NeighborhoodSchema: source, enriched_at
 */
import { z } from "zod/v4";

export const SupportedLocaleSchema = z.enum([
  "en",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "es",
  "fr",
  "th",
]);

export const LOCALIZATION_TARGETS = [
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "es",
  "fr",
  "th",
] as const;

export const LocalizedTextSchema = z
  .object({
    en: z.string().min(1),
    ja: z.string().optional(),
    ko: z.string().optional(),
    "zh-Hans": z.string().optional(),
    "zh-Hant": z.string().optional(),
    es: z.string().optional(),
    fr: z.string().optional(),
    th: z.string().optional(),
  })
  .strict();

export const CityTierSchema = z.enum(["tier1", "tier2", "tier3"]);

export const LoreSourceSchema = z
  .string()
  .min(1)
  .refine((val) => /^(verified:.+|unverified|ai-generated:.+)$/.test(val), {
    message:
      "Must be 'verified:<source>', 'unverified', or 'ai-generated:<model>'",
  });

export const VibeClassSchema = z.enum([
  "NEON_GRID",
  "BRUTAL_GRIT",
  "FLUID_TROPIC",
  "DECAY_CHIC",
]);

export const CoverageTierSchema = z.enum(["metro", "town", "village"]);

// Pipeline writes ISO datetimes with explicit offset ("...+00:00"), not "Z".
const TimestampSchema = z.string().datetime({ offset: true });

const RawCitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  clinicalName: z.string().min(1).optional(),
  vernacularName: z.string().min(1).optional(),
  country: z.string().min(1),
  region: z.string().min(1),
  // Either flat lat/lng OR nested location.{latitude,longitude}.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  tier: CityTierSchema,
  aliases: z.array(z.string().min(1)).optional(),
  vibeClass: VibeClassSchema.optional(),
  noiseBaseline: z.number().min(0).max(1).optional(),
  isArchived: z.boolean().optional(),
  loreAnchor: z.string().min(1).optional(),
  loreSource: LoreSourceSchema.optional(),
  qualityStatus: z
    .enum(["verified", "degraded", "pending_review"])
    .optional(),
  coverageTier: CoverageTierSchema.optional(),
  maxRadiusKm: z.number().positive().optional(),
});

// Normalizes either shape to flat lat/lng so consumers see one type.
export const CitySchema = RawCitySchema.transform((v, ctx) => {
  const lat = v.lat ?? v.location?.latitude;
  const lng = v.lng ?? v.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") {
    ctx.addIssue({
      code: "custom",
      message: "city missing lat/lng (neither flat nor location.* present)",
      path: ["lat"],
    });
    return z.NEVER;
  }
  const { location: _loc, ...rest } = v;
  void _loc;
  return { ...rest, lat, lng };
});

export const NeighborhoodSchema = z.object({
  id: z.string().min(1),
  city_id: z.string().min(1),
  name: LocalizedTextSchema,
  vernacularName: LocalizedTextSchema.optional(),
  lore: LocalizedTextSchema.optional(),
  loreSource: LoreSourceSchema.optional(),
  summary: LocalizedTextSchema.optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  trending_score: z.number().min(0).max(100),
  is_active: z.boolean().optional(),
  source: z.string().optional(),
  enriched_at: TimestampSchema.optional(),
});

/**
 * Maximum neighborhoods fetched per city in S8's per-stop drill-down.
 * Used by `fetchNeighborhoods` (lands in S8b) as the `.limit()` argument
 * on the Firestore query. Defined here so the bound is visible at the
 * schema layer, not buried in the fetch helper. Cost council R1 wanted
 * the bound declared upfront.
 *
 * 20 is generous: las-vegas has 12 neighborhoods, and our largest cities
 * are unlikely to exceed 20 enriched neighborhoods per stop. Bump only
 * after measuring actual UE coverage.
 */
export const MAX_NEIGHBORHOODS_PER_CITY = 20;

/**
 * Lite projection for the per-stop neighborhood drill-down UI. Validates
 * what Firestore returns from `.select('name.en', 'summary.en',
 * 'trending_score')` plus the synthetic doc id.
 *
 * `name` and `summary` reuse `LocalizedTextSchema` so the i18n contract
 * stays consistent across the app — `localizedText(text, locale)` works
 * the same on a lite waypoint as on a full one. `LocalizedTextSchema`
 * has `en` required and the other 6 locales optional, which exactly
 * matches what `.select('name.en', 'summary.en', ...)` returns from
 * Firestore (only `en` populated for the projection's lifetime; future
 * locales can land without a schema change). S8a council R2
 * (accessibility) flagged the previous English-only shape.
 *
 * `id` regex is intentionally tighter than `NeighborhoodSchema.id` (S8
 * plan SEC requirement: React-key safety on UI-rendered values). The
 * strict schema stays open because verify scripts and future server-side
 * callers may want to surface raw ids; the lite shape is what reaches the
 * NeighborhoodPanel and is the right place to enforce the constraint.
 *
 * `.strict()` outer is preserved (not `.passthrough()`): the projection
 * `.select('name.en', 'summary.en', 'trending_score')` bounds the
 * returned shape by construction, so unknown keys here are evidence of
 * the projection drifting from the schema, not pipeline drift.
 */
export const NeighborhoodLiteSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase a-z, 0-9, hyphen"),
    name: LocalizedTextSchema,
    summary: LocalizedTextSchema.optional(),
    trending_score: z.number().min(0).max(100),
  })
  .strict();

export type NeighborhoodLite = z.infer<typeof NeighborhoodLiteSchema>;

export const WaypointTypeSchema = z.enum([
  "landmark",
  "food",
  "drink",
  "nature",
  "culture",
  "shopping",
  "nightlife",
  "viewpoint",
  "hidden_gem",
]);

export const WaypointSchema = z.object({
  id: z.string().min(1),
  city_id: z.string().min(1),
  neighborhood_id: z.string().min(1),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.optional(),
  type: WaypointTypeSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  trending_score: z.number().min(0).max(100),
  // `source` is NOT URL-validated. The pipeline writes a provenance tag,
  // not a link — values like "enrichment-gemini-2026-04" or
  // "enrichment-google-places". Reinstating `.url()` here would fail
  // strict-parse on every pipeline-written waypoint (which is what an
  // earlier local schema did and what S8 council R2's security review
  // recommended). XSS protection lives at the render layer instead:
  //   - `.harness/scripts/security_checklist.md` bans
  //     `dangerouslySetInnerHTML` on UE-pipeline-written strings.
  //   - React's default escaping handles plain-text rendering.
  //   - The Security council persona (`security.md`) lists this rule
  //     under "Untrusted ingested content".
  // If we ever start treating `source` as a clickable URL in the UI, the
  // safety check belongs at that callsite (validate-on-use) rather than
  // here, since not all `source` values are URLs.
  source: z.string().optional(),
  enriched_at: TimestampSchema.optional(),
  is_active: z.boolean().optional(),
  // Google Places enrichment — set to null until enrichment runs.
  google_place_id: z.string().nullable().optional(),
  business_status: z.string().nullable().optional(),
  last_validated: TimestampSchema.nullable().optional(),
});

export const TaskSchema = z
  .object({
    id: z.string().min(1),
    waypoint_id: z.string().min(1).optional(),
    neighborhood_id: z.string().optional(),
    title: LocalizedTextSchema,
    prompt: LocalizedTextSchema,
    points: z.number().int().min(0).default(0),
    duration_minutes: z.number().int().positive().optional(),
  })
  .strict();

export const SeasonalVariantSchema = z
  .object({
    id: z.string().min(1),
    city_id: z.string().min(1),
    season_key: z.string().min(1),
    starts_at: z.string().min(1),
    ends_at: z.string().min(1),
    title: LocalizedTextSchema,
    description: LocalizedTextSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type VibeClass = z.infer<typeof VibeClassSchema>;
export type CityTier = z.infer<typeof CityTierSchema>;
export type City = z.infer<typeof CitySchema>;
export type Neighborhood = z.infer<typeof NeighborhoodSchema>;
export type WaypointType = z.infer<typeof WaypointTypeSchema>;
export type Waypoint = z.infer<typeof WaypointSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type SeasonalVariant = z.infer<typeof SeasonalVariantSchema>;

/**
 * Resolve a `LocalizedText` to a single string for a given locale, falling
 * back to `en` (which is non-optional in the schema, so the return type is
 * always a string).
 *
 * Centralized so the eventual i18n switch is a single-file change. Don't
 * inline `someLocalized.en` in components; route through here.
 */
export function localizedText(
  text: { en: string } & Partial<Record<SupportedLocale, string>>,
  locale: SupportedLocale = "en"
): string {
  return text[locale] ?? text.en;
}
