/**
 * Stores generated regimes, so one survives the request that made it.
 *
 * Until now `POST /regime` computed a regime, serialised it, and forgot it:
 * the database was read-only reference data. Every feature past this point -
 * check-ins, weekly review, rolling back to a safe plan, accounts - needs a
 * regime that still exists tomorrow, so this is the table they all sit on.
 *
 * There is no user column. Accounts do not exist yet, so a regime belongs to
 * nobody and "the latest regime" is a single global row. That is deliberate
 * for now; `user_id` is what gets added when there is something to point it at.
 *
 * Two decisions worth knowing:
 *
 * 1. `regime_exercises` stores the exercise's name and description, not just
 *    a reference to `exercises`. A saved regime is a record of what the app
 *    actually told someone, and that must not change afterwards because the
 *    catalogue was re-seeded. This is only possible because the catalogue is
 *    public domain; a licensed dataset might not permit storing its text.
 *
 * 2. `exercise_id` deliberately has NO foreign key to `exercises`. The seed
 *    script deletes and re-inserts the whole catalogue, which a foreign key
 *    would either block or cascade into deleting saved regimes. Keeping it a
 *    plain column means re-seeding cannot damage history.
 */

export const up = (pgm) => {
  pgm.createTable("regimes", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    // What the user typed, after trimming and lowercasing.
    muscle: { type: "text", notNull: true },
    // The region `matchRegion` resolved it to, e.g. "lower back".
    body_region: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // "The latest regime" is the only read there is right now, and it sorts on
  // this column.
  pgm.createIndex("regimes", "created_at");

  pgm.createTable("regime_exercises", {
    regime_id: {
      type: "uuid",
      notNull: true,
      references: "regimes",
      onDelete: "CASCADE",
    },
    // 1, 2, 3 - the order they were shown in. Rows in a table have no
    // inherent order, so without this the regime comes back shuffled.
    position: { type: "integer", notNull: true },
    // The catalogue slug. Not a foreign key, on purpose - see above.
    exercise_id: { type: "text", notNull: true },
    // Snapshot of what was shown, frozen at generation time.
    name: { type: "text", notNull: true },
    description: { type: "text", notNull: true },
    sets: { type: "integer", notNull: true },
    reps: { type: "integer", notNull: true },
  });

  pgm.addConstraint("regime_exercises", "regime_exercises_pkey", {
    primaryKey: ["regime_id", "position"],
  });

  // RLS on with no policy at all, which denies everything to `anon` and
  // `authenticated`. Supabase publishes every table in `public` over its HTTP
  // API, so this is what stops anyone holding the project's anon key from
  // reading or writing regimes. The API server connects as the table owner,
  // which bypasses RLS, so it is unaffected.
  //
  // `exercises` is publicly readable because a shared exercise library is meant
  // to be. Regimes are not, and become properly per-user once accounts exist.
  pgm.sql(`alter table regimes enable row level security`);
  pgm.sql(`alter table regime_exercises enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("regime_exercises");
  pgm.dropTable("regimes");
};
