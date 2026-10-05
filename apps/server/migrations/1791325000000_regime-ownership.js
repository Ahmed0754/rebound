/**
 * Makes a regime's owner real: every regime has one, and deleting an account
 * takes its regimes with it.
 *
 * `1791301900000_regime-user-id` added `user_id` as a nullable, unenforced tag
 * so that nothing existing changed behaviour. That was the right call for one
 * day and the wrong one to keep, for two reasons that compound:
 *
 * 1. **A null owner can never be matched.** The ownership checks that
 *    `models/regimes.ts` still carries a capitalised TODO about add
 *    `and user_id = $2` to `get`, `update` and `remove`. SQL never matches a
 *    null to anything, so the moment those ship, every unowned regime becomes
 *    unreachable through the API - not readable, not editable, not deletable,
 *    removable only by hand in SQL.
 *
 * 2. **`on delete set null` manufactured more of them.** Deleting an account
 *    did not delete its regimes, it orphaned them. So the pile of
 *    API-invisible rows grew with every test account thrown away, and an
 *    orphan was indistinguishable from a regime that predated accounts
 *    entirely.
 *
 * Fixing both now is cheap because the data is disposable; it gets steadily
 * more expensive as real plans accumulate, and the ownership checks are what
 * make it irreversible.
 *
 * 59 of the 60 regimes in the database when this was written had no owner.
 * They are test rows generated while building the exercise picker, and
 * deleting them is what allows `user_id` to be `not null` - which is the only
 * version of this column that no query ever has to reason about twice.
 * `regime_exercises` goes with them without being named: its `regime_id` is
 * declared `on delete cascade`.
 *
 * **This makes an account required to generate a regime.** That is not a side
 * effect to work around, it is the same decision: a column that cannot be null
 * cannot be filled by a request that names nobody. `POST /api/regimes` now
 * answers 400 without an `X-User-Id` header, where before it quietly produced
 * an untagged regime.
 */

export const up = (pgm) => {
  // Before the `not null`, or the alter fails on the rows it would forbid.
  pgm.sql(`delete from regimes where user_id is null`);

  // Postgres has no "alter the action on an existing foreign key", so the
  // constraint is replaced. The name is the one Postgres generated for the
  // original, which is what `addColumn` with `references` produces.
  pgm.dropConstraint("regimes", "regimes_user_id_fkey");

  pgm.addConstraint("regimes", "regimes_user_id_fkey", {
    foreignKeys: {
      columns: "user_id",
      references: "users",
      // Deleting an account now deletes the plans made under it, rather than
      // leaving them behind ownerless. This is also what makes
      // `DELETE /api/users/:id` usable as "reset this account" while testing.
      onDelete: "CASCADE",
    },
  });

  pgm.alterColumn("regimes", "user_id", { notNull: true });
};

export const down = (pgm) => {
  pgm.alterColumn("regimes", "user_id", { notNull: false });

  pgm.dropConstraint("regimes", "regimes_user_id_fkey");

  pgm.addConstraint("regimes", "regimes_user_id_fkey", {
    foreignKeys: {
      columns: "user_id",
      references: "users",
      onDelete: "SET NULL",
    },
  });

  // The deleted regimes are NOT restored - there is nowhere to restore them
  // from. This reverses the schema, not the data.
};
