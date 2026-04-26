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

type Schema<T> = {
  safeParse: (input: unknown) => { success: true; data: T } | { success: false };
};

function parseDocs<T>(
  schema: Schema<T>,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  collectionLabel: string
): T[] {
  const out: T[] = [];
  let dropped = 0;
  for (const d of docs) {
    const candidate = { id: d.id, ...d.data() };
    const result = schema.safeParse(candidate);
    if (result.success) {
      out.push(result.data);
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0) {
    console.warn(
      `[urban-explorer/firestore] dropped ${dropped} ${collectionLabel} doc(s) that failed schema validation`
    );
  }
  return out;
}

export async function getCity(cityId: string): Promise<City | null> {
  const snap = await urbanExplorerDb.collection(CITIES).doc(cityId).get();
  if (!snap.exists) return null;
  const result = CitySchema.safeParse({ id: snap.id, ...snap.data() });
  if (!result.success) {
    console.warn(
      `[urban-explorer/firestore] city ${cityId} failed schema validation`
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
  return parseDocs(NeighborhoodSchema, snap.docs, "neighborhood");
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
  return parseDocs(WaypointSchema, snap.docs, "waypoint");
}
