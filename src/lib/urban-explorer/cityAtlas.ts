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
 * Upstream divergences (pipeline writes these; upstream schema doesn't yet
 * declare them — file as upstream PR):
 *   - WaypointSchema: is_active, google_place_id|business_status|last_validated
 *     (nullable; unset until Google Places enrichment runs)
 *   - NeighborhoodSchema: source, enriched_at
 *   - CitySchema: live docs use { location: { latitude, longitude } } and
 *     carry cache_metadata; older docs / JSON cache use flat lat/lng. Schema
 *     accepts either input and normalizes to flat lat/lng.
 *   - All `enriched_at` / `last_validated` values use ISO offset format
 *     ("+00:00"), not "Z".
 *   - .strict() removed on Firestore-backed object schemas because the
 *     pipeline adds fields faster than upstream tracks; rely on upstream's
 *     write-time validation for typo detection.
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
