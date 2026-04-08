import { z } from "zod/v4";
import type { WaypointType, VibeClass } from "@/lib/urban-explorer/types";

/**
 * The five road-tripper personas. Adding a persona requires adding the id
 * here and the config in ./index.ts — the Zod enum keeps URL params safe.
 */
export const PersonaIdSchema = z.enum([
  "outdoorsman",
  "foodie",
  "gearhead",
  "culture",
  "nerd",
]);

export type PersonaId = z.infer<typeof PersonaIdSchema>;

export interface PersonaConfig {
  /** Canonical id matching PersonaIdSchema */
  id: PersonaId;
  /** Human label shown in pills */
  label: string;
  /** Short glyph shown beside the label (accessibility: not color-alone) */
  glyph: string;
  /** Waypoint types that score at full weight (1.0) */
  primaryTypes: readonly WaypointType[];
  /** Waypoint types that score at reduced weight (0.5) */
  secondaryTypes: readonly WaypointType[];
  /** City vibe classes that grant a 1.2x bonus on waypoints */
  preferredVibes: readonly VibeClass[];
  /** Accent color from design.md (also used for route line + card border) */
  accentColor: string;
}

/**
 * A scored, rankable waypoint. Emitted by the recommendation pipeline;
 * consumed by RecommendationList and (later) the RouteMap highlight layer.
 */
export interface RankedWaypoint {
  waypointId: string;
  cityId: string;
  cityName: string;
  cityVibeClass: VibeClass | null;
  /** Waypoint display name in English (capped by LocalizedText schema) */
  name: string;
  type: WaypointType;
  trendingScore: number;
  /** Round-trip detour in minutes (from the candidate pipeline) */
  detourMinutes: number;
  /** Final score after typeWeight * vibeBonus / max(detour, 5) */
  score: number;
  /** "primary" / "secondary" / "other" — mirrors the typeWeight bucket */
  tier: "primary" | "secondary" | "other";
}
