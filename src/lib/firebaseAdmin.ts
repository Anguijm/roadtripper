import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function createAdminDb() {
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      initializeApp({
        credential: cert(JSON.parse(serviceAccountKey)),
      });
    } else {
      // Application Default Credentials (gcloud auth, Cloud Run)
      initializeApp({
        projectId: "urban-explorer-483600",
      });
    }
  }

  return getFirestore(getApps()[0], "urbanexplorer");
}

export const adminDb = createAdminDb();
