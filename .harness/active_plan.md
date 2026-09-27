<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `data/drive-graph-complete`

## Goal

Ship the completed drive graph. The ORS window reopened at 13:41 UTC on
2026-09-27 and the many-origins build (#49) fetched the remaining 4,942 pairs
in 5 requests and 18 seconds: 5,132 of 5,132 pairs, 191 origins, zero
unroutable, zero failed requests, factor 1.1738 reused, `drive_graph_built_at`
written. Spot checks: Seattle to Portland 171 min, Los Angeles to Las Vegas
229, Amarillo to Albuquerque 225, Austin to Dallas 160, Chicago to Detroit 259.
Only two pairs differ by more than 15% in reverse, both twin cities under 20
minutes apart (Minneapolis and Saint Paul, Jersey City and New York).

The graph made six existing tests fail: they exercise the live Routes API path
with Los Angeles as the origin, and LA is now a graph hit, so the API was never
reached. They now force a graph miss. The graph-hit behaviour (zero API calls)
and the error-to-miss fallback stay covered in their own files.

**Cost:** $0 for the build. From here every radial lookup for a continental US
origin is a SQLite read, so the Routes API matrix cost on the plan page drops
to $0 for those; it remains for origins outside the graph.

**Weakest part:** The graph's accuracy rests on one factor learned from 24
Google pairs and checked on 12, with a 4.31% held-out mean error. No pair in
the other 5,096 has been compared to Google. The atlas grows by 550 KB to
7.1 MB and is a committed binary; a future re-export carries the graph over,
but a `--fresh` rebuild spends another day's ORS window.
