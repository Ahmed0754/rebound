/**
 * Finished workouts: one row per plan per day, written when the last set is
 * tapped off in the workout player. The primary key on (regime_id, day) is
 * what makes "done today" a fact rather than a count: finishing again the
 * same day keeps the first row, and the next day is a new one.
 *
 * Rows are only written at the end, never at "start": v1 created session
 * rows ahead of time and they silently stopped matching after midnight
 * (LESSONS.md). Progress through the sets lives in the browser until then.
 *
 * `exercises` is a snapshot of the doses that were done - every set of
 * every exercise, since the player only finishes once they all are. A
 * snapshot, because the plan's doses can change later and this is the record
 * of what was actually done that day.
 *
 * `day` is the person's own date, like `pain_checkins.day`. `user_id` is
 * copied in so a deleted account takes these with it directly.
 *
 * RLS enabled with no policy, like every other table.
 */

export const up = (pgm) => {
  pgm.createTable("workout_sessions", {
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
    exercises: { type: "jsonb", notNull: true },
    completed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("workout_sessions", "workout_sessions_pkey", {
    primaryKey: ["regime_id", "day"],
  });
  pgm.createIndex("workout_sessions", "user_id");

  pgm.sql(`alter table workout_sessions enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("workout_sessions");
};
