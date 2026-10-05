# U8: A roadside stop, once it is in the trip

Closes #99 and #97. Both are about how a place worth pulling over for reads
after it has become one of the trip's stops, and both are U7's residuals.

## The two faults

**#99 — a reloaded one is drawn as a town. Latent, not live.** `stopTowns`
is seeded from every stop in `initialTrip.stops`, so a roadside place given
to the sheet that way gets a town section of its own. But no page passes
`initialTrip` — only tests do — and `TripCard`'s resume link leaves stops
out on purpose. No user can reach this today. It is fixed anyway because
the fix is one `isCityId` check and the day stops are serialised (which
the TripCard comment anticipates) it would become live.

**#97 — an added one is unmarked in the day's list.** Its card reads
"✓ Added" while the list shows it like every place that is not in the trip.
One screen, two answers about the same place.

## Deliverables

1. A roadside place in the trip is never drawn as a town, whether it was
   added by a tap or arrived with a reloaded trip.
2. In the day's list, a place in the trip says so, in plain words, on its
   own row.

## Acceptance

- A screenshot at 390 px of the day's list with a roadside place in the
  trip and its card open. #99 has no screenshot, because there is no live
  state to photograph: it is held by tests that set `initialTrip` directly.
- Tests: a reloaded trip draws no town section for a roadside stop; the
  row says it is in the trip, and stops saying so when it is taken out.
- Gate 1; a mutation proof before push; cost $0.

## Constraints

- **The row may not get taller.** Each is two lines of 22 px with no
  padding (44 px, the target), and `ROADSIDE_LIST_PX` — the heading, ten
  rows and "Show all" — has one pixel of slack against the scroll box, pinned
  by a test. A third line on the row spends a U1 sizing decision. The mark
  goes on a line the row already has.
- Glossary (rule 1): plain words a person in a car would say.
