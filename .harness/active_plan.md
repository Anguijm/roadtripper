<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/u50-drawers

## Ship rule (written before the work)

U50, spec `gauntlet/specs/U50-drawers.md`, from John's design and four
choices on 2026-11-10. Within each day: "Along the way" first, a drawer that
starts open, its places in the order you pass them (the ten strongest, in
road order; Show all for every one); then the towns, each a drawer that
starts closed, in the order you pass them, the day's stop town in place with
its filled Stop here. A chosen mood hides what answers none of the chosen
moods in both drawers, using each mood's main kinds for town places; a town
left empty is hidden and one line counts them. Machines and Sports leave the
towns whole. The sort control goes.

The rule: on Omaha to Denver at 390 px, the day's towns read Lincoln, Grand
Island, Kearney, North Platte, Ogallala (old: North Platte first); every
town is closed; Along the way is above them and its first rows' miles rise.
With History chosen, no Food row shows in either drawer. A fresh blind
critic approves against the amended quality bar before merge.

## Rounds

- Round 1, fresh blind critic: REJECT. Real: "What's in" beside the town's
  name read as a second way to open it and led somewhere else (rule 3). My
  error: the screenshot script tapped "What's in", not the drawer. Fixed:
  the header holds the name (the drawer's toggle) and a full-width Stop
  here; "What's in Grand Island: its parts of town" moved inside the open
  drawer; a town whose write-up is asked for (its map marker) opens its
  drawer. Larger arrow, summary in the link style.
- Round 2, fresh blind critic: APPROVE, medium, nothing to fix. Its three
  notes predate U50 (stop town shows no drive figure by U3's design; row
  spacing is U1's height budget; Ogallala past the day's end is a reach
  rule) and go to the backlog.

Mutation proofs: road order off (3 tests red), town filter off (1),
drawers open (2), first ten in strength order (3), along-the-way filter off
(8), What's in back in the header (1), no auto-open on a write-up (1). Each
restored from a copy, `cmp` identical. 827 tests pass.

**Cost:** None at run time: no new fetch, no new Routes call. The list is
reordered and filtered in the browser.

**Weakest part:** Two. The drawer's 44 px handle makes the along-the-way
block 19 px taller than the box at the rest snap (ROADSIDE_LIST_PX's
comment); scrolled past the handle, ten rows and Show all fit. And closed
towns hide their places, so a person who never
opens one sees only the pick's name. The summary line ("Stuhr Museum and 4
more") carries the town; the critic judges whether it is enough.
