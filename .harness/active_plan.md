<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u14-mood-marks`

## Ship rule (written before the work)

"Food is thin" on Amarillo → Austin. Ships when, with a mood chosen, a row
in the day's list that answers it says so — the mood's word in the mood's
colour, where the place's kind was — so the reader can see where the
matches end; the row grows no line (`ROADSIDE_LIST_PX`, one pixel of
slack); "✓ In the trip" still wins (U8); the critic approves; the mutation
proofs ran before the push.

**Cost:** $0.

**Weakest part:** The mood's word replaces the place's kind, and the
longest mood word ("Outdoors", "Museums", "Oddities", "Machines" — eight
letters) is longer than the shortest kinds ("zoo", "arch", "cave"), so
for those rows the line grows and can wrap. The same honest limit U8 has.

## The investigation: the data, not the cut

The question was whether the 0.35 `MOOD_ANSWERED` line is too strict. On
the Amarillo–Austin corridor, 643 places are on the map and 9 answer Food:
Franklin Barbecue, The Big Texan, Pontotoc Winery, Scholz Garten, U-Drop
Inn, Dawson's Saloon, Oasis, Stubb's — all real food and drink landmarks.
The 24 just under the line, 0.20 to 0.35, are not: Ol' Rip (a horned toad),
a statue, a locomotive, a longhorn statue, a drive-in *theatre*, two
Cadillacs, a cafe's neon *sign*. Lowering the line would add nothing but
noise. The model is precise; the stretch is simply thin on food.

So the fix is presentation, not the threshold. Under Food the list showed
two matches and then Helium Monument with nothing to say where the matches
stopped, and a thin answer read as a broken one.

## Found on the way

54 map-visible places are named `*`, and more are single characters —
"4", "S", "M" — scoring 0.58 to 0.63 with no line about them. They would
show on the map and the list as a place called `*`. Their own unit next.

## Mutation proofs, before the push

1. Answering below the line too: 3 fail. 2. The row never marking the
mood: 3 fail. 3. **The mood mark winning over "✓ In the trip": 0 failed
the first time** — no test had a place both in the trip and answering the
mood, which is the only case where the order matters. Added; it fails now.

## Critic

Approved on the first round: the two food places read "Food" in orange,
from Helium Monument down the kind is grey, and every row is the same
height. Outside this unit it flagged that **Oklahoma City is offered as a
town that "fits today" on Amarillo → Austin**, though it lies north-east,
not on the way — possibly a fault in which towns count as making progress.
Logged for its own look.

Gates: 719 green across 67 files; `tsc --noEmit` clean; `eslint` 0 errors.
