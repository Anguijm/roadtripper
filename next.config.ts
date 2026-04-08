import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Action origin allowlist (Council ISC-S6-SEC-5).
  // Next.js compares the request Origin / Host headers against this list
  // before invoking any "use server" function. Same-origin requests
  // (same host as the deploy) are always allowed; this list adds
  // explicit non-default origins (e.g., the App Hosting custom domain).
  experimental: {
    serverActions: {
      allowedOrigins: [
        "roadtripper-planner.web.app",
        "roadtripper-planner.firebaseapp.com",
      ],
    },
  },
  env: {
    // Roadtripper's own Firebase project (client-side)
    NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyAxsr1QKIZhIHn7kZstTdRCArfdvCZ4RtQ",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "roadtripper-planner.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "roadtripper-planner",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "roadtripper-planner.firebasestorage.app",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "49481373471",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:49481373471:web:7a7c70b6035e4534be422a",
    // Clerk (using UE dev keys for now — separate Clerk app for production)
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      "pk_test_aW1wcm92ZWQtaG91bmQtNzEuY2xlcmsuYWNjb3VudHMuZGV2JA",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} https://apis.google.com https://maps.googleapis.com https://*.clerk.accounts.dev`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://maps.gstatic.com https://img.clerk.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.clerk.accounts.dev https://api.clerk.com",
              "frame-src 'self' https://accounts.google.com https://*.clerk.accounts.dev https://*.firebaseapp.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
