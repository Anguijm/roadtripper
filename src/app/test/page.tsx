import { adminDb } from "@/lib/firebaseAdmin";
import { getAllCities } from "@/lib/urban-explorer/cities";

export const dynamic = "force-dynamic";

async function getFirestoreInfo() {
  const collections = await adminDb.listCollections();
  const collectionNames = collections.map((c) => c.id);

  const citiesSnapshot = await adminDb.collection("cities").limit(5).get();
  const citySampleIds = citiesSnapshot.docs.map((d) => d.id);

  const waypointsSnapshot = await adminDb
    .collection("vibe_waypoints")
    .where("city_id", "==", "new-york-city")
    .limit(5)
    .get();
  const nycWaypoints = waypointsSnapshot.docs.map((d) => {
    const data = d.data();
    return { id: d.id, type: data.type, name: data.name?.en ?? d.id };
  });

  return { collections: collectionNames, citySampleIds, nycWaypoints };
}

export default async function TestPage() {
  const firestore = await getFirestoreInfo();
  const localCities = getAllCities();
  const northAmerica = localCities.filter((c) => c.region === "north-america");

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", color: "#fff", background: "#0a0a0a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>
        Roadtripper — Connection Test
      </h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#3fb950", marginBottom: "0.5rem" }}>Firestore (Admin SDK → urbanexplorer)</h2>
        <p>Collections: {firestore.collections.join(", ")}</p>
        <p>City sample: {firestore.citySampleIds.join(", ")}</p>
        <p style={{ marginTop: "0.5rem" }}>NYC waypoints:</p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {firestore.nycWaypoints.map((w) => (
            <li key={w.id} style={{ padding: "0.15rem 0", color: "#a0a0a0" }}>
              [{w.type}] {w.name}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#58a6ff", marginBottom: "0.5rem" }}>Local Cache</h2>
        <p>Total cities: <strong>{localCities.length}</strong></p>
        <p>North America: <strong>{northAmerica.length}</strong></p>
      </section>

      <section>
        <h2 style={{ color: "#d29922", marginBottom: "0.5rem" }}>North America Cities</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {northAmerica.map((city) => (
            <li key={city.id} style={{ padding: "0.25rem 0", borderBottom: "1px solid #222" }}>
              <strong>{city.name}</strong>
              <span style={{ color: "#666", marginLeft: "0.5rem" }}>
                {city.vibeClass} — {city.tier}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
