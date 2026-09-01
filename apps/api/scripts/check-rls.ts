/**
 * Fails the build if any table in the public schema lacks an explicit RLS
 * decision in db/rls-policies.md, or has RLS disabled without being listed as
 * an exemption.
 *
 * This exists because vigilance demonstrably does not work: v1 fixed seven
 * publicly-readable tables and then let one regress, undetected, until an audit.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

type TableRow = { tablename: string; rowsecurity: boolean };

async function main() {
  const docPath = fileURLToPath(new URL("../db/rls-policies.md", import.meta.url));
  const doc = await readFile(docPath, "utf8");

  // Table names are the first cell of each row in the decisions table.
  const declared = new Map<string, string>();
  for (const line of doc.split("\n")) {
    const m = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]+)\|/i);
    if (m) declared.set(m[1], m[2].trim());
  }

  const { rows } = await pool.query<TableRow>(
    `select tablename, rowsecurity
       from pg_tables
      where schemaname = 'public'
      order by tablename`
  );

  const problems: string[] = [];

  for (const { tablename, rowsecurity } of rows) {
    const decision = declared.get(tablename);

    if (!decision) {
      problems.push(
        `${tablename}: no RLS decision recorded in db/rls-policies.md`
      );
      continue;
    }

    const exempt = /^exempt\b/i.test(decision);
    if (!rowsecurity && !exempt) {
      problems.push(
        `${tablename}: RLS is DISABLED in the database, but db/rls-policies.md says "${decision}"`
      );
    }
  }

  for (const name of declared.keys()) {
    if (!rows.some((r) => r.tablename === name)) {
      problems.push(`${name}: declared in db/rls-policies.md but does not exist`);
    }
  }

  if (problems.length > 0) {
    console.error("check:rls FAILED\n");
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\n${problems.length} problem(s). Every table in the public schema needs an` +
        ` explicit decision in apps/api/db/rls-policies.md.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`check:rls OK — ${rows.length} table(s), all with an explicit decision.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
