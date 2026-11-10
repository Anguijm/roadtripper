<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: data/cloister-line

## Ship rule (written before the work)

Toledo's Cloister read "Museum on Monroe Street." (the OSM listing). John
approved "A courtyard framed by centuries-old columns from French
monasteries." (2026-11-10), every fact from the Atlas Obscura listing.
city-atlas-service #70 (🟢 10/10 on round 2) put it in the approved-lines
file and wrote it to the live atlas. Here: re-export, so /plan and /today
show it.

## Done

- Export diffed row by row against a copy taken first: one waypoint row
  changed, the Cloister's description. Cities, neighbourhoods and the drive
  graph are identical.
- A test pins the approved line in the app's read. Proof: with the previous
  atlas swapped back in, it is red; restored, `cmp` clean.

Cost: None. One re-export.

Weakest part: the line says only what Atlas Obscura's one sentence says.
