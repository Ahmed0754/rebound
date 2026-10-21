/**
 * Records what the quality checks made of each plan (ADR 0024): how many
 * attempts it took, which criteria the first valid plan missed before the
 * model was told about any of them, and where every criterion ended up for
 * the plan that was saved - met, missed, not applicable or unsatisfiable.
 *
 * Stored, not returned by the API: it is for measuring the checks, not for
 * showing anyone. Null on plans made before the checks existed, and on plans
 * from the type-a-body-part path, whose exercises carry no tags to check.
 */

export const up = (pgm) => {
  pgm.addColumns("regimes", {
    quality: { type: "jsonb" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("regimes", ["quality"]);
};
