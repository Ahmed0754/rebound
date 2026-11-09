/**
 * One row for each time a pain-trend suggestion was applied to a plan: what
 * the trend was, and the plan just before and just after.
 *
 * Saving a plan replaces its exercise rows, so without this the old doses are
 * gone. The whole items are kept rather than only the doses because the
 * rationale is dropped when a dose changes, and an undo has to put back the
 * plan exactly as it was.
 *
 * `undone_at` rather than deleting the row, so a change that was walked back
 * is still on record: PRODUCT.md's reversal rate counts exactly those.
 *
 * `user_id` is the plan's owner, copied in so a deleted account takes these
 * with it directly, as `pain_checkins` does.
 *
 * RLS enabled with no policy, for the same reason as `pain_checkins`: this is
 * derived from pain scores, and Supabase serves every table in `public` over
 * its HTTP API. The API server connects as the owner.
 */

export const up = (pgm) => {
  pgm.createTable("adjustment_events", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    regime_id: {
      type: "uuid",
      notNull: true,
      references: "regimes",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    trend: {
      type: "text",
      notNull: true,
      check: "trend in ('better', 'worse')",
    },
    // float8, which `pg` hands back as a number. `numeric` comes back a string.
    earlier: { type: "double precision", notNull: true },
    recent: { type: "double precision", notNull: true },
    doses_before: { type: "jsonb", notNull: true },
    doses_after: { type: "jsonb", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    undone_at: { type: "timestamptz" },
  });

  pgm.createIndex("adjustment_events", ["regime_id", { name: "created_at", sort: "DESC" }]);
  pgm.createIndex("adjustment_events", "user_id");

  pgm.sql(`alter table adjustment_events enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("adjustment_events");
};
