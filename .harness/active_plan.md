<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `data/store-snapshot-waterfalls`

## Goal

Data only: the checksum of the republished store snapshot, so the next
build fetches the store with the 4,506 waterfalls and every encyclopedia
line in it. The snapshot was published first, then this commit, in that
order, as the publish script says.

**Cost:** $0.

**Weakest part:** The waterfalls are in the store but not scored (the
account has no credits), so none of them is a survivor yet; the live
change from this snapshot is the encyclopedia lines on rows that had
none, which the sidebar shows.
