<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/remove-clerk`

## Goal

Remove authentication. Saved trips move to the browser.

The operator's call on 2026-09-23, after finding that every Clerk key in the
system is a development key: Secret Manager holds `pk_test` and `sk_test`, and
`next.config.ts` hardcoded a third `pk_test` that would have overridden any
production secret anyway, because Next inlines `env` values at build time.

That key belongs to Urban Explorer's dev instance. Road Tripper was borrowing
another app's development auth to gate a feature used by two people.

## Change

- Deleted: `app/trips/actions.ts`, `components/AuthButtons.tsx`,
  `lib/firebaseAdmin.ts`, `lib/firebase.ts` (dead, no importers), `src/proxy.ts`.
- `lib/trips/storage.ts`: localStorage, keeping the Zod schemas, upserting by id
  so a retry cannot duplicate, and exposing a `useSyncExternalStore` interface.
- `/trips` is now a static page reading that store. It was server-rendered.
- Save button loses its auth gate and reports why a save failed rather than
  "try again".
- `@clerk/nextjs` removed. `firebase-admin` moved to devDependencies: only the
  export script uses it now, so it no longer ships in the runtime image.
- Clerk secrets dropped from `apphosting.yaml`; Clerk origins dropped from CSP.

## Risk surface

- Trips no longer follow you between devices, and clearing site data clears
  them. Named in the UI rather than discovered.
- The 50-trip ceiling and idempotent save carry over from the Firestore version.
- Rollback: revert the commit. Nothing external changed; the Clerk secrets are
  still in Secret Manager, unused.

## Ship rule (declared before the work)

1. No `clerk` reference remains in `src/`, proven by grep.
2. The trips page and the save path have test coverage at least as good as the
   175-line server action they replace, including the failure modes that action
   could not have (storage off, quota full, corrupt entry).
3. A production build succeeds and `/trips` renders.
4. Lint, types, and the full suite green.

**Cost:** $0, and it removes spend. No Clerk instance to outgrow, no Firestore
reads or writes for trips, one fewer runtime dependency in the image. The two
Clerk secrets stay in Secret Manager costing nothing until deliberately deleted.

**Weakest part:** I still have not observed a successful Save in a real browser,
and I tried. Two things blocked it, neither of them this change:

1. Serving the build over plain HTTP on a LAN address makes Chrome treat the
   origin as insecure and **deny localStorage outright** (`SecurityError: Access
   is denied for this document`). The storage layer handled that correctly, by
   reporting `unavailable` rather than throwing, which is evidence for the
   design but not evidence the happy path works.
2. `/plan` never finished hydrating in the browser: it sat on the loading
   fallback with the real content in a hidden template and no React fiber on the
   button. `/` and `/trips` both hydrated normally on the same build, and a
   `curl` of the same `/plan` URL returned the complete 213 KB page in 1.36s, so
   the server is fine. Loading the **production** `/plan` in the same browser
   then froze the renderer outright, matching screenshot timeouts seen on that
   page earlier the same evening.

So: 18 unit tests cover the logic, the build is clean, and the auth gate is
provably gone (`curl` shows "Save trip" where "Sign in to save this trip" used
to be). "Saving works end to end" remains inference, not observation. Confirming
it needs an HTTPS or localhost origin the browser extension can reach.

**Follow-up, unrelated to this branch:** the plan page can leave the browser
stuck on its loading state and can freeze the renderer. It reproduces against
production, so it predates this work.

## Council round 1 on this PR (BLOCK), and what changed

Seven items. Five applied, two pushed back with evidence.

Applied: a `role="alert"` banner when the browser blocks storage, read through
`useSyncExternalStore` with an `unknown` server snapshot so it cannot cause a
hydration mismatch; the two contrast fixes (`#555` to `#7d8590`, error text to
`#ff7b72`); the deletion announcement lifted to the page, because a live region
inside the card unmounts in the same commit as the delete; and comments on
`KEY` and `MAX_SAVED_TRIPS` including why updates bypass the cap.

Pushed back:

- "Build-breaking `zod/v4` import." `package.json` has `"zod": "^4.3.6"`, not
  the `^3.24.1` the review states, and five of the six existing imports in the
  repo already use `zod/v4`. CI `validate` passed. The claim is false.
- "Wrap `saveTrip` in `setTimeout` so the saving state can paint." The write is
  synchronous and sub-millisecond; no timer makes a transitional label useful.
  The state was a leftover from the async server action. Deleted instead.
