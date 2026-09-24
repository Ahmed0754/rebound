/**
 * Removes the Phase C schema that is no longer part of this project.
 *
 * Background: an earlier round of work built a 13-table production-grade data
 * layer, then stripped it back off `main` (see `roadmap/session-logs/2026-09-03.md`).
 * Deleting the migration *files* from the repo did not undo what had already
 * been applied to the live database, so the two drifted: the repo described one
 * table, the database held fourteen, and `pgmigrations` recorded two migrations
 * whose files no longer existed.
 *
 * This migration closes that gap so a fresh clone and the live database end up
 * with the same schema. Every table dropped here was empty. None of the work is
 * lost - the migrations that created it are intact on the `future-work` branch,
 * and that is where they should come back from when the project actually needs
 * them.
 *
 * `exercises` is deliberately NOT dropped here; the next migration reshapes it.
 * Dropping these tables removes the foreign keys that pointed at it, which is
 * what allows that reshape to happen at all.
 *
 * Everything is `if exists`, so this is a no-op on a database built only from
 * this repo's own migrations.
 */

const TABLES = [
  "adjustment_events",
  "llm_calls",
  "preset_exercises",
  "preset_slots",
  "presets",
  "rate_limits",
  "regime_exercises",
  "regime_generation_jobs",
  "regimes",
  "session_logs",
  "users",
  "workout_session_exercises",
  "workout_sessions",
];

// Enum types created alongside those tables. Dropping a table leaves its types
// behind, and a leftover type blocks a future migration that wants the name.
const TYPES = [
  "adjustment_trigger_type",
  "dosage_frequency",
  "goal_type",
  "job_status",
  "llm_call_source",
  "preset_exercise_category",
  "preset_kind",
  "regime_created_by",
  "regime_status",
  "risk_tier",
  "session_slot",
  "signup_cohort",
  "user_role",
];

export const up = (pgm) => {
  // One statement with cascade: these tables reference each other, so dropping
  // them one at a time would depend on getting the order exactly right.
  pgm.sql(`drop table if exists ${TABLES.map((t) => `"${t}"`).join(", ")} cascade`);

  for (const type of TYPES) {
    pgm.sql(`drop type if exists "${type}" cascade`);
  }

  // These two migrations' files were removed from the repo, but the database
  // still listed them as run. Left in place, node-pg-migrate refuses to apply
  // anything new, since it sees applied migrations it has no file for.
  pgm.sql(`
    delete from pgmigrations
     where name in (
       '1756828800000_phase-c-core-tables',
       '1756832400000_exercise-ascendapi-shape'
     )
  `);
};

export const down = () => {
  // Deliberately irreversible. Recreating 13 tables, their enums, their RLS
  // policies and their foreign keys from here would be a worse copy of work
  // that already exists on `future-work`. Restore it from that branch instead.
  throw new Error(
    "Irreversible: restore the Phase C migrations from the future-work branch instead."
  );
};
