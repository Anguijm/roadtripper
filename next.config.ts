import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Roadtripper's own Firebase project (client-side)
    NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyAxsr1QKIZhIHn7kZstTdRCArfdvCZ4RtQ",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "roadtripper-planner.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "roadtripper-planner",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "roadtripper-planner.firebasestorage.app",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "49481373471",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:49481373471:web:7a7c70b6035e4534be422a",
  },
};

export default nextConfig;
