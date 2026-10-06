<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `chore/publish-tagged-store`

## Ship rule

Ships when production fetches the tagged store. The published asset was
uploaded from the tagged local store, downloaded back, and checked: its
checksum is the one committed here and it holds 31,941 tagged stops, all
27,976 at `MAP_THRESHOLD`.

**Cost:** $0. A GitHub release asset, no model call.

**Weakest part:** Between the upload and this merge, any build fetches the
new file and compares it against the old committed checksum, so it refuses
— loudly, by design, rather than serving the wrong store. The window is
the length of one CI run.
