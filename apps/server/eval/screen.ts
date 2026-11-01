// The screening eval (piece F): every labelled note through `screenNote`, as
// the app runs it, and a report in eval/reports/<time>.screening.md and .json.
// `pnpm eval:screen`. One call per note; the notes are made up.

import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { screenNote } from "../src/models/classifier.js";
import { NOTES } from "./notes.js";
import { REPORTS } from "./report.js";
import { toScreeningMarkdown, withPatterns, type Screened, type ScreenStamp } from "./screening.js";

const results: Screened[] = [];

// One at a time, for the API key's rate limit.
for (const note of NOTES) {
  const got = await screenNote(note.text);
  results.push({ note, got, patterns: withPatterns(note) });
  console.log(`${note.id} · expected ${note.expect} · got ${got.screening}`);
}

const stamp: ScreenStamp = {
  ranAt: new Date().toISOString(),
  commit: execSync("git describe --always --dirty").toString().trim(),
  // Which model answered; null only when none could be reached.
  model: results.find((r) => r.got.model !== null)?.got.model ?? "none reached",
};
const markdown = toScreeningMarkdown(stamp, results);

await mkdir(REPORTS, { recursive: true });
const file = join(REPORTS, `${stamp.ranAt.replace(/[:.]/g, "-")}.screening`);
await writeFile(`${file}.json`, `${JSON.stringify({ ...stamp, results }, null, 2)}\n`);
await writeFile(`${file}.md`, markdown);
console.log(`\n${markdown}\nWrote ${file}.json and .md`);
