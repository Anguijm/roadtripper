import { describe, it, expect } from "vitest";
import { labelsThatFit, placeLabels, inTitleOrder, labelBox, LABEL_CHAR_PX, TOWN_LABEL_DY, type LabelPlacement } from "../labels";

const town = (id: string, x: number, y: number, text = id): LabelPlacement & { id: string } => ({ id, x, y, text, offsetY: TOWN_LABEL_DY });

describe("which town names the map can draw (U20)", () => {
  it("names towns whose names are clear of each other", () => {
    expect([...labelsThatFit([], [town("Lubbock", 100, 100), town("Abilene", 100, 200)])]).toEqual(["Lubbock", "Abilene"]);
  });

  it("keeps the first of two names that would overlap, in the order given", () => {
    // 50 px apart side by side: "Sweetwater" (66 px) and "Abilene" (46 px)
    // overlap, while neither name reaches the other's dot, so only the
    // name-on-name rule decides (round 1 of the mutation proof: at 20 px
    // the dot rules alone kept this test green, and at 40 Abilene's dot sat
    // under "Sweetwater").
    const a = town("Sweetwater", 100, 100), b = town("Abilene", 150, 100);
    expect([...labelsThatFit([], [a, b])]).toEqual(["Sweetwater"]);
    expect([...labelsThatFit([], [b, a])]).toEqual(["Abilene"]);
  });

  it("never names a town whose name would sit on a named town's dot", () => {
    // B's name, 18 px above B, reaches over A's dot just above-left.
    const a = town("A", 100, 100), b = town("Bbbbbbbbbb", 90, 118);
    expect([...labelsThatFit([], [a, b])]).toEqual(["A"]);
  });

  it("lets a name's empty line box brush a named dot, as long as its letters do not (round 1 critic)", () => {
    // B sits 31 px below A: B's line box (centre 13 px below A, 9 px tall
    // each side with the gap) reaches A's dot, which ends 7 px below A;
    // B's letters (4.5 px each side of centre, so from 8.5 px below A)
    // clear it, and B is named.
    const a = town("Lubbock", 100, 100), b = town("Sweetwater", 110, 131);
    expect([...labelsThatFit([], [a, b])]).toEqual(["Lubbock", "Sweetwater"]);
    // 2 px nearer, the letters touch the dot, and B is not named.
    expect([...labelsThatFit([], [a, town("Sweetwater", 110, 129)])]).toEqual(["Lubbock"]);
  });

  it("never names a town whose own dot is under a name already placed", () => {
    // B's dot sits inside A's name.
    const a = town("Aaaaaaaaaa", 100, 100), b = town("B", 110, 100 + TOWN_LABEL_DY);
    expect([...labelsThatFit([], [a, b])]).toEqual(["Aaaaaaaaaa"]);
  });

  it("lets a name cover a dot only of a town that stays unnamed", () => {
    // B comes first and is blocked by the start's name; A's name may then
    // cover B's dot, which is drawn under it.
    const start: LabelPlacement = { x: 200, y: 130, text: "Amarillo", offsetY: -30 };
    const b = town("Bee", 200, 118), a = town("Aaaaaaaaaa", 190, 136);
    const shown = labelsThatFit([start], [b, a]);
    expect(shown.has("Bee")).toBe(false);
    expect(shown.has("Aaaaaaaaaa")).toBe(true);
  });

  it("never names a town over the start's, the end's or a stop's name", () => {
    const end: LabelPlacement = { x: 100, y: 130, text: "Austin", offsetY: -30 };
    expect(labelsThatFit([end], [town("Round Rock", 100, 118)]).size).toBe(0);
  });

  it("sizes a name by its characters and centres it above the dot", () => {
    const b = labelBox({ x: 0, y: 0, text: "Abilene", offsetY: TOWN_LABEL_DY });
    expect(b.right - b.left).toBeGreaterThanOrEqual(7 * LABEL_CHAR_PX);
    expect(b.bottom).toBeLessThan(-6); // clear of the 6 px dot
  });
});

describe("the map's towns in the title's order (U20)", () => {
  it("puts the title's towns first, in its order, and keeps the rest after in theirs", () => {
    const towns = [{ id: "abilene" }, { id: "x" }, { id: "sweetwater" }, { id: "lubbock" }, { id: "y" }];
    expect(inTitleOrder(towns, ["lubbock", "sweetwater", "abilene"]).map((t) => t.id)).toEqual(["lubbock", "sweetwater", "abilene", "x", "y"]);
  });
});

describe("a name with a second side (U29)", () => {
  it("sits above its mark when it can, below when above is taken, and gives way when neither fits", () => {
    const end: LabelPlacement = { x: 100, y: 100, text: "Denver", offsetY: -30 };
    // A ring 20 px right of Denver's dot and 5 px below it: above collides
    // with "Denver" (drawn 30 px above its dot), below is clear.
    const night = { id: "n", x: 120, y: 95, text: "Night 2", offsetY: TOWN_LABEL_DY, altOffsetY: -TOWN_LABEL_DY };
    expect(placeLabels([end], [night]).get("n")).toBe(-TOWN_LABEL_DY);
    // Alone, it takes the first side.
    expect(placeLabels([], [night]).get("n")).toBe(TOWN_LABEL_DY);
    // Both sides taken: not named.
    const under: LabelPlacement = { x: 120, y: 113, text: "Something", offsetY: 0 };
    expect(placeLabels([end, under], [night]).has("n")).toBe(false);
  });
});
