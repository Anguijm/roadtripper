# Security checklist

Non-negotiables for every change in Roadtripper. The Security council persona loads this file on every run.

A "non-negotiable" means: if the change touches the surface and violates the rule, the council vetoes and the Lead Architect cannot issue a Proceed decision.

## Firestore — write paths (Roadtripper-owned)

- [ ] Every write to `saved_hunts` (or any future Roadtripper-owned collection) enforces ownership via Clerk userId in BOTH the Server Action AND `firestore.rules`.
- [ ] Document IDs for `saved_hunts` are derived deterministically (e.g., from a hash of trip inputs + userId) so retries are idempotent and one user cannot overwrite another's docs.
- [ ] Destructive migrations (collection drops, doc-shape changes on populated collections) have a rollback plan documented in the PR.
- [ ] No raw user input concatenated into Firestore query paths. Use the SDK's typed query builder.

## Firestore — read paths (UE-owned, read-only)

- [ ] No write attempts to UE collections (`cities/*`, `vibe_*`, `seasonal_variants`). They are read-only and the App Hosting SA has only `roles/datastore.viewer` there.
- [ ] Schema parse failures on UE reads log + drop, never throw to the user.
- [ ] Schema parse logs include `cityId` / `docId` so data drift can be diagnosed.

## Server-only enforcement

- [ ] firebase-admin imports (`urbanExplorerDb`, `roadtripperDb`) are reachable only from server code. Files importing them have `import "server-only"` at the top, OR are reached only from `"use server"` Server Action files.
- [ ] No client-component barrel re-exports a server-only module. Verify in PR review.
- [ ] No keys (`CLERK_SECRET_KEY`, `GOOGLE_MAPS_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`) in any client-bundled module.
- [ ] `NEXT_PUBLIC_*` env vars never hold secrets. Anything non-public has a non-prefixed name. (`NEXT_PUBLIC_GOOGLE_MAPS_KEY` is intentionally public; keep it referrer-restricted in the GCP console.)

## Server Actions

- [ ] Every Server Action validates inputs with Zod before reaching the rate-limiter or the API.
- [ ] Origin / destination strings are bounded in length (e.g., ≤ 256 chars) and constrained in shape (no embedded URLs, no control chars).
- [ ] `personaId`, `cityId`, `stopIndex`, `budgetHours` use `z.enum`/`z.string().regex`/`z.number().int().min().max()` — explicit shape, not `z.string()` alone.
- [ ] Server Actions read user identity via Clerk's server-side `auth()`. Never trust a client-supplied user ID.

## Rate-limiting (paid APIs)

- [ ] Every Google Maps callsite (Directions, Places, Geocoding) is wrapped by `src/lib/routing/rate-limit.ts`'s burst + spacing + daily quota stack. Per project memory `feedback_rate_limit_layers.md`: each layer is non-redundant.
- [ ] Single user-initiated action = single rate-limit charge regardless of internal fan-out (per S7 SEC-2).
- [ ] LRU caches in front of Maps callsites have explicit max-entries caps (per S7 SEC-3).

## Untrusted ingested content

- [ ] UE-pipeline-written waypoint, neighborhood, and city names + descriptions are Gemini-enriched by city-atlas-service. Treat as untrusted user content.
- [ ] All UE-sourced strings render as plain text children in JSX. No `dangerouslySetInnerHTML` for these fields.
- [ ] No markdown renderer that allows raw HTML applied to UE-sourced strings.
- [ ] String interpolation into HTML attributes (e.g., `title=`, `href=`) of UE-sourced strings goes through React's default escaping; never via raw template literals.

## Auth (Clerk)

- [ ] Sessions managed by Clerk's own cookie store. No manual localStorage persistence of tokens.
- [ ] Multi-user data: current user resolved server-side via `auth()`, never from a client-supplied header or cookie.
- [ ] Account deletion (when implemented) tombstones or removes `saved_hunts` within 30 days.

## XSS / rendering

- [ ] No `dangerouslySetInnerHTML` without an explicit sanitizer on the same line.
- [ ] Image URLs from external content are proxied through a server route OR validated against an allowlist before rendering.

## External fetching

- [ ] User-supplied origin/destination strings go to the Google Maps Places API for validation. Don't blindly fetch arbitrary URLs based on user input.
- [ ] Private IP ranges (10./172.16./192.168./127./169.254./::1) blocked at any future fetch layer to prevent SSRF.

## Logging and PII

- [ ] No PII in logs (no Clerk session tokens, no full saved_hunts contents, no user emails). User IDs only.
- [ ] No API keys in logs, ever — redacted at the logger layer before serialization.
- [ ] Error messages returned to the client do not expose stack traces or internal paths in production.

## Dependencies

- [ ] New `npm` deps justified in the PR description: maintainer, weekly downloads, last-update age.
- [ ] No left-pad-class dependencies (single-function, low-star, sole-maintainer) without strong justification.
- [ ] Lockfile committed and verified.

## Client bundle

- [ ] No server-only imports reach a client component (check `server-only` package usage or explicit `"server-only"` imports).
- [ ] No keys or internal URLs in the client bundle. `grep` the built bundle if in doubt.

## Review triggers

Run through this checklist when the plan touches any of: a new Server Action, a new `saved_hunts` write path, a new Google Maps callsite, a new external dependency, a change to Clerk auth handling, a new Firestore collection (read or write), or anything that renders UE-sourced content.
