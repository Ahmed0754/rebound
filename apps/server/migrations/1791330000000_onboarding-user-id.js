/**
 * Gives a set of questionnaire answers an owner.
 *
 * `onboarding_responses` was written before `users` existed, so the client
 * held the row's id and the answers belonged to nobody. Accounts exist now,
 * and health answers that outlive the account that gave them are the same
 * orphan problem `1791325000000_regime-ownership` just fixed on `regimes` -
 * so this matches that shape: `not null`, and `on delete cascade`.
 *
 * The existing rows are test answers with no possible owner, and deleting them
 * is what allows `not null`.
 *
 * No unique index on `user_id` on purpose. One questionnaire per account would
 * make the write an upsert, and being able to post several sets of answers to
 * one account is more useful while testing than it is confusing.
 */

export const up = (pgm) => {
  pgm.sql(`delete from onboarding_responses`);

  pgm.addColumn("onboarding_responses", {
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
  });

  pgm.createIndex("onboarding_responses", "user_id");
};

export const down = (pgm) => {
  pgm.dropColumn("onboarding_responses", "user_id");
};
