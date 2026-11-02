import { describe, expect, it } from "vitest";
import { CRITERIA } from "../src/quality.js";
import { PROVISIONAL, rubric } from "./graders.js";
import { SAFETY } from "./judge.js";
import { expandSources, indexReferences, loadReferences, readTables, sourcesIn } from "./reference-index.js";

describe("readTables", () => {
  it("keys each row by its table's headers, under the headings it sits in", () => {
    const rows = readTables(
      ["## 1. Sources", "### Other", "", "| Id | Read |", "|---|---|", "| `X-1` | Primary |", "| `X-2` | Summary |", "", "Prose."].join("\n")
    );

    expect(rows).toEqual([
      { section: "1. Sources", subsection: "Other", cells: { Id: "`X-1`", Read: "Primary" } },
      { section: "1. Sources", subsection: "Other", cells: { Id: "`X-2`", Read: "Summary" } },
    ]);
  });
});

describe("expandSources", () => {
  const index = indexReferences(["## 1. Sources", "| Id |", "|---|", "| `AAOS-KNEE` |", "| `AAOS-HIP` |", "| `ACSM-RT-2009` |"].join("\n"));

  it("expands a wildcard the way the document writes one", () => {
    expect(expandSources(["AAOS-*"], index)).toEqual(["AAOS-KNEE", "AAOS-HIP"]);
  });

  it("finds the backticked ids in a cell, and only known ones", () => {
    expect(sourcesIn("`ACSM-RT-2009` via a summary; `AAOS-*`; `NOPE-1`", index)).toEqual([
      "ACSM-RT-2009",
      "AAOS-KNEE",
      "AAOS-HIP",
    ]);
  });
});

// The evaluation page shows the row behind every id the code grades by, so
// an id with no row is a grade nobody can trace back to its source.
describe("REFERENCES.md covers what the code cites", async () => {
  const index = await loadReferences();

  it("has a row for every criterion", () => {
    for (const { id } of [...CRITERIA, ...PROVISIONAL]) {
      expect(index.criteria, id).toHaveProperty([id]);
    }
  });

  it("has a row for every safety statement", () => {
    for (const { id } of SAFETY) {
      expect(index.safety, id).toHaveProperty([id]);
    }
  });

  it("has a source for every id a criterion or benchmark credits", () => {
    const credited = [...CRITERIA, ...PROVISIONAL, ...rubric().benchmarks].flatMap((c) => c.sources);

    for (const id of credited) {
      expect(index.sources, id).toHaveProperty([id]);
    }
  });
});
