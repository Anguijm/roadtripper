/**
 * Which town names the map can draw without one sitting on another
 * (Gauntlet U20). With the corridor towns added, Sweetwater and Abilene
 * sit 60 km apart on Amarillo to Austin, and at state zoom their names
 * drew over each other as "SweeAbilene". Rule 6: the map shows the trip,
 * and a name nobody can read shows nothing.
 *
 * Pure, in screen pixels, so a test can prove it without a map. The names
 * that must stay (the start, the end, a stop's town) are placed first;
 * then each town in the order given, which is the caller's priority, and
 * a town whose name would touch one already placed goes unnamed. Its dot
 * stays: nothing is moved or removed (rule 6), only a label withheld.
 */

/** Average advance of one character of the map's label face (11 px, weight 500), in px. Generous, so an estimate never lets two names touch. */
export const LABEL_CHAR_PX = 6.6;
/**
 * How far above a town's dot its name's centre sits, in px: the label is
 * 14 high, so its bottom is 11 above the dot's centre, clear of the 6 px
 * dot and its stroke. It used to sit on the dot, which a neighbour's name
 * then had to dodge as well as the dot under its own.
 */
export const TOWN_LABEL_DY = -18;
/** A label's line height, in px. */
export const LABEL_HEIGHT_PX = 14;
/** Clear space kept between two names, in px. */
export const LABEL_GAP_PX = 4;

export interface LabelPlacement {
  /** The marker's point on screen, in px. */
  x: number;
  y: number;
  text: string;
  /** Where the label's centre sits relative to the point, in px: TOWN_LABEL_DY for a town, whose name sits just above its dot; -30 for the start, the end and a stop. */
  offsetY: number;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function labelBox(p: LabelPlacement): Box {
  const halfW = (p.text.length * LABEL_CHAR_PX) / 2 + LABEL_GAP_PX / 2;
  const halfH = LABEL_HEIGHT_PX / 2 + LABEL_GAP_PX / 2;
  const cy = p.y + p.offsetY;
  return { left: p.x - halfW, right: p.x + halfW, top: cy - halfH, bottom: cy + halfH };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** A town's dot as drawn: its 6 px radius and 1 px of its stroke's outer half. No gap: a dot is checked against a name's ink, not its line box. */
export const DOT_RADIUS_PX = 7;
/**
 * Half the height of a name's ink, in px: the 11 px face's capitals and
 * descenders, about 9 px, centred on the label. A name's line box (14 px
 * and the gap) is the right size between two names, which must not crowd;
 * against a dot it is not, since its top and bottom are empty (round 1
 * critic: Sweetwater, first in the title, lost its name to a 4 px brush
 * of the line box with Lubbock's dot, and San Angelo to 2 px of
 * Sweetwater's).
 */
export const NAME_INK_HALF_PX = 4.5;

function dotBox(p: { x: number; y: number }): Box {
  const r = DOT_RADIUS_PX;
  return { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r };
}

/** A name's ink: as wide as its characters, as tall as its letters. */
export function inkBox(p: LabelPlacement): Box {
  const halfW = (p.text.length * LABEL_CHAR_PX) / 2;
  const cy = p.y + p.offsetY;
  return { left: p.x - halfW, right: p.x + halfW, top: cy - NAME_INK_HALF_PX, bottom: cy + NAME_INK_HALF_PX };
}

/**
 * The ids of the towns whose names fit. `fixed` are drawn whatever
 * happens and only block; `towns` are tried in order, and each is named
 * when its name touches no name already placed and no named town's dot,
 * and its own dot is under no name already placed. A town left unnamed
 * keeps its dot, drawn under the named ones (the caller's zIndex), so a
 * name may cover an unnamed town's dot but never a named one's (round 1:
 * Abilene's dot sat in the middle of "Sweetwater"; round 2: treating
 * every dot as a wall left no town on the stretch named at all).
 */
export function labelsThatFit(fixed: readonly LabelPlacement[], towns: ReadonlyArray<LabelPlacement & { id: string }>): Set<string> {
  // Names against names by their line boxes; names against dots by ink.
  const names: Box[] = fixed.map(labelBox);
  const inks: Box[] = fixed.map(inkBox);
  const namedDots: Box[] = [];
  const shown = new Set<string>();
  for (const t of towns) {
    const box = labelBox(t);
    const ink = inkBox(t);
    const dot = dotBox(t);
    if (names.some((n) => overlaps(n, box))) continue;
    if (inks.some((n) => overlaps(n, dot))) continue;
    if (namedDots.some((d) => overlaps(d, ink))) continue;
    names.push(box);
    inks.push(ink);
    namedDots.push(dot);
    shown.add(t.id);
  }
  return shown;
}

/**
 * The map's towns in the order of the sheet's title (`ids`), so that when
 * names collide the map keeps the towns the title names first. Towns the
 * title does not list keep their relative order after it. The set is
 * unchanged; only the order is.
 */
export function inTitleOrder<T extends { id: string }>(towns: readonly T[], ids: readonly string[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return towns.map((t, i) => ({ t, i })).sort((a, b) => (rank.get(a.t.id) ?? Infinity) - (rank.get(b.t.id) ?? Infinity) || a.i - b.i).map(({ t }) => t);
}
