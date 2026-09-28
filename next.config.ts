import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server's own tools button (a black circle with an "N", fixed at
  // the bottom-left of the viewport above everything on the page) is off.
  // The Gauntlet runner shoots the plan page on a dev server, and on a phone
  // that button sat over the sheet's roadside list and read as a compass
  // (round-1 critic, rule 6: the map's controls never sit on the sheet).
  // Production never has it; nothing else about dev changes.
  devIndicators: false,
  // better-sqlite3 is a native addon. Next must not try to bundle it, and the
  // atlas file it opens has to survive output tracing into the deployed image.
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    // The roadside store is fetched before the build (scripts/fetch-roadside-store.mjs)
    // and rides along the same way; absent, the plan page shows no roadside stops.
    "/**": ["./data/atlas.sqlite", "./data/roadside.sqlite"],
  },
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} https://apis.google.com https://maps.googleapis.com`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://maps.gstatic.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com",
              "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
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
