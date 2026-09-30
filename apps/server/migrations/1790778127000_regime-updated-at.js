/**
 * Adds `updated_at` to `regimes`, so an edited regime carries a trace of
 * having been edited.
 *
 * Until now a regime was written once and only ever read back, so the moment
 * it was generated was the only moment worth recording. `PUT /api/regimes/:id`
 * changes that: without this column, a regime rewritten by hand is
 * indistinguishable from one the AI produced and nobody touched.
 *
 * `created_at` keeps its meaning - when the regime was generated - and is not
 * moved by an edit. The two together are what the weekly review needs: how old
 * the plan is, and how recently it was interfered with.
 *
 * Existing rows are backfilled from `created_at` rather than left at the
 * column default of `now()`. A regime that has never been edited should read
 * as "last changed when it was made", not "last changed the day we ran the
 * migration".
 */

export const up = (pgm) => {
  pgm.addColumn("regimes", {
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.sql(`update regimes set updated_at = created_at`);
};

export const down = (pgm) => {
  pgm.dropColumn("regimes", "updated_at");
};
