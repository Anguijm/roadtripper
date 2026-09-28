<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `data/store-snapshot-scored`

## Goal

Data and one paragraph of learnings: the checksum of the fully scored
store snapshot (every one of the 328,393 stops scored; 27,976 survivors
at the line) so the next build fetches it, and the pid lesson written
the way it finally held.

**Cost:** $0 here; $8.07 on the jev-lab ledger for the whole store, under
the ten dollar cap.

**Weakest part:** The Wikidata-only "notable" kind yields 342 survivors of
178,633: a hundred and seventy-eight thousand rows and $2.40 of scoring to
find three hundred places, most of which a Wikipedia-page filter would
have found. The next store build should score only notable rows with a
page and skip the rest by rule.
