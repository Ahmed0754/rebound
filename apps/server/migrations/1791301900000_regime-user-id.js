/**
 * Tags a regime with who made it, when they were signed in - nothing more.
 *
 * Deliberately nullable and deliberately not enforced anywhere: this is the
 * "minimal" half of the accounts work, not the ownership checks ACCOUNTS.md
 * describes for `get` / `update` / `remove`. Existing regimes predate
 * accounts and are left with `user_id = null` rather than deleted, since
 * nothing here requires every regime to have an owner.
 */

export const up = (pgm) => {
  pgm.addColumn("regimes", {
    user_id: {
      type: "uuid",
      notNull: false,
      references: "users",
      onDelete: "SET NULL",
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("regimes", "user_id");
};
