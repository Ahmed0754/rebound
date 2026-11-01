// The labelled notes and how they are scored: no Gemini. The fixed crisis
// patterns need no model, so they are checked against the notes here too.

import { describe, it, expect } from "vitest";
import { RED_FLAGS } from "../src/clinical.js";
import { NOTE_CATEGORIES, type NoteScreening } from "../src/models/classifier.js";
import { NOTES, type LabelledNote } from "./notes.js";
import { outcome, toScreeningMarkdown, withPatterns, wrongReason, type Screened } from "./screening.js";

describe("the labelled notes", () => {
  it("have unique ids and only the classifier's own categories", () => {
    expect(new Set(NOTES.map((n) => n.id)).size).toBe(NOTES.length);
    expect(NOTES.flatMap((n) => n.categories ?? []).filter((c) => !(NOTE_CATEGORIES as readonly string[]).includes(c))).toEqual([]);
  });

  it("hide every structured red flag in at least one note", () => {
    const covered = new Set(NOTES.flatMap((n) => n.categories ?? []));

    expect(RED_FLAGS.filter((flag) => !covered.has(flag))).toEqual([]);
  });

  it("never trip the fixed crisis patterns on a harmless note", () => {
    expect(NOTES.filter((n) => n.expect === "clear" && withPatterns(n)).map((n) => n.id)).toEqual([]);
  });

  it("include crises the patterns catch and crises only the classifier can", () => {
    const crises = NOTES.filter((n) => n.expect === "crisis");

    expect(crises.filter(withPatterns).map((n) => n.id)).toEqual(["crisis-pattern", "crisis-curly-apostrophe"]);
    expect(crises.filter((n) => !withPatterns(n)).length).toBeGreaterThan(0);
  });
});

const got = (screening: NoteScreening["screening"], categories: string[] = []): NoteScreening => ({
  screening,
  categories,
  quote: null,
  model: "m",
});
const note = (expect: LabelledNote["expect"], categories?: string[]): LabelledNote => ({
  id: `n-${expect}`,
  text: "text",
  expect,
  categories,
  why: "why",
});
const screened = (n: LabelledNote, g: NoteScreening): Screened => ({ note: n, got: g, patterns: false });

describe("outcome", () => {
  it("calls a lower verdict than expected a miss, and a higher one a false alarm", () => {
    expect(outcome(screened(note("crisis"), got("flagged")))).toBe("missed");
    expect(outcome(screened(note("flagged"), got("clear")))).toBe("missed");
    expect(outcome(screened(note("clear"), got("flagged")))).toBe("false alarm");
    expect(outcome(screened(note("flagged"), got("flagged")))).toBe("right");
  });

  it("keeps an unreachable classifier apart, and counts it as missed in the report", () => {
    const unscreened = screened(note("flagged"), got("unavailable"));
    const md = toScreeningMarkdown({ ranAt: "t", commit: "c", model: "m" }, [unscreened]);

    expect(outcome(unscreened)).toBe("unscreened");
    expect(md).toContain("| Red flags missed | 1 of 1 (100%) |");
    expect(md).toContain("| Classifier unavailable | 1 |");
  });

  it("notes a flag raised for none of the right reasons", () => {
    expect(wrongReason(screened(note("flagged", ["night_pain"]), got("flagged", ["recent_trauma"])))).toBe(true);
    expect(wrongReason(screened(note("flagged", ["night_pain"]), got("flagged", ["night_pain"])))).toBe(false);
  });
});

describe("toScreeningMarkdown", () => {
  it("lists the safety failures before the false alarms", () => {
    const md = toScreeningMarkdown({ ranAt: "t", commit: "c", model: "m" }, [
      screened(note("clear"), got("flagged", ["other_medical"])),
      screened(note("crisis"), got("clear")),
    ]);

    expect(md.indexOf("## Missed red flags and crises")).toBeLessThan(md.indexOf("## False alarms"));
    expect(md).toContain("- **n-crisis** (expected crisis, got clear)");
    expect(md).toContain("| Crises missed | 1 of 1 (100%) |");
    expect(md).toContain("| Harmless notes flagged | 1 of 1 (100%) |");
  });
});
