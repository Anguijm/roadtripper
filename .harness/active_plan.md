<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/t1-tag-vocabulary`

## Ship rule (written before the work)

Ships when `src/lib/roadside/tags.ts` holds the eighteen tags and the eight
moods John approved on 2026-09-30, the roll-up from tag to mood, the
question each tag is asked (so the vocabulary and the scorer cannot drift
apart), and the ranking rule for one or two chosen moods; with unit tests
including the two-mood case, and no consumer changed. Gate 1 green.

Why additive: the persona module is imported by fourteen files. Replacing
it and the vocabulary in one branch is a change no reviewer can hold in
their head. This branch adds the vocabulary and the math; the screens keep
their five personas until the interface round swaps them.

**Cost:** $0. No model call, no store write, no route. A pure module and
its tests.

**Weakest part:** The eighteen questions are written here but not yet
asked. Their wording is a guess until the dry run on a sample of the store
shows what the model does with them, and the first real run may send me
back to reword a criterion. The glyphs and accent colours are provisional:
the blind critic judges them on the phone in the interface round, not here.

## Gate 1 proofs

Mutation: the three bands in `rankFor` replaced by the plain `return
weakest` the first cut had. `bunx vitest run
src/lib/roadside/__tests__/tags.test.ts` then fails seven tests by name,
among them "orders the tail instead of flattening it to zero" and "ranks
both above one above neither, and drops nothing off the list". Restored
from the copy taken first; `cmp` reports the file identical.

That first cut was not a straw man. It is what I wrote, and it is what I
described to the operator as the rule: rank by the weaker of the two
chosen moods. The test caught what the description hid. Under it every
place that misses either mood scores exactly zero, so the whole tail below
the both-matches comes back in arbitrary order. The bands keep the
promise (what answers both is on top) and order everything underneath.

Gates: `bunx vitest run` all green; `bun run type-check` clean; `bun run
lint` 0 errors.

## Council round 1 on #92

1, 2 and 3 are comments and they are written: `MAX_MOODS` names the chip
component and the two tests that pin its layout; `MOOD_ANSWERED` names the
test file and says it must stay above zero and below one; `accentColor`
says which test computes the contrast; the test file says where `#0d1117`
comes from and why the question length has a floor and a ceiling (the
scorer's state-plus-question budget). `rankFor` now carries the proof that
the bands cannot meet: a general score is at most 1, a band-1 key is at
least 1 + `MOOD_ANSWERED`, a band-2 key at least 2 + `MOOD_ANSWERED`, and
the whole separation rests on `MOOD_ANSWERED` being above zero. A new test
walks the range and checks no lower band reaches a higher one.

4 was real and is fixed. `moodScore` read `scores[tag]` and compared it
with `>`, so a null or undefined `scores` threw, and an `Infinity` written
into the table would have won every comparison and pinned one place to the
top of every list for ever. A `NaN` was already harmless by luck rather
than design. Scores now pass through `scoreOf`, which takes a finite
number in 0 to 1 and treats anything else as no answer, and the general
score is clamped to the same range so it cannot break the band
separation. Three tests cover it: rubbish values, no scores at all, and an
out-of-range general score.

The council's three "before merge" notes are the same ground: the drift
between the questions here and the scorer is the reason the questions live
in this file and are exported to `data/tag-questions.json` for the bench to
read rather than retyped there, which the J11 spec in jev-lab records; the
contrast test is in the same file as the colours it guards; and the
validation it asks the ingest to do is now done at the point of use, which
is the only place that can be sure of it.

## What the real tag scores changed, before the council saw them

The tagging run finished while #92 was in review (jev-lab J11, 31,941
places, $2.94). Reading the result exposed a gap the fixtures could not:
the Rose Bowl and a college practice field both score 0.99 for
`sports_place`, because both are unarguably about sport. Their general
scores are 0.06 and 0.04. Ranked on the mood alone, the list put them in
whatever order the database returned.

So the within-band key is now nine parts mood and one part general score.
The general score cannot overturn a real difference in the mood (a place
half a point better on the mood still wins from a general score of zero),
but it decides a near-tie, which is exactly the Rose Bowl case. The band
separation still holds and its test now walks each band at its worst case.

This is scope added to a branch already in review, and the reason is that
shipping a ranking I had just watched pick wrong would have been worse.

## Council round 2 on #92 — 🟡 CONDITIONAL, both remediations applied

**1. The clamp on the no-mood path.** `rankFor` returned `generalScore`
untouched when nothing was chosen, while both banded paths clamped. The
council called it minor. It is not: `chosen.length === 0` is the state of
the list before anyone taps a chip, so the unguarded return was the most
travelled line in the function, and a single corrupt row reached the
comparator unchecked on the default screen. The expression now lives once,
in `clamp01`, instead of being written a third time.

I did not follow the council's suggested value. It asked that `Infinity`
resolve to `1`; `clamp01` resolves it to `0`, which its own "or a safe
clamped fallback" allows. Clamping a corrupt value *upward* to 1 would tie
it with the best real place and let it win a stable sort — the exact
failure `scoreOf` is documented as existing to prevent. A value nothing can
be read from is not an answer, so it reads as no answer.

**2. The tests.** `NaN`, `±Infinity`, out-of-range high and low, and a
sort over a corrupt row proving it lands last rather than first.

Mutation: `clamp01(generalScore)` on the no-mood path put back to `return
generalScore`. The two new tests fail by name and the other thirty still
pass — which is the point, since it shows the previous suite never covered
that path. Restored from the copy taken first; `cmp` reports identical.

**The deferred follow-up was worse than the council could see, so it is
done too.** `data/tag-questions.json` was not merely un-synced: it was not
in the repository at all, an untracked file in one working copy. The
jev-lab bench reads it by path, and its own error message names
`scripts/export-tag-questions.ts` — a script that had never been written.
The cross-repo contract this branch's ship rule rests on ("so the
vocabulary and the scorer cannot drift apart") was held together by one
file on one disk.

`tagQuestionsJson()` now lives beside the vocabulary it serialises, the
script is its only writer, `bun run tags:export` runs it, and two tests
compare the committed bytes with the module. Mutation: one word added to
the `waterfall` question without re-exporting; both tests fail by name.
The generated file is byte-identical to the one the bench actually read
during the 31,941-place run, so committing it changes nothing already
scored and locks it going forward.

Gates: `npx vitest run` 582 green; `tsc --noEmit` clean; `eslint` 0 errors.
