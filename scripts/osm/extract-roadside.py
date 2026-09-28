"""Stream an OpenStreetMap extract and keep the elements that could be roadside stops.

    .venv-osm/bin/python scripts/osm/extract-roadside.py data/osm/us-latest.osm.pbf data/osm/us-roadside.ndjson

Three passes over the file, because a way's or a relation's position lives in
its nodes and the file is too big to hold every node's position in memory:

  1. relations: keep the candidates, note their member ways and nodes
  2. ways: keep the candidates and the members from pass 1, note their nodes
  3. nodes: emit candidate nodes as they come; remember the positions of the
     nodes that pass 2 asked for, then emit the ways and relations with a
     centre (the mean of their node positions, like Overpass's `out center`
     near enough for a pin on a map)

The tag test here is loose on purpose: it keeps anything a roadside kind could
be made from, and the real cut is `fromOsmElement` in src/lib/roadside/record.ts,
which the store builder runs over this output. One parser, not two. The output
is one JSON object per line in the OsmElement shape that parser reads.

Wikidata-linked named things are kept too (that is where Big Texan came from
on the first corridor) and they are the flood: every school and creek with an
id from a bulk import. The store builder decides what to do with them.
"""

import json
import sys
import time

import numpy as np
import osmium

TOURISM = {"attraction", "museum", "viewpoint", "artwork", "theme_park", "zoo"}
MAN_MADE = {"lighthouse", "tower"}
NATURAL = {"waterfall", "arch", "cave_entrance"}
BOUNDARY = {"national_park", "protected_area"}
# A centre needs only a few of a way's nodes. A candidate way (a museum
# building, a park boundary) keeps up to 30, evenly spaced; a way that is only
# a member of a candidate relation keeps up to 8. On the United States file
# that is about 10 million node positions instead of 56 million, which is the
# difference between fitting in memory and not: the first run held every
# reference in Python sets and was at 7 GB of 15 with the node pass barely
# begun. The cost of sampling is in the centre, which is the mean of the
# sampled positions: for a compact thing (a building, a small park) it is
# within metres of the true centroid; for a long thin thing (a river relation,
# a trail) it can sit off the line, and for a park shaped like a crescent it
# can sit outside the park. A pin on a map tolerates all of that; a geofence
# would not. Raise the two numbers if a centre ever matters more than memory.
CANDIDATE_WAY_NODES = 30
MEMBER_WAY_NODES = 8


def sample(refs, keep):
    """Up to `keep` of the refs, evenly spaced from the first, so a long way's
    centre is not the mean of one end. The last node of a closed way repeats
    the first, which biases nothing worth a special case."""
    if len(refs) <= keep:
        return refs
    step = len(refs) / keep
    return [refs[int(i * step)] for i in range(keep)]


def candidate(tags) -> bool:
    if "name" not in tags:
        return False
    if tags.get("tourism") in TOURISM:
        return True
    if "historic" in tags:
        return True
    if tags.get("man_made") in MAN_MADE:
        return True
    if tags.get("natural") in NATURAL or tags.get("waterway") == "waterfall":
        return True
    if tags.get("boundary") in BOUNDARY or tags.get("leisure") == "nature_reserve":
        return True
    if "wikidata" in tags:
        return True
    return False


def tagdict(tags) -> dict:
    return {t.k: t.v for t in tags}


class Pass1(osmium.SimpleHandler):
    """Candidate relations, and which ways and nodes they are made of."""

    def __init__(self):
        super().__init__()
        self.relations = {}  # id -> {"tags":..., "ways": [...], "nodes": [...]}
        self.member_ways = set()
        self.member_nodes = set()

    def relation(self, r):
        if not candidate(r.tags):
            return
        ways, nodes = [], []
        for m in r.members:
            if m.type == "w":
                ways.append(m.ref)
            elif m.type == "n":
                nodes.append(m.ref)
        self.relations[r.id] = {"tags": tagdict(r.tags), "ways": ways, "nodes": nodes}
        self.member_ways.update(ways)
        self.member_nodes.update(nodes)


class Pass2(osmium.SimpleHandler):
    """Candidate ways and the member ways of pass 1's relations, with their node refs."""

    def __init__(self, member_ways):
        super().__init__()
        self.member_ways = member_ways
        self.ways = {}  # id -> {"tags": ... or None, "nodes": [...]}

    def way(self, w):
        is_candidate = candidate(w.tags)
        if not is_candidate and w.id not in self.member_ways:
            return
        refs = sample([n.ref for n in w.nodes], CANDIDATE_WAY_NODES if is_candidate else MEMBER_WAY_NODES)
        self.ways[w.id] = {"tags": tagdict(w.tags) if is_candidate else None, "nodes": refs}


