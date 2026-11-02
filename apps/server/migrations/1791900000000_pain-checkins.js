/**
 * The pain tracker: one check-in per plan per day - how bad the pain is
 * (0-10, the same scale as the questionnaire's `pain_now`) and whether the
 * exercises were done. Saving the same day again replaces it, which the
 * primary key on (regime_id, day) enforces.
 *
 * `day` is the person's own calendar date, sent by the client, not a server
 * timestamp: "today" depends on where someone is, and a check-in is about
 * their day.
 *
 * `user_id` is the plan's owner, copied in so a deleted account takes its
 * check-ins with it directly. Deleting the plan deletes them too.
 *
 * RLS enabled with no policy, for the same reason as `onboarding_responses`:
 * pain scores are health information, and Supabase serves every table in
 * `public` over its HTTP API. The API server connects as the owner.
 */

export const up = (pgm) => {
  pgm.createTable("pain_checkins", {
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
    day: { type: "date", notNull: true },
    pain: {
      type: "smallint",
      notNull: true,
      check: "pain between 0 and 10",
    },
    did_exercises: { type: "boolean", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("pain_checkins", "pain_checkins_pkey", {
    primaryKey: ["regime_id", "day"],
  });
  pgm.createIndex("pain_checkins", "user_id");

  pgm.sql(`alter table pain_checkins enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("pain_checkins");
};
