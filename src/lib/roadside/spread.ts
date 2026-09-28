/**
 * Where the roadside diamonds go on the map when their points are too
 * close to tap apart (Gauntlet U1, rounds 3 and 6). Pure: pixels from
 * latitude, longitude and zoom by the map's own projection, so a test can
 * prove the shape without a map.
 *
 * A diamond's tap target is its 44 px canvas, so two diamonds closer than
 * SPREAD_PX centre to centre share a target and only the upper one answers
 * a tap. Round 3 turned each stack of such diamonds into a ring around its
 * strongest member, checked against its own members only; a ring's member
 * then landed on a diamond of another stack (The Big Texan, at the bottom
 * of Amarillo's ring, on the Museum of the Llano Estacado's point, 28 px
 * down the road at zoom 5) and a ring's lower members went under the
 * sheet (round-5 critic, rule 4). So now every diamond is placed against
 * every diamond placed before it, and a moved diamond stays inside a box
 * the map gives (the strip above the sheet on a phone).
 *
 * The placement: the tapped one first, then the strongest first. A stop
 * sits on its own point when no placed diamond is within SPREAD_PX of it;
 * else it takes the first slot of SPREAD_SLOTS around its point that is at
 * least SPREAD_PX from every placed diamond and inside the box; with no
 * such slot it waits for a closer zoom. The slots are 44 px out, sideways
 * before up before down (the sheet is below, the town's name above), then
 * 88 px out the same way. Six of the twelve at 44 px can be used at once
 * (a hexagon) and ten of the twenty-four at 88 in the order they are
 * tried, so a point holds seventeen and the rest wait, the rule the
 * corridor already follows state-wide (roadsideMinProbabilityAt in
 * src/components/RouteMap.tsx).
 */

export interface SpreadStop {
  id: string;
  lat: number;
  lng: number;
  /** Strength; the strongest is placed first and keeps its own point. */
  p: number;
}

export interface Placement {
  /** Pixels to move the diamond right and down from its own point. Zero when it sits on its point. */
  dx: number;
  dy: number;
  /** False for a stop with no free slot at this zoom. */
  shown: boolean;
}

/** A box in the map's pixels at the zoom the placement is made at; a moved diamond's centre stays inside it. */
export interface PxBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The least distance between two diamonds' centres: the 44 px touch canvas, so canvases touch and never overlap. */
export const SPREAD_PX = 44;

/**
 * The slots a moved diamond may take, in the order they are tried: a
 * radius and an angle in the map's pixels (0 is right, 90 is down). At
 * each radius sideways first, then the upper angles from shallow to
 * steep, then the lower ones the same way: on a phone the sheet is
 * below the road and the start's name is straight above its dot.
 */
export const SPREAD_SLOTS: ReadonlyArray<{ dx: number; dy: number }> = (() => {
  const order = (step: number): number[] => {
    const out = [0, 180];
    for (let a = step; a < 90; a += step) out.push(360 - a, 180 + a);
    out.push(270);
    for (let a = step; a < 90; a += step) out.push(a, 180 - a);
    out.push(90);
    return out;
  };
  const slots: { dx: number; dy: number }[] = [];
  for (const [r, step] of [[SPREAD_PX, 30], [2 * SPREAD_PX, 15]] as const) {
    for (const deg of order(step)) {
      const a = (deg * Math.PI) / 180;
      slots.push({ dx: Math.round(r * Math.cos(a)), dy: Math.round(r * Math.sin(a)) });
    }
  }
  return slots;
})();

/**
 * Web Mercator pixels at a zoom with 256 px tiles, which is what Google's
 * map draws. Only differences between points are used, so the origin does
 * not matter; a fractional zoom (a pinch) is fine.
 */
export function mercatorPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const size = 256 * Math.pow(2, zoom);
  const phi = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size,
  };
}

/**
 * The box a moved diamond stays in, from the map's bounds at its zoom,
 * inset by half the visible diamond so no moved diamond is clipped at an
 * edge. `visibleHeightPx` is the height of the map that is on screen from
 * its top edge (the strip above the sheet on a phone); left out, the whole
 * map is.
 */
export function diamondBox(
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number,
  halfDiamondPx: number,
  visibleHeightPx?: number
): PxBox {
  const nw = mercatorPx(bounds.north, bounds.west, zoom);
  const se = mercatorPx(bounds.south, bounds.east, zoom);
  const bottom = visibleHeightPx === undefined ? se.y : nw.y + visibleHeightPx;
  return { left: nw.x + halfDiamondPx, top: nw.y + halfDiamondPx, right: se.x - halfDiamondPx, bottom: bottom - halfDiamondPx };
}

const inside = (x: number, y: number, box: PxBox | undefined): boolean =>
  box === undefined || (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);

/**
 * A placement for every stop given, keyed by id. `keepId` (the tapped one)
 * is placed first, so it is on its own point whatever its strength.
 */
export function roadsideSpread(stops: readonly SpreadStop[], zoom: number, keepId: string | null = null, box?: PxBox): Map<string, Placement> {
  const px = new Map<string, { x: number; y: number }>();
  for (const s of stops) px.set(s.id, mercatorPx(s.lat, s.lng, zoom));
  const order = [...stops].sort((a, b) => (a.id === keepId ? -1 : b.id === keepId ? 1 : 0) || b.p - a.p || a.id.localeCompare(b.id));
  const placed: { x: number; y: number }[] = [];
  // Strictly less, so a slot exactly SPREAD_PX from a diamond (a hexagon's
  // neighbours, the second ring against the first) is free.
  const free = (x: number, y: number) => placed.every((q) => Math.hypot(q.x - x, q.y - y) >= SPREAD_PX - 1e-6);
  const out = new Map<string, Placement>();
  for (const s of order) {
    const p = px.get(s.id)!;
    if (free(p.x, p.y)) {
      placed.push(p);
      out.set(s.id, { dx: 0, dy: 0, shown: true });
      continue;
    }
    const slot = SPREAD_SLOTS.find((d) => inside(p.x + d.dx, p.y + d.dy, box) && free(p.x + d.dx, p.y + d.dy));
    if (slot) {
      placed.push({ x: p.x + slot.dx, y: p.y + slot.dy });
      out.set(s.id, { dx: slot.dx, dy: slot.dy, shown: true });
    } else {
      out.set(s.id, { dx: 0, dy: 0, shown: false });
    }
  }
  return out;
}
