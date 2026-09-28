# Round 1 of the interface build: report

Ship rules are in `round-1.md`, declared before the first build. This file grows a section per component as it lands.

## U1, roadside stops first-class (2026-09-29)

Six builder/critic rounds, then the operator, then one fix round.

- Rounds one and two delivered the component: a card on tap with the five parts, the
  list open with the ten strongest and "Show all N", the arc gone, the sheet's numbers
  as sentences. The "N" that sat over the sheet turned out to be Next's dev-mode
  button, not the map's compass.
- Round three's critic noted two diamonds stacked at Amarillo. The builder answered by
  spreading overlapping diamonds apart, and rounds four to six elaborated that until
  places in Amarillo and Austin were drawn in New Mexico and near Louisiana and moved
  when tapped. The critic rejected each round for the right reason (rule 6: the map
  showed machinery, not the trip); the builder closed the distance on the wrong thing.
- At six, the state went to the operator with the screenshots. His decision: keep
  rounds one and two, remove the spreading, draw every diamond where its place is;
  overlap at state zoom is what the zoom rule and a pinch are for. One fix round,
  approved.
- Council on the code: three rounds, the cap; five, three and three items, all guards
  and comments except one (contrast) answered with measurements. Merged as #83.

Lesson for the bar, applied to rule 6: a diamond is drawn at its place's position and
never moved; overlapping diamonds are allowed. A critic's note about overlap is not a
licence to move markers, and a spec that says "cluster or stack" is read as "move" by a
builder under pressure; say "never move".

## U2, plain words and readable type (2026-09-29)

Three builder/critic rounds, approved in the third; the council on the code, three rounds
to the cap, then a fourth run on the lockfile push, clear.

- Round one rewrote the words and swapped the body face to Geist at 16 px with the
  mono face kept for numbers; the critic failed it on chips that measured 26 px high
  and a name still clipped. Round two's builder found the cause was not the code: the
  runner's dev server had served round one's stylesheet from Next's webpack cache in
  `.next`, so the screenshot showed the previous round's CSS. The worktree's `.next`
  is now deleted before each round's server, and the plan says so.
- Round three: every app string on the four screens is sentence case with no glossary
  word; the plan sheet's header is a sentence from the data ("Lubbock and Oklahoma City
  fit today"); body text is Geist at 16 px everywhere but the home title at 24; the
  only smaller text is Google's own map chrome; no ellipsis anywhere; no horizontal
  overflow. Two tests hold it: a glossary test over the rendered home, plan (with its
  loading and error states) and today screens, and a stylesheet test that compiles the
  CSS and pins the sizes and the targets.
- Council: round one blocked on six items, four of them crashes on a failed fetch that
  the type makes impossible (a failed fetch arrives as an empty set with a flag), each
  answered with a comment at the line and a test rendering the real failed state; round
  two conditional on two hygiene items (`postcss` named as a dependency, a timeout
  explained); round three clear. The `postcss` line then took three pushes: CI installs
  with `npm ci` and the desk with `bun`, and a version that is right for one lockfile
  can be wrong for the other. Merged as #85.
- Seen and routed to U3 by name: the plan map at rest frames the whole country rather
  than the road, a fit regression from the sheet's new height; U3 redraws the fit per
  day and at rest.

Lessons made executable: the runner's purge of the build cache is in the workflow's
prompt, and Gate 1 now checks the npm lockfile against `package.json` whenever either
changes, since the council's "add the dependency" cost two failed pushes that a
two-second dry run would have caught at the desk.
