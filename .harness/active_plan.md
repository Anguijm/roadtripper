<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/store-deploy`

## Goal

The store reaches the deployed app. The site is Firebase App Hosting,
built from `main` on every push, and the 58 MB store is not in git. So
the build fetches it: a published snapshot on a GitHub release, checked
against a checksum that is in git, traced into the image like the atlas.
"Open the website" then means the website, not John's laptop.

## Ship rule, written before the work

1. `scripts/publish-roadside-store.mjs` takes a consistent snapshot of the
   live store (`VACUUM INTO`, so the published file is compact and not
   mid-write), writes its SHA-256 to `data/roadside.sqlite.sha256` (which
   is committed), and uploads it as the asset `roadside.sqlite` of the
   release tagged `roadside-store`, replacing the previous one. The
   repository is public, so the asset needs no token to download.
2. `scripts/fetch-roadside-store.mjs` runs before `next build`. If the
   file is already there and matches the checksum, it does nothing. Else
   it downloads the asset, verifies the checksum, and keeps the file only
   if it matches. A download that fails or a checksum that does not match
   leaves no file, prints why, and exits 0: the site must still deploy
   without roadside stops, and the store's own warning says the file is
   missing.
3. `outputFileTracingIncludes` carries `data/roadside.sqlite` into the
   standalone output beside the atlas, and the store looks there already.
4. Tested: the fetch on an empty directory downloads and verifies (the real
   asset, once); a wrong checksum is refused and the file removed; an
   existing matching file is left alone. The publish script is run once
   for real and its checksum committed.

**Cost:** $0. GitHub release assets are free; the image grows by 58 MB.

**Weakest part:** The checksum in git and the asset on the release must
move together, in that order (publish, then commit), or a deploy in
between fetches a file it then refuses. The publish script prints the
commit step so it is not forgotten. The store published tonight is the
partial one (every tagged kind scored, the Wikidata-only tranche not),
because the account's credits ran out; republishing after the rest is
scored is one command and one commit.

## Gate 1 proofs

- Rule 1: the publish ran once for real: a 77 MB snapshot of 323,888 stops, 156,899 scored, on the release `roadside-store`; its checksum is in `data/roadside.sqlite.sha256`.
- Rule 2, on a temporary directory against the real asset: an empty directory downloads 77 MB and verifies; a matching file is left alone; a wrong checksum refuses the download and leaves no file; a file that does not match the checksum is replaced by the published one. (Corrected: the first write-up of this proof was wrong. `gh release create file#name` sets a display label, not the asset's name, so the first publish went up as `roadside-snapshot.sqlite`, the download URL answered 404, and the four "tests" had exercised the not-fetched path. The publish script now writes the snapshot under the asset's name and refuses to finish unless the download URL answers 200; the four cases were rerun and passed for real.)
- Rule 3: the tracing include beside the atlas; not exercised by a full `next build` here, the mechanism is the atlas's and the deploy will show it.
- Lint, types and the suite unchanged.

## Council round 1 on #76 (CONDITIONAL, bugs 6), and what changed

- the download streams to a temporary file and is hashed as it streams, then renamed into place: no partial file is ever at the store's path and the build never holds 77 MB in memory
- SQLite's `quick_check` runs on the downloaded file before the rename; a User-Agent names us to GitHub; the two-minute timeout says why two minutes
- the publish script says it needs a signed-in `gh` with release rights and what happens without
- Answered, not changed: no placeholder file on a failed download. A build without the store was run to check the claim and succeeded (exit 0, 2026-09-28); `outputFileTracingIncludes` is a glob and a missing file traces nothing. A 0-byte placeholder would instead open as an empty database and fail on the first query.

## Council round 3 on #76 (CONDITIONAL, bugs 8), and what changed

- the SQLite check closes its handle in `finally`; the temporary file carries the process id and a random suffix; a byte-order mark at the front of the checksum file is stripped (tested: a BOM-prefixed copy of the checksum passes)
- Answered with a proof, not a change: the committed checksum is the published asset's. Downloaded again and hashed after this round: `539d40bee67f0a04…` both ways, and the fetch's own verification passes against it.
