# U9: A saved trip reopens with its stops

## The fault

A saved trip remembers its stops but reopens without them. `TripCard`'s
resume link leaves them out on purpose ("V1: stops are intentionally
excluded… users re-add them interactively"), so a saved trip is really a
saved route: everything you chose along it is gone the moment you open it.

## Deliverables

1. Reopening a saved trip from Saved trips puts its stops back, in order:
   towns and roadside places both.
2. The route is drawn through them and the days are told from them, as
   though they had just been added.
3. A link with stops that cannot be read opens as the plain route, never
   as an error screen. The link is something anyone can edit.

## Acceptance

- A screenshot at 390 px of a reopened trip holding a town and a roadside
  place: both stops on the map, the days told through them, no red banner.
- Tests: the stops survive the round trip from a saved trip to the link and
  back; an unreadable or oversized stops parameter reads as no stops.
- A live run, because reopening calls the recompute server action.
- Gate 1; a mutation proof before push; the operator's look.

## Constraints

- No new server call. The sheet already recomputes the route when it opens
  with stops; reopening rides that, one recompute per reopen, the same as
  adding the stops by hand.
- The link is untrusted input. Validated with the saved trip's own stop
  schema, capped at the trip's stop limit.
