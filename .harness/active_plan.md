<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/u53-today-anywhere

## Ship rule (written before the work)

`gauntlet/specs/U53-today-anywhere.md`. John asked "Is the web app getting
fixed too?" after #181 and #182 and chose (2026-11-14) "Both: between towns
+ long days". The /today page answers as the car does: between towns from
the point itself, "about" on estimated minutes, chips 2 to 12 h and No
limit in two rows; No limit has no count and no deadline line; /plan's
daily budget keeps 2 to 8 h. A blind critic approves the 390 px shots
before merge.

## Done

- `TODAY_HOURS`, `NO_LIMIT`, `todayHoursFrom`, `hoursParam` in presets.ts;
  the car's `CAR_HOURS` is now the same list (the council's #182 note:
  one list, its "Changing it" comment names every place to update).
- page.tsx: `planToday(..., { betweenTowns, beyondGraph })`, "From your
  location, 109 km from Dayton", "about", the no-limit heading and footer,
  the feasibility line off on No limit, the notice says 650 km.
- TodayStart.tsx: nine chips in a five-column grid, No limit across two.
- The id tie-break in planToday's merged sort (the council's #182 note).
- Tests: src/app/today/__tests__/page.anywhere.ssr.test.tsx (10).

## Mutation proofs

Fourteen, each red (the fourteenth: exact minutes on an estimate), each restored and `cmp` clean: no betweenTowns; named
after the nearest town; "Your location" capitalised mid-sentence; no
"about"; no about note; a count on No limit; the feasibility line on No
limit; no No limit chip; the change link writing "null"; the notice saying
40 km; no beyondGraph (Fargo on 12 h); no 10 and 12; "of N" on No limit.

## Critic

Round 1 (fresh, blind, six 390 px shots): approved. Its minor notes:
"about" was not set apart in the note (done: `Times that say "about" are
estimates by straight line.`); "about 8 h 7 min" is more exact than
"about" promises (done: estimates said to the nearest 10 minutes,
`aboutMinutes`, mutation red); "109 km" where a US driver thinks in miles
(declined here: the whole app says km; on the backlog for John).
Round 2 (a new critic, the changed shots): approved. Minor notes, left:
km again (on the backlog); "estimates by straight line" could be plainer
(a wording preference, not a rule failure); "h" and "min" sit in the
mono face with the digits, which is every drive time in the app since U2
(the time is one `num` span), not something this PR changed.

Cost: None. Atlas reads only, as before.

Weakest part: "From your location, 109 km from Dayton" leans on the start
screen's label being exactly "Your location" for a point it could not
snap; a typed place name is kept as typed. And No limit from an island
town would list the mainland by straight line, though no atlas island has
a drive graph, so it gets the no-graph notice instead.
