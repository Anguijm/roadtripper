import { urbanExplorerDb, roadtripperDb } from "@/lib/firebaseAdmin";
import { getAllCities } from "@/lib/urban-explorer/cities";

export const dynamic = "force-dynamic";

async function getUrbanExplorerInfo() {
  try {
    const collections = await urbanExplorerDb.listCollections();
    const collectionNames = collections.map((c) => c.id);

    const citiesSnapshot = await urbanExplorerDb.collection("cities").limit(5).get();
    const citySampleIds = citiesSnapshot.docs.map((d) => d.id);

    const waypointsSnapshot = await urbanExplorerDb
      .collection("vibe_waypoints")
      .where("city_id", "==", "new-york-city")
      .limit(5)
      .get();
    const nycWaypoints = waypointsSnapshot.docs.map((d) => {
      const data = d.data();
      return { id: d.id, type: data.type, name: data.name?.en ?? d.id };
    });

    return { status: "ok" as const, collections: collectionNames, citySampleIds, nycWaypoints };
  } catch (e) {
    return { status: "error" as const, error: String(e), collections: [], citySampleIds: [], nycWaypoints: [] };
  }
}

async function getRoadtripperInfo() {
  try {
    const collections = await roadtripperDb.listCollections();
    return { status: "ok" as const, collections: collections.map((c) => c.id) };
  } catch (e) {
    return { status: "error" as const, error: String(e), collections: [] };
  }
}

export default async function TestPage() {
  const ue = await getUrbanExplorerInfo();
  const rt = await getRoadtripperInfo();
  const localCities = await getAllCities();
  const northAmerica = localCities.filter((c) => c.region === "north-america");

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", color: "#fff", background: "#0a0a0a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>
        Roadtripper — Connection Test
      </h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#3fb950", marginBottom: "0.5rem" }}>
          Urban Explorer DB (cross-project, read-only)
        </h2>
        <p>Project: urban-explorer-483600 / DB: urbanexplorer — {ue.status === "error" ? <span style={{color:"#f85149"}}>ERROR: {ue.error}</span> : <span style={{color:"#3fb950"}}>OK</span>}</p>
        <p>Collections: {ue.collections.join(", ")}</p>
        <p>City sample: {ue.citySampleIds.join(", ")}</p>
        <p style={{ marginTop: "0.5rem" }}>NYC waypoints:</p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {ue.nycWaypoints.map((w) => (
            <li key={w.id} style={{ padding: "0.15rem 0", color: "#a0a0a0" }}>
              [{w.type}] {w.name}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#58a6ff", marginBottom: "0.5rem" }}>
          Roadtripper DB (own project)
        </h2>
        <p>Project: roadtripper-planner / DB: (default) — {rt.status === "error" ? <span style={{color:"#f85149"}}>ERROR: {rt.error}</span> : <span style={{color:"#3fb950"}}>OK</span>}</p>
        <p>Collections: {rt.collections.length > 0 ? rt.collections.join(", ") : "empty (ready for saved_trips)"}</p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#d29922", marginBottom: "0.5rem" }}>Cities (live)</h2>
        <p>Total cities: <strong>{localCities.length}</strong></p>
        <p>North America: <strong>{northAmerica.length}</strong></p>
      </section>

      <section>
        <h2 style={{ color: "#bc8cff", marginBottom: "0.5rem" }}>North America Cities</h2>
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