class CandidateNodes(osmium.SimpleHandler):
    """Emit candidate nodes. Reached only by named nodes, thanks to the C++ key filter in front."""

    def __init__(self, out):
        super().__init__()
        self.out = out
        self.emitted = 0

    def node(self, n):
        if candidate(n.tags) and n.location.valid():
            self.out.write(json.dumps({"type": "node", "id": n.id, "lat": n.location.lat, "lon": n.location.lon, "tags": tagdict(n.tags)}, ensure_ascii=False) + "\n")
            self.emitted += 1


class Positions(osmium.SimpleHandler):
    """Record the positions of the nodes the ways asked for. Reached only by
    those nodes, thanks to the C++ id filter in front; stored by rank in the
    sorted id array, so the memory is two float arrays, not a dict."""

    def __init__(self, ids: np.ndarray):
        super().__init__()
        self.ids = ids
        self.lat = np.full(len(ids), np.nan)
        self.lon = np.full(len(ids), np.nan)
        self.seen = 0

    def node(self, n):
        if not n.location.valid():
            return
        i = int(np.searchsorted(self.ids, n.id))
        if i < len(self.ids) and self.ids[i] == n.id:
            self.lat[i] = n.location.lat
            self.lon[i] = n.location.lon
            self.seen += 1

    def lookup(self, refs):
        idx = np.searchsorted(self.ids, refs)
        idx = idx[(idx < len(self.ids)) & (self.ids[np.minimum(idx, len(self.ids) - 1)] == refs)]
        lat, lon = self.lat[idx], self.lon[idx]
        ok = ~np.isnan(lat)
        return list(zip(lat[ok].tolist(), lon[ok].tolist()))


def centre(points):
    if not points:
        return None
    return {"lat": sum(p[0] for p in points) / len(points), "lon": sum(p[1] for p in points) / len(points)}


def main(src: str, dst: str) -> int:
    t0 = time.time()
    p1 = Pass1()
    p1.apply_file(src)
    print(f"pass 1: {len(p1.relations):,} candidate relations, {len(p1.member_ways):,} member ways, {time.time() - t0:.0f}s", flush=True)
    p2 = Pass2(p1.member_ways)
    p2.apply_file(src)
    del p1.member_ways
    need = np.unique(np.fromiter((r for w in p2.ways.values() for r in w["nodes"]), dtype=np.int64))
    need = np.union1d(need, np.fromiter(p1.member_nodes, dtype=np.int64)) if p1.member_nodes else need
    print(f"pass 2: {sum(1 for w in p2.ways.values() if w['tags']):,} candidate ways, {len(p2.ways):,} ways kept, {len(need):,} nodes needed, {time.time() - t0:.0f}s", flush=True)
    with open(dst, "w", encoding="utf-8") as out:
        cands = CandidateNodes(out)
        osmium.apply(src, osmium.filter.KeyFilter("name").enable_for(osmium.osm.NODE), cands)
        print(f"pass 3a: {cands.emitted:,} candidate nodes emitted, {time.time() - t0:.0f}s", flush=True)
        pos = Positions(need)
        osmium.apply(src, osmium.filter.IdFilter(need.tolist()).enable_for(osmium.osm.NODE), pos)
        print(f"pass 3b: {pos.seen:,} of {len(need):,} positions found, {time.time() - t0:.0f}s", flush=True)
        ways_out = 0
        for wid, w in p2.ways.items():
            if not w["tags"]:
                continue
            c = centre(pos.lookup(np.asarray(w["nodes"], dtype=np.int64)))
            if c:
                out.write(json.dumps({"type": "way", "id": wid, "center": c, "tags": w["tags"]}, ensure_ascii=False) + "\n")
                ways_out += 1
        rels_out = 0
        for rid, r in p1.relations.items():
            refs = list(r["nodes"])
            for wid in r["ways"]:
                w = p2.ways.get(wid)
                if w:
                    refs.extend(w["nodes"])
            c = centre(pos.lookup(np.asarray(refs, dtype=np.int64))) if refs else None
            if c:
                out.write(json.dumps({"type": "relation", "id": rid, "center": c, "tags": r["tags"]}, ensure_ascii=False) + "\n")
                rels_out += 1
    print(f"wrote {dst}: {cands.emitted:,} nodes, {ways_out:,} ways, {rels_out:,} relations in {time.time() - t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))
