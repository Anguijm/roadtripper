<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/record-detail`

## Goal

The encyclopedias cover the wrong half. 627 of the 1,074 stops reach
Wikidata, but only 47 of the 163 on John's sheet do: the model's yes
calls are murals, statues and small museums, and those have no page.
OpenStreetMap often has a line for exactly those (Spirit Rock: "A large
boulder in the center of a circular garden"), and the pull threw it away.
The record keeps it now.

## Ship rule, written before the work

1. A stop keeps what OpenStreetMap says about it in one field, `detail`:
   the `description` tag first (an English variant accepted), then the
   `inscription`, then the subtype its tags spell (`artwork_type`,
   `memorial`, `museum`, `attraction`, `tower:type`, `castle_type`,
   `ruins`), and for a Wikidata-only place the value of the first tag that
   says what it is (`amenity`, `shop`, `leisure`, `craft`, `office`,
   `man_made`, `natural`, `building`). "yes" is no subtype. Underscores
   read as spaces; clipped to the reason bound at a word or sentence.
2. Nothing else in the record changes. PROGRESS_VERSION goes to 2, so the
   next pull starts the corridor over under the new shape: 32 free
   requests, about sixteen minutes on a healthy instance.
3. The clip helper moves to `text.ts` so the record and the encyclopedia
   fetch share one without importing each other; `describe.ts` still
   exports it for its callers.
4. Tested from real tag sets: Spirit Rock's description, a mural, a war
   memorial, a museum with two types, a hotel and a school on Wikidata
   only, and the clip at a word boundary.
5. The sheet already out is not rebuilt under John. The sampler carries
   `detail` in a follow-up once #69 is in, since both touch the same lines.

**Cost:** $0. One free re-pull of the corridor.

**Weakest part:** A `description` tag is crowd text of any quality. Spirit
Rock's is good; others say "closed", give a phone number, or repeat the
name. It is shown as text and never used as a reason, and the model will
see it only from the second corridor on, so the sheet John has now is
unchanged by this.

## Gate 1 proofs

- Rule 1: with the `description` branch removed from `detailFromTags`, "takes the mapper's description first…" and the clip test fail (the subtype "sculpture" wins instead). Restored, `cmp` clean.
- 434 tests, 3 new; lint and types clean. Every hand-built fixture gained `detail: null`.

## Council round 1 on #70 (CONDITIONAL, maintainability 5, bugs 6), and what changed

- `detail` defaults to null on read, so a corridor file from before the field is a poorer list, not a broken one; the writer always emits it and a test pins both (old shape reads as null; `detailFromTags()` with no tags is null)
- `clip` counts code points, so a cut never splits an emoji; tested at the boundary
- comments: why the two key lists and their order and how to extend them; what a PROGRESS_VERSION bump does and how to verify it; the clip budget's tie to MAX_REASON_LENGTH
- taken from the deferred list: a test that HTML in a description stays characters
- Answered, not changed: no renderer reads `detail` yet. The four `dangerouslySetInnerHTML` uses in the app (src/components/NeighborhoodPanel.tsx ) carry JSON-LD and map styling, none a stop's text; when `detail` is shown it goes in the same JSX text slot as a waypoint's reason (RecommendationList.tsx, `data-reason`), which React escapes
