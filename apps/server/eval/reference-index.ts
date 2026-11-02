// REFERENCES.md, read as data: the tables in it, keyed by the ids the code
// already cites (AAOS-KNEE, KNEE-2, SAFE-1), so an evaluation can show the
// source behind every grade without a second copy of any of it.
//
// Not the typed `references.ts` REFERENCES.md promises once its criteria are
// reviewed. That one replaces the document; this only reads it, so the
// document stays the one place an entry is written, and an edit to it shows
// up on the next restart.
//
// Tables only. Every source, criterion, safety statement and reference plan
// is a table row; the prose around them is for whoever reads the file.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** One table row, its cells keyed by the table's own headers. */
export type Row = {
  // The `## ` and `### ` headings the table sits under.
  section: string;
  subsection: string | null;
  cells: Record<string, string>;
};

export type ReferenceIndex = {
  // §1, by source id.
  sources: Record<string, Row>;
  // §3, by criterion id.
  criteria: Record<string, Row>;
  // §4, by statement id.
  safety: Record<string, Row>;
  // §2, by the parameter it benchmarks ("Static stretch hold").
  benchmarks: Record<string, Row>;
  // §5, every row, under the AAOS program it is from.
  referencePlans: Row[];
  // "How each source was read": Primary, Summary, Cited only.
  readLabels: Row[];
};

const FILE = join(import.meta.dirname, "REFERENCES.md");

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

const isDivider = (line: string) => /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line.trim());

/** Every table in a markdown document, row by row. Pure. */
export function readTables(markdown: string): Row[] {
  const lines = markdown.split(/\r?\n/);
  const rows: Row[] = [];
  let section = "";
  let subsection: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      subsection = null;
    } else if (line.startsWith("### ")) {
      subsection = line.slice(4).trim();
    } else if (line.trim().startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const headers = cellsOf(line);
      i += 2;

      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) {
        const values = cellsOf(lines[i]);
        rows.push({
          section,
          subsection,
          cells: Object.fromEntries(headers.map((header, n) => [header, values[n] ?? ""])),
        });
      }

      i--;
    }
  }

  return rows;
}

// A cell like "`AAOS-KNEE`" names an id; anything else in the first column
// is a row with no id of its own.
const idOf = (row: Row) => /^`([A-Za-z0-9-]+)`$/.exec(Object.values(row.cells)[0] ?? "")?.[1];

function keyed(rows: Row[], sectionStart: string): Record<string, Row> {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const id = row.section.startsWith(sectionStart) ? idOf(row) : undefined;
      return id === undefined ? [] : [[id, row]];
    })
  );
}

/** Builds the index from the document's text. Pure. */
export function indexReferences(markdown: string): ReferenceIndex {
  const rows = readTables(markdown);

  return {
    sources: keyed(rows, "1."),
    criteria: keyed(rows, "3."),
    safety: keyed(rows, "4."),
    benchmarks: Object.fromEntries(
      rows
        .filter((row) => row.section.startsWith("2.") && row.cells.Parameter)
        .map((row) => [row.cells.Parameter.replace(/\*\*/g, ""), row])
    ),
    referencePlans: rows.filter((row) => row.section.startsWith("5.") && row.subsection !== null),
    readLabels: rows.filter((row) => row.section.startsWith("How each source was read")),
  };
}

// Read once per process, like the region mapping: the file changes by someone
// editing it, never by a request.
let loaded: Promise<ReferenceIndex> | null = null;

export function loadReferences(): Promise<ReferenceIndex> {
  loaded ??= readFile(FILE, "utf8").then(indexReferences);
  return loaded;
}

/**
 * The source ids a list names, wildcards expanded: `AAOS-*` is every AAOS
 * program, the way REFERENCES.md writes it.
 */
export function expandSources(ids: string[], index: ReferenceIndex): string[] {
  const known = Object.keys(index.sources);

  return [
    ...new Set(
      ids.flatMap((id) => (id.endsWith("*") ? known.filter((k) => k.startsWith(id.slice(0, -1))) : [id]))
    ),
  ];
}

/** Every source id mentioned in a cell's text, in backticks, as the document writes them. */
export function sourcesIn(text: string, index: ReferenceIndex): string[] {
  const named = [...text.matchAll(/`([A-Z][A-Za-z0-9]*-[A-Za-z0-9*-]+)`/g)].map((match) => match[1]);
  return expandSources(named, index).filter((id) => id in index.sources);
}
