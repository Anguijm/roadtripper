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
): T[] {
  const out: T[] = [];
  for (const d of docs) {
    const candidate = { id: d.id, ...d.data() };
    const result = schema.safeParse(candidate);
    if (result.success) {
      out.push(result.data);
    } else {
      // Log per-doc with full Zod issues so schema drift is diagnosable.
      // (Bugs reviewer S8: aggregate count alone made debugging brutal.)
      const where = parentLabel ? `${parentLabel}/` : "";
      console.warn(
        `[urban-explorer/firestore] dropped ${collectionLabel} ${where}${d.id}: ${summarizeIssues(result.error)}`
      );
    }
  }
  return out;
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
  return result.data;
}

export async function listNeighborhoods(cityId: string): Promise<Neighborhood[]> {
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
): Promise<Waypoint[]> {
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
