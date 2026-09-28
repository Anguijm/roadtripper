# Round 1 of the interface build: ship rules, declared before the first build

Written 2026-09-29 (Japan time), before any builder ran. Components U1 and U2, in that
order, since both touch the plan sheet and the second is words on what the first draws.

## Ship rules

- U1 ships when the critic approves the two screenshots against rules 4, 6 and 7 of the
  bar and the SSR tests in the spec pass; residual: "Add as a stop", routed to U6.
- U2 ships when the critic approves four screenshots against rules 1, 2, 3 and 7 and the
  glossary test passes; residual: the days view, routed to U3.
- Each component: at most six rounds before the state goes to the operator with the
  screenshots; Gate 1 before every push; the council on the code.
- Cost of the round: $0 in API calls. The runner's screenshots hit the plan page on a
  local dev server, which calls the routes API once per distinct route; two routes,
  cached after the first call.

## Who judges

- The critic never reads the builder's notes; it gets the spec, the bar and the
  screenshots. It names the largest failure by rule number, or approves.
- The operator sees the approved screenshots before merge and can send it back.
