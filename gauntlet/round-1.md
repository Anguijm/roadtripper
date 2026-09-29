# Round 1 of the interface build: ship rules, declared before the first build

Written 2026-09-29 (Japan time), before any builder ran. Components U1 and U2, in that
order, since both touch the plan sheet and the second is words on what the first draws;
U3 added after both landed, its rule written before its builder ran; U4 and U5 added
after U3, one of them late (see its rule).

## Ship rules

- U1 ships when the critic approves the two screenshots against rules 4, 6 and 7 of the
  bar and the SSR tests in the spec pass; residual: "Add as a stop", routed to U6.
- U2 ships when the critic approves four screenshots against rules 1, 2, 3 and 7 and the
  glossary test passes; residual: the days view, routed to U3.
- U3 ships when the critic approves four screenshots (the plan at rest, with a stop
  added so the trip has two days, after a tap on day one, and in arrival mode) against
  rules 1, 4, 5, 6 and 7, and the days test and the deadline sentence test pass; it
  also owns the fit at rest that U2 saw broken. Residual: the today screen's day,
  routed to U4. Added 2026-09-29 after U2 landed, before U3's builder ran.
- U4 ships when the critic approves the home at 390 px with the three fields and the
  button above the fold, the fold closed without dates and open with them, and the
  fold test passes. Not written here before U4's builder ran (2026-09-29): the spec's
  Acceptance served as the rule and the critic judged against it, but this file was
  updated only after the merge, which is a miss against "ship rules before runs".
- U5 ships when the critic approves the plan sheet, the today screen and the home's
  fold with the mood chips as one component (the same markup on all three), every
  chip whole at 390 px with no sideways scroll and 44 px targets, and the component's
  SSR test passes with four moods and with five. The spec's "one row" is read under
  rules 2 and 7: at 16 px five chips do not fit one row of 358 px, so two whole rows
  pass. Declared 2026-09-29 after U4 landed, before U5's builder ran.
- Each component: at most six rounds before the state goes to the operator with the
  screenshots; Gate 1 before every push; the council on the code.
- Cost of the round: $0 in API calls. The runner's screenshots hit the plan page on a
  local dev server, which calls the routes API once per distinct route; two routes,
  cached after the first call.

## Who judges

- The critic never reads the builder's notes; it gets the spec, the bar and the
  screenshots. It names the largest failure by rule number, or approves.
- The operator sees the approved screenshots before merge and can send it back.
