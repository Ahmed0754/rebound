/**
 * Records which questionnaire a regime was built from.
 *
 * Until now nothing joined the two: the answers went into the generation and
 * the limits were kept, but not the answers themselves. Grading a saved plan
 * the way the eval grades a fixture - the judge asks whether each pick suits
 * the person - needs the person, so new regimes keep the id.
 *
 * Nullable, with no backfill. Plans from the type-a-body-part path have no
 * questionnaire, and which one an older plan came from can only be guessed;
 * the evaluation route guesses at read time and says that it did, rather than
 * a migration writing the guess down as fact.
 *
 * `on delete set null`, not cascade: questionnaires are only deleted with
 * their account, which deletes its regimes anyway, and a plan should never
 * disappear because the answers behind it did.
 */

export const up = (pgm) => {
  pgm.addColumn("regimes", {
    onboarding_id: {
      type: "uuid",
      references: "onboarding_responses",
      onDelete: "SET NULL",
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("regimes", "onboarding_id");
};
