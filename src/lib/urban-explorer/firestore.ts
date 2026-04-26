import "server-only";
import { urbanExplorerDb } from "@/lib/firebaseAdmin";
import {
  CitySchema,
  NeighborhoodSchema,
  WaypointSchema,
  type City,
  type Neighborhood,
  type Waypoint,
} from "./cityAtlas";

const CITIES = "cities";
const NEIGHBORHOODS = "neighborhoods";
const WAYPOINTS = "waypoints";

type ParseIssue = { path: ReadonlyArray<PropertyKey>; message: string };
type ParseError = { issues: ReadonlyArray<ParseIssue> };
type Schema<T> = {
  safeParse: (
    input: unknown
  ) => { success: true; data: T } | { success: false; error: ParseError };
};

/** A document that failed schema validation and was dropped from the result. */
export type ParseFailure = { id: string; reason: string };

/**
 * Surface the partial-failure shape so callers can distinguish "this
 * collection is empty" from "every doc in this collection failed schema
 * validation and was dropped." Bugs reviewer R4 cited this as the
 * non-negotiable that distinguishes empty-state from failed-state in the UI.
 *
 * `items` is the parsed content. `dropped` lists each document that failed,
 * with the doc id and a flattened Zod error summary. Both are always present;
 * a healthy fetch returns `{ items: [...], dropped: [] }`. UI code that needs
 * to render an "X items failed to load" surface inspects `dropped`.
 */
export type LoadResult<T> = {
  items: T[];
  dropped: ParseFailure[];
};

function summarizeIssues(error: ParseError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "<root>"}: ${i.message}`)
    .join(" | ");
}

function parseDocs<T>(
  schema: Schema<T>,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  collectionLabel: string,
  parentLabel?: string
): LoadResult<T> {
  const items: T[] = [];
  const dropped: ParseFailure[] = [];
  for (const d of docs) {
    const candidate = { id: d.id, ...d.data() };
    const result = schema.safeParse(candidate);
    if (result.success) {
      items.push(result.data);
    } else {
      // Log per-doc with full Zod issues so schema drift is diagnosable.
      // (Bugs reviewer S8: aggregate count alone made debugging brutal.)
      const where = parentLabel ? `${parentLabel}/` : "";
      const reason = summarizeIssues(result.error);
      console.warn(
        `[urban-explorer/firestore] dropped ${collectionLabel} ${where}${d.id}: ${reason}`
      );
      dropped.push({ id: d.id, reason });
    }
  }
  return { items, dropped };
}

export async function getCity(cityId: string): Promise<City | null> {
  const snap = await urbanExplorerDb.collection(CITIES).doc(cityId).get();
  if (!snap.exists) return null;
  const result = CitySchema.safeParse({ id: snap.id, ...snap.data() });
  if (!result.success) {
    console.warn(
      `[urban-explorer/firestore] dropped city ${cityId}: ${summarizeIssues(result.error)}`
    );
    return null;
  }
  // Match the JSON-cache `cities.ts:getAllCities` filter so callers see a
  // consistent "archived = invisible" model regardless of which path
  // produced the City object. Bugs reviewer R2.
  //
  // Note on neighborhoods/waypoints: those schemas use `is_active`
  // (different field, different semantics — runtime open/closed signal,
  // not editorial archival). Filtering them by default would drop
  // legitimate "currently closed but exists" venues; consumers handle
  // that explicitly when needed.
  if (result.data.isArchived) return null;
  return result.data;
}

export async function listNeighborhoods(
  cityId: string
): Promise<LoadResult<Neighborhood>> {
  const snap = await urbanExplorerDb
    .collection(CITIES)
    .doc(cityId)
    .collection(NEIGHBORHOODS)
    .get();
  return parseDocs(NeighborhoodSchema, snap.docs, "neighborhood", cityId);
}

export async function listWaypoints(
  cityId: string,
  neighborhoodId: string
): Promise<LoadResult<Waypoint>> {
  const snap = await urbanExplorerDb
    .collection(CITIES)
    .doc(cityId)
    .collection(NEIGHBORHOODS)
    .doc(neighborhoodId)
    .collection(WAYPOINTS)
    .get();
  return parseDocs(
    WaypointSchema,
    snap.docs,
    "waypoint",
    `${cityId}/${neighborhoodId}`
  );
}
