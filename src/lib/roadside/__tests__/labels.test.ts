import { describe, it, expect } from "vitest";
import { labelFromWord, parseLabelSheet, mergeLabels, LabelsFileSchema, SampleFileSchema, type SampleRow } from "../labels";

const sample: SampleRow[] = [
  { id: "osm:node:1", name: "Cadillac Ranch", kind: "artwork" },
  { id: "osm:way:2", name: "Big Texan", kind: "notable" },
  { id: "osm:node:3", name: "Some House", kind: "historic" },
];

describe("the label words", () => {
  it("accepts the dropdown's three words in any case or spacing, and blank as not yet labelled", () => {
    expect(labelFromWord("Worth it")).toBe("worth_it");
    expect(labelFromWord("WORTH_IT")).toBe("worth_it");
    expect(labelFromWord("  worth-it ")).toBe("worth_it");
    expect(labelFromWord("No")).toBe("no");
    expect(labelFromWord("unsure")).toBe("unsure");
    expect(labelFromWord("")).toBeNull();
    expect(labelFromWord("   ")).toBeNull();
  });

  it("calls anything else unknown rather than guessing", () => {
    expect(labelFromWord("yes")).toBe("unknown");
    expect(labelFromWord("worth")).toBe("unknown");
    expect(labelFromWord("maybe")).toBe("unknown");
  });
});

describe("parsing the sheet", () => {
  it("skips a header and blank lines, and keeps the line number on each row", () => {
    const { rows, errors } = parseLabelSheet("id\tlabel\r\nosm:node:1\tWorth it\r\n\r\nosm:way:2\t\nosm:node:3\tNo\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, id: "osm:node:1", label: "worth_it" },
      { line: 4, id: "osm:way:2", label: null },
      { line: 5, id: "osm:node:3", label: "no" },
    ]);
  });

  it("names the line for an unknown word or a missing id, and reads on", () => {
    const { rows, errors } = parseLabelSheet("osm:node:1\tyes\n\tNo\nosm:node:3\tUnsure\n");
    expect(errors).toEqual(['line 1: unknown label "yes" for osm:node:1', "line 2: no id"]);
    expect(rows).toEqual([{ line: 3, id: "osm:node:3", label: "unsure" }]);
  });
});

describe("merging labels into the sample", () => {
  it("keeps sample order, lists the unlabelled, and carries name and kind", () => {
    const { rows } = parseLabelSheet("osm:node:3\tNo\nosm:node:1\tWorth it\n");
    const merged = mergeLabels(sample, rows);
    expect(merged.labels).toEqual([
      { id: "osm:node:1", name: "Cadillac Ranch", kind: "artwork", label: "worth_it" },
      { id: "osm:node:3", name: "Some House", kind: "historic", label: "no" },
    ]);
    expect(merged.unlabelled).toEqual(["osm:way:2"]);
    expect(merged.unknown).toEqual([]);
    expect(merged.conflicts).toEqual([]);
  });

  it("reports ids not in the sample and ids labelled two ways, and does not count the same label twice as a conflict", () => {
    const { rows } = parseLabelSheet("osm:node:9\tNo\nosm:node:1\tWorth it\nosm:node:1\tNo\nosm:way:2\tUnsure\nosm:way:2\tunsure\n");
    const merged = mergeLabels(sample, rows);
    expect(merged.unknown).toEqual(["osm:node:9"]);
    expect(merged.conflicts).toEqual(["osm:node:1"]);
    expect(merged.labels.map((l) => [l.id, l.label])).toEqual([
      ["osm:node:1", "worth_it"],
      ["osm:way:2", "unsure"],
    ]);
  });

  it("treats a blank cell after a label as no change, not as a conflict", () => {
    const { rows } = parseLabelSheet("osm:node:1\tWorth it\nosm:node:1\t\n");
    const merged = mergeLabels(sample, rows);
    expect(merged.conflicts).toEqual([]);
    expect(merged.labels.map((l) => l.label)).toEqual(["worth_it"]);
  });
});

describe("the sample file", () => {
  it("refuses a duplicate id and a kind outside the enum, and ignores the sheet's columns", () => {
    const row = { id: "osm:node:1", name: "Cadillac Ranch", kind: "artwork", alongKm: 3, map: "https://example.test", osm: null };
    const good = { corridor: "amarillo-austin", sampledAt: "2026-09-28T00:00:00Z", size: 1, rows: [row] };
    const parsed = SampleFileSchema.safeParse(good);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.rows[0]).toEqual({ id: "osm:node:1", name: "Cadillac Ranch", kind: "artwork" });
    expect(SampleFileSchema.safeParse({ ...good, rows: [row, { ...row, name: "Again" }] }).success).toBe(false);
    expect(SampleFileSchema.safeParse({ ...good, rows: [{ ...row, kind: "diner" }] }).success).toBe(false);
  });
});

describe("the labels file", () => {
  it("refuses a fourth label and a missing field", () => {
    const good = { corridor: "amarillo-austin", sampledAt: "2026-09-28T00:00:00Z", importedAt: "2026-09-28T01:00:00Z", labels: [{ id: "osm:node:1", name: "Cadillac Ranch", kind: "artwork", label: "worth_it" }] };
    expect(LabelsFileSchema.safeParse(good).success).toBe(true);
    expect(LabelsFileSchema.safeParse({ ...good, labels: [{ ...good.labels[0], label: "maybe" }] }).success).toBe(false);
    expect(LabelsFileSchema.safeParse({ ...good, sampledAt: undefined }).success).toBe(false);
  });
});
