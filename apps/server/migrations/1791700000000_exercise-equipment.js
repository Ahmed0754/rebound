/**
 * Adds `equipment`, `force` and `mechanic` to `exercises`.
 *
 * The questionnaire has asked what equipment someone owns since Part 1, and
 * nothing could read it: free-exercise-db ships the field, but the reshape
 * migration and the seed script both dropped it. `force` and `mechanic` come
 * in the same migration because they are the closest thing the dataset has to
 * movement patterns - `aggravator_exclusions` matches on them - and this is
 * the only reason to touch the seed.
 *
 * All three are nullable because the dataset leaves them blank: 77 rows have
 * no equipment, most of them bodyweight stretches. How a blank is read is a
 * query decision (see `getCandidates`), not something to bake into the data.
 *
 * RESEED STRAIGHT AFTER RUNNING THIS. Until then every row is null here, and
 * that fails open: a blank equipment reads as "body only", so the equipment
 * filter lets every exercise through, and the `force`/`mechanic` patterns in
 * `aggravator_exclusions` match nothing.
 */

export const up = (pgm) => {
  pgm.addColumns("exercises", {
    // "body only" | "dumbbell" | "barbell" | "bands" | "other" | ... - one
    // value per exercise, in the dataset's own vocabulary.
    equipment: { type: "text" },
    // "push" | "pull" | "static"
    force: { type: "text" },
    // "compound" | "isolation"
    mechanic: { type: "text" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("exercises", ["equipment", "force", "mechanic"]);
};
