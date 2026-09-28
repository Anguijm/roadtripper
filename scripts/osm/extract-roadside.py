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

import osmium

TOURISM = {"attraction", "museum", "viewpoint", "artwork", "theme_park", "zoo"}
MAN_MADE = {"lighthouse", "tower"}
NATURAL = {"waterfall", "arch", "cave_entrance"}
BOUNDARY = {"national_park", "protected_area"}
# A relation or way with more nodes than this is a big park or a long river;
# every k-th node is enough for a centre and keeps the node table small.
NODE_SAMPLE_OVER = 2000


def candidate(tags) -> bool:
    if "name" not in tags:
        return False
    if tags.get("tourism") in TOURISM:
        return True
    if "historic" in tags:
        return True
    if tags.get("man_made") in MAN_MADE:
        return True
    if tags.get("natural") in NATURAL:
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
        self.need = set()

    def way(self, w):
        is_candidate = candidate(w.tags)
        if not is_candidate and w.id not in self.member_ways:
            return
        refs = [n.ref for n in w.nodes]
        if len(refs) > NODE_SAMPLE_OVER:
            step = len(refs) // NODE_SAMPLE_OVER + 1
            refs = refs[::step]
        self.ways[w.id] = {"tags": tagdict(w.tags) if is_candidate else None, "nodes": refs}
        self.need.update(refs)


class Pass3(osmium.SimpleHandler):
    """Emit candidate nodes; remember the positions the ways asked for."""

    def __init__(self, need, out):
        super().__init__()
        self.need = need
        self.pos = {}
        self.out = out
        self.emitted = 0

    def node(self, n):
        if n.id in self.need and n.location.valid():
            self.pos[n.id] = (n.location.lat, n.location.lon)
        if candidate(n.tags) and n.location.valid():
            self.out.write(json.dumps({"type": "node", "id": n.id, "lat": n.location.lat, "lon": n.location.lon, "tags": tagdict(n.tags)}, ensure_ascii=False) + "\n")
            self.emitted += 1


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
    print(f"pass 2: {sum(1 for w in p2.ways.values() if w['tags']):,} candidate ways, {len(p2.ways):,} ways kept, {len(p2.need):,} nodes needed, {time.time() - t0:.0f}s", flush=True)
    need = set(p2.need) | p1.member_nodes
    with open(dst, "w", encoding="utf-8") as out:
        p3 = Pass3(need, out)
        p3.apply_file(src)
        print(f"pass 3: {p3.emitted:,} candidate nodes emitted, {len(p3.pos):,} positions held, {time.time() - t0:.0f}s", flush=True)
        ways_out = 0
        for wid, w in p2.ways.items():
            if not w["tags"]:
                continue
            c = centre([p3.pos[r] for r in w["nodes"] if r in p3.pos])
            if c:
                out.write(json.dumps({"type": "way", "id": wid, "center": c, "tags": w["tags"]}, ensure_ascii=False) + "\n")
                ways_out += 1
        rels_out = 0
        for rid, r in p1.relations.items():
            pts = [p3.pos[n] for n in r["nodes"] if n in p3.pos]
            for wid in r["ways"]:
                w = p2.ways.get(wid)
                if w:
                    pts.extend(p3.pos[n] for n in w["nodes"] if n in p3.pos)
            c = centre(pts)
            if c:
                out.write(json.dumps({"type": "relation", "id": rid, "center": c, "tags": r["tags"]}, ensure_ascii=False) + "\n")
                rels_out += 1
    print(f"wrote {dst}: {p3.emitted:,} nodes, {ways_out:,} ways, {rels_out:,} relations in {time.time() - t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))
