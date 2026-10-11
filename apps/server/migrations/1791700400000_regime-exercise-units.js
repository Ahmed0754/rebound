/**
 * Lets a regime exercise be prescribed as a hold ("3 x 30s") as well as reps,
 * and records the limits each regime was generated under.
 *
 * `sets` and `reps` were both `integer not null`, so a stretch held for 30
 * seconds had nowhere to live - and Part 2 made stretching the default for the
 * most cautious users. Which unit an exercise takes is decided by the
 * catalogue (`force = 'static'` is a hold), not by the model.
 *
 * Every existing row is reps, which is what the default gives it. Some of
 * them are really holds written as reps ("Wall Sit, 30 reps"); they are left
 * as they were, since rewriting what a user was told is not a migration's call.
 *
 * `rationale` is the one-line "why this exercise" the model now writes, shown
 * to the user. `regimes.limits` is the envelope the plan was validated
 * against, so a plan can always be checked later against what it was allowed.
 */

export const up = (pgm) => {
  pgm.addColumns("regime_exercises", {
    unit: { type: "text", notNull: true, default: "reps" },
    hold_seconds: { type: "integer" },
    rationale: { type: "text" },
  });

  pgm.alterColumn("regime_exercises", "reps", { notNull: false });

  // Exactly one of the two amounts, and the one the unit says.
  pgm.addConstraint("regime_exercises", "regime_exercises_unit_amount", {
    check: `(unit = 'reps' and reps is not null and hold_seconds is null)
         or (unit = 'hold' and hold_seconds is not null and reps is null)`,
  });

  pgm.addColumns("regimes", {
    limits: { type: "jsonb" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("regimes", ["limits"]);
  pgm.dropConstraint("regime_exercises", "regime_exercises_unit_amount");
  // Holds have no reps to fall back to, so they cannot survive the column
  // becoming required again.
  pgm.sql(`delete from regime_exercises where unit = 'hold'`);
  pgm.alterColumn("regime_exercises", "reps", { notNull: true });
  pgm.dropColumns("regime_exercises", ["unit", "hold_seconds", "rationale"]);
};
