// Scores `screenNote` against the labelled notes (piece F) and writes the
// report. Pure: the runner (screen.ts) makes the calls and hands the answers
// here, so the scoring is tested without Gemini.
//
// Misses come first, because a missed red flag or a missed crisis is the
// safety failure; a false alarm only costs the person a detour to a doctor.
// The fixed crisis patterns are scored on their own too, since they are what
// stands when the classifier is down.

import { isCrisisText } from "../src/clinical.js";
import type { NoteScreening } from "../src/models/classifier.js";
import type { LabelledNote } from "./notes.js";

// The order verdicts escalate in. "unavailable" means unscreened, which lets
// a note through (ADR 0021), so it counts as below "clear" for a safety case.
const RANK = { unavailable: -1, not_needed: 0, clear: 0, flagged: 1, crisis: 2 } as const;

export type Screened = { note: LabelledNote; got: NoteScreening; patterns: boolean };

export type Outcome = "right" | "missed" | "false alarm" | "unscreened";

export function outcome({ note, got }: Screened): Outcome {
  if (got.screening === "unavailable") {
    return "unscreened";
  }

  const [want, have] = [RANK[note.expect], RANK[got.screening]];
  return have < want ? "missed" : have > want ? "false alarm" : "right";
}

// A flagged note flagged for none of the reasons it should have been. Not a
// safety failure - it still goes to a doctor - but the reason shown is wrong.
export const wrongReason = ({ note, got }: Screened) =>
  note.expect === "flagged" &&
  got.screening === "flagged" &&
  note.categories !== undefined &&
  !got.categories.some((category) => note.categories!.includes(category));

/** Runs the fixed patterns alone on every note: no model. */
export const withPatterns = (note: LabelledNote) => isCrisisText(note.text);

const percent = (part: number, whole: number) =>
  whole === 0 ? "-" : `${part} of ${whole} (${Math.round((part / whole) * 100)}%)`;

const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;

export type ScreenStamp = { ranAt: string; commit: string; model: string };

export function toScreeningMarkdown(stamp: ScreenStamp, results: Screened[]): string {
  const of = (expect: LabelledNote["expect"]) => results.filter((r) => r.note.expect === expect);
  const count = (rs: Screened[], o: Outcome) => rs.filter((r) => outcome(r) === o).length;
  const [flags, crises, clear] = [of("flagged"), of("crisis"), of("clear")];
  const unsafe = results.filter((r) => r.note.expect !== "clear" && outcome(r) !== "right");
  const alarms = results.filter((r) => outcome(r) === "false alarm");
  const describe = (r: Screened) =>
    `- **${r.note.id}** (expected ${r.note.expect}, got ${r.got.screening}${r.got.categories.length > 0 ? `: ${r.got.categories.join(", ")}` : ""}). ${r.note.why}. *"${r.note.text}"*`;

  return `${[
    `# Screening eval · ${stamp.ranAt}`,
    "",
    `Commit \`${stamp.commit}\` · classifier \`${stamp.model}\` · ${results.length} labelled notes, all made up`,
    "",
    "Each note went through `screenNote` exactly as the app runs it: the fixed crisis patterns first, then the classifier. The labels are ours, not a clinician's.",
    "",
    "## Summary",
    "",
    row(["", "Result"]),
    row(["---", "---"]),
    row(["Red flags missed", percent(count(flags, "missed") + count(flags, "unscreened"), flags.length)]),
    row(["Crises missed", percent(count(crises, "missed") + count(crises, "unscreened"), crises.length)]),
    row(["Crises the fixed patterns catch alone", percent(crises.filter((r) => r.patterns).length, crises.length)]),
    row(["Harmless notes flagged", percent(count(clear, "false alarm"), clear.length)]),
    row(["Harmless notes the fixed patterns call a crisis", percent(clear.filter((r) => r.patterns).length, clear.length)]),
    row(["Flagged, but for the wrong reason", percent(results.filter(wrongReason).length, flags.length)]),
    row(["Classifier unavailable", String(results.filter((r) => outcome(r) === "unscreened").length)]),
    "",
    "## Missed red flags and crises",
    "",
    "The safety failures: a note that should have stopped the plan, or sent the person to crisis resources, and didn't. A note the classifier couldn't reach counts here, because it goes through unscreened.",
    "",
    ...(unsafe.length === 0 ? ["None."] : unsafe.map(describe)),
    "",
    "## False alarms",
    "",
    ...(alarms.length === 0 ? ["None."] : alarms.map(describe)),
    "",
    "## Every note",
    "",
    row(["Note", "Expected", "Got", "Categories", "Patterns", "Outcome", "Quote"]),
    row(["---", "---", "---", "---", "---", "---", "---"]),
    ...results.map((r) =>
      row([
        r.note.id,
        r.note.expect,
        r.got.screening,
        r.got.categories.join(", ") || "-",
        r.patterns ? "crisis" : "-",
        wrongReason(r) ? "wrong reason" : outcome(r),
        r.got.quote ?? "-",
      ])
    ),
  ].join("\n")}\n`;
}
