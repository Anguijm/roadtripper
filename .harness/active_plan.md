<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/title-names-stop`

## Ship rule (written before the work)

U47. The U45 critic, on Salt Lake City → Denver: the title read "Park City,
Rock Springs and 1 more fit today", but the first card under it was Rawlins,
marked "Closest to where today's 4 h run out". The title names towns in the
fetch's order, the list sorts them nearest-detour first, and neither puts
the day's stop town first.

The rule: one order for the title, the map's names and the list. The town
the sheet marks as where today's drive runs out comes first, then the rest
nearest-detour first, with out-of-the-way towns last (and still left out of
the title). Checked in a unit test of the order, and live: on Salt Lake City
→ Denver the title starts with "Rawlins", which the old build fails.

**Cost:** None. This is rendering only.

**Weakest part:** the map keeps the first of two colliding names (U20). If the
stop town is now first, a different town may lose its map name on a crowded
view. That is intended, since the stop is the one to keep, but it should be
seen on the screenshot.
