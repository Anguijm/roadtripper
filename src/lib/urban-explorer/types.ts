import { z } from "zod/v4";

export const SupportedLocaleSchema = z.enum([
  "en", "ja", "ko", "zh-Hans", "zh-Hant", "es", "fr", "th",
]);

// Max length for a single localized string. Caps payload bloat and reduces
// the XSS blast radius on any waypoint string rendered in the UI.
const LOCALIZED_STRING_MAX = 1000;

export const LocalizedTextSchema = z
  .object({
    en: z.string().min(1).max(LOCALIZED_STRING_MAX),
    ja: z.string().max(LOCALIZED_STRING_MAX).optional(),
    ko: z.string().max(LOCALIZED_STRING_MAX).optional(),
    "zh-Hans": z.string().max(LOCALIZED_STRING_MAX).optional(),
    "zh-Hant": z.string().max(LOCALIZED_STRING_MAX).optional(),
    es: z.string().max(LOCALIZED_STRING_MAX).optional(),
    fr: z.string().max(LOCALIZED_STRING_MAX).optional(),
    th: z.string().max(LOCALIZED_STRING_MAX).optional(),
  })
  .strict();

export const CityTierSchema = z.enum(["tier1", "tier2", "tier3"]);

export const VibeClassSchema = z.enum([
  "NEON_GRID",
  "BRUTAL_GRIT",
  "FLUID_TROPIC",
  "DECAY_CHIC",
]);

export const CitySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    clinicalName: z.string().min(1).optional(),
    vernacularName: z.string().min(1).optional(),
    country: z.string().min(1),
    region: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    tier: CityTierSchema,
    aliases: z.array(z.string().min(1)).optional(),
    vibeClass: VibeClassSchema.optional(),
    noiseBaseline: z.number().min(0).max(1).optional(),
    isArchived: z.boolean().optional(),
    loreAnchor: z.string().min(1).optional(),
    qualityStatus: z.enum(["verified", "degraded", "pending_review"]).optional(),
  })
  .strict();

export const WaypointTypeSchema = z.enum([
  "landmark", "food", "drink", "nature", "culture",
  "shopping", "nightlife", "viewpoint", "hidden_gem",
]);

export const NeighborhoodSchema = z
  .object({
    id: z.string().min(1),
    city_id: z.string().min(1),
    name: LocalizedTextSchema,
    vernacularName: LocalizedTextSchema.optional(),
    lore: LocalizedTextSchema.optional(),
    summary: LocalizedTextSchema.optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    trending_score: z.number().min(0).max(100),
    is_active: z.boolean().optional(),
  })
  .strict();

export const WaypointSchema = z
  .object({
    id: z.string().min(1),
    city_id: z.string().min(1),
    neighborhood_id: z.string().min(1),
    name: LocalizedTextSchema,
    description: LocalizedTextSchema.optional(),
    type: WaypointTypeSchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    trending_score: z.number().min(0).max(100),
    // URL validation guards against javascript: URLs that could slip through
    // to an <a href={waypoint.source}> later.
    source: z.string().url().refine((u) => /^https?:/i.test(u)).optional(),
    enriched_at: z.string().datetime().optional(),
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
