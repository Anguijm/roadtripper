<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: data/u49-trim-wiki-lines

## Ship rule (written before the work)

U49. The U48 critic: a Wikipedia line repeats the name and the town already
on screen ("The Stuhr Museum of the Prairie Pioneer is a museum located in
Grand Island, Nebraska ..."). city-atlas-service #64 trims a sentence's own
subject and its town, deleting words only; a trim under 25 characters keeps
the whole sentence (John's choice 2026-11-10, so Howard Payne University is
unchanged). Applied to Firestore the same day; this PR is the re-exported
atlas.

The rule: on production, Omaha to Denver, Grand Island's lead row has a
`data-reason` of "A museum intended to preserve the legacy of the Pioneers
who settled the plains of Central Nebraska in the late 19th century." The
old build says "The Stuhr Museum of the Prairie Pioneer is a museum
located in Grand Island, ...", so it fails.

Atlas diff against the previous file: 4 waypoint descriptions changed (Fonner
Park, Stuhr Museum, Reliance Tipple, Wendover Will); 0 added or removed in
cities, neighborhoods, waypoints or the drive graph. Counts 303 / 2,241 /
13,659 / 6,116 unchanged.

Critic: the plan page cannot run on the MS-S1 (no .env.local; the keys were
on the laptop). John approved the four exact lines in chat on 2026-11-10.
The matched 390 px pair (production before, production after, Stuhr row
centered) goes to a fresh blind critic after deploy; a reject reverts.

**Cost:** None at run time. Four Firestore updates (two documents each)
and one atlas export read.

**Weakest part:** The critic runs after the merge, not before, because
there is no local plan page on this machine. A reject means a revert PR.
