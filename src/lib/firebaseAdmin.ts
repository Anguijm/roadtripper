import "server-only";
import { initializeApp, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ROADTRIPPER_PROJECT_ID = "roadtripper-planner";

function getOrCreateApp(name: string, projectId: string): App {
  try {
    return getApp(name);
  } catch {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      return initializeApp(
        { credential: cert(JSON.parse(serviceAccountKey)), projectId },
        name
      );
    }

    // Application Default Credentials (gcloud auth, Cloud Run)
    return initializeApp({ projectId }, name);
  }
}

// Roadtripper's own Firestore (default DB) — for saved_trips, user data
const roadtripperApp = getOrCreateApp("roadtripper", ROADTRIPPER_PROJECT_ID);
export const roadtripperDb = getFirestore(roadtripperApp);

// Urban Explorer's Firestore handle used to live here. The atlas is now a local
// SQLite file exported by scripts/export-atlas.mjs, so this app no longer reads
// across a project boundary at runtime. See src/lib/atlas/db.ts.
