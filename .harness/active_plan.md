<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u15-nameless-places`

## Ship rule (written before the work)

Ships when a roadside place whose "name" is not a name — `*`, a bare
number, a single letter — never reaches the plan sheet or its map, while
real short names ("Owl", "Ram", "B52", "Zia") still do; when a live run on
a route past them shows them gone; and the mutation proofs ran before the
push.

**Cost:** $0. Read-side only: no store rebuild, no republish.

**Weakest part:** The rule is a heuristic about strings: a name needs a
letter and at least two characters. A real place called "X" — there are
letter sculptures — is dropped, and a junk name that happens to be two
letters ("Rr") is kept. Filtered at read, so the places still sit in the
store and the build; a store rebuild that dropped them there would be the
deeper fix and is not this unit.

## The data

Found during U14's investigation. 54 map-visible places are named `*`, all
at one spot — Midland, Texas, 32.0, -102.1 — scoring 0.58 to 0.63 with no
line about them; and more named a bare digit ("4", "6", "18") or a single
letter ("S", "M", "A"). On the sheet each would be a row and a card titled
`*`. Short names with letters are real and stay: Ram, Cow, Urn, Sun, Owl,
Rex, Zia, Elk, B52.

The home's example line reads the store too but requires a Wikipedia page,
which none of these have, so it cannot pick one. The plan sheet's one read
path is `survivorsAlongRoute`, which skips any row the survivor schema
refuses — so the rule goes in the schema, the boundary, as #93 put the tag
checks there.

## Mutation proofs, before the push

1. The schema not applying the rule: 2 fail, among them the real read path
   through a SQLite store holding a row named `*`. 2. A single letter
   counting as a name: 1 fails. 3. No letter required: 3 fail. All three
   caught on the first run.

## Live, before and after

Lubbock → Midland, where the `*` places are. Production, before: "52
places worth pulling over for", and one row named `*` — opened, its card
is titled `*`, its only line is "tourism" (the mapper's raw tag), and it
offers "+ Stop here", so a place called `*` could be added to a trip. Local,
after: 51 places, no row named `*`. The day's count is server-rendered, so
a `curl` comparison was valid here, unlike U11's box.

## Critic

Approved: before, a place named `*` with its own card, a line reading
"tourism" and a "+ Stop here" — rules 1 and 4; after, 52 places become 51,
no `*` row or diamond, and every remaining name reads as a name. Outside
this unit it flagged that **the card's line was a bare tag word,
"tourism"**: the mapper's raw value used as the line about a place. A real
place whose only line is a tag word has the same fault; next unit.

Gates: 723 green across 67 files; `tsc --noEmit` clean; `eslint` 0 errors.
