/**
 * The labels back off the sheet (step 20's second half).
 *
 * John labels the hundred on a phone, one dropdown per row: worth it, no,
 * unsure. The sheet is read through the Docs tools and transcribed to a
 * tab-separated file of id and label; this module checks that file
 * against the sample it was drawn from and shapes the result for the
 * step 21 bench. Pure: the script (scripts/label-import.ts) does the
 * reading and writing.
 */

import { z } from "zod/v4";
import { RoadsideKindSchema, type RoadsideKind } from "./record";

export const LabelSchema = z.enum(["worth_it", "no", "unsure"]);
export type Label = z.infer<typeof LabelSchema>;

/** What the sheet's dropdown shows for each label. */
export const LABEL_WORDS: Record<Label, string> = { worth_it: "Worth it", no: "No", unsure: "Unsure" };

/**
 * The shape of `data/labels/<corridor>.labels.json`. Exported so the bench
 * validates the file on read; a hand edit that adds a fourth label or
 * drops a field fails there, not in a chart.
 */
export const LabelledRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: RoadsideKindSchema,
  label: LabelSchema,
});
export type LabelledRow = z.infer<typeof LabelledRowSchema>;
export const LabelsFileSchema = z.object({
  corridor: z.string().min(1),
  /** From the sample file: the labels belong to that draw, not to the corridor in general. */
  sampledAt: z.string().min(1),
  importedAt: z.string().min(1),
  labels: z.array(LabelledRowSchema),
});
export type LabelsFile = z.infer<typeof LabelsFileSchema>;

export interface ParsedLabelRow {
  /** One-based, for the error messages. */
  line: number;
  id: string;
  /** Null when the cell was blank: not labelled yet. */
  label: Label | null;
}
export interface ParsedSheet {
  rows: ParsedLabelRow[];
  errors: string[];
}

/**
 * The dropdown's words, as a thumb types or pastes them: case does not
 * matter, and spaces, underscores and dashes between the words are all
 * one space. Blank is null; anything else is unknown.
 */
export function labelFromWord(raw: string): Label | null | "unknown" {
  const word = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (word === "") return null;
  if (word === "worth it") return "worth_it";
  if (word === "no") return "no";
  if (word === "unsure") return "unsure";
  return "unknown";
}

/**
 * Tab-separated, one row a line: id, then the label word. A first line
 * whose id cell is "id" is a header and skipped. Blank lines are skipped.
 * Every problem is an error naming its line; parsing goes on past it so
 * one run reports them all.
 */
export function parseLabelSheet(text: string): ParsedSheet {
  const rows: ParsedLabelRow[] = [];
  const errors: string[] = [];
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  let first = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const cells = line.split("\t");
    const id = (cells[0] ?? "").trim();
    if (first) {
      first = false;
      if (id.toLowerCase() === "id") continue;
    }
    const n = i + 1;
    if (!id) {
      errors.push(`line ${n}: no id`);
      continue;
    }
    const label = labelFromWord(cells[1] ?? "");
    if (label === "unknown") {
      errors.push(`line ${n}: unknown label "${(cells[1] ?? "").trim()}" for ${id}`);
      continue;
    }
    rows.push({ line: n, id, label });
  }
  return { rows, errors };
}

export interface SampleRow {
  id: string;
  name: string;
  kind: RoadsideKind;
}
export interface MergedLabels {
  /** One per labelled sample row, in sample order. */
  labels: LabelledRow[];
  /** Sample ids the sheet left blank or did not mention. */
  unlabelled: string[];
  /** Sheet ids that are not in the sample: the wrong sheet, or a typo. */
  unknown: string[];
  /** Sheet ids given two different labels. */
  conflicts: string[];
}

/**
 * Join the sheet to the sample by id. The sample is the authority on
 * which rows exist and in what order; the sheet is the authority on the
 * label. Unknown ids and conflicts are reported, not resolved, since
 * either means the transcription is wrong somewhere and a guess would
 * hide it.
 */
export function mergeLabels(sample: readonly SampleRow[], rows: readonly ParsedLabelRow[]): MergedLabels {
  const known = new Set(sample.map((s) => s.id));
  const byId = new Map<string, Label | null>();
  const unknown: string[] = [];
  const conflicts: string[] = [];
  for (const row of rows) {
    if (!known.has(row.id)) {
      if (!unknown.includes(row.id)) unknown.push(row.id);
      continue;
    }
    if (row.label === null) {
      if (!byId.has(row.id)) byId.set(row.id, null);
      continue;
    }
    const seen = byId.get(row.id);
    if (seen != null && seen !== row.label) {
      if (!conflicts.includes(row.id)) conflicts.push(row.id);
      continue;
    }
    byId.set(row.id, row.label);
  }
  const labels: LabelledRow[] = [];
  const unlabelled: string[] = [];
  for (const s of sample) {
    const label = byId.get(s.id) ?? null;
    if (label === null) unlabelled.push(s.id);
    else labels.push({ id: s.id, name: s.name, kind: s.kind, label });
  }
  return { labels, unlabelled, unknown, conflicts };
}
