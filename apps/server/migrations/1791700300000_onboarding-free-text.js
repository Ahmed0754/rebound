/**
 * Adds the questionnaire's one free-text answer, and the screening verdict on
 * it, to `onboarding_responses`.
 *
 * The box and its screening land together, never apart: a note nobody reads
 * for safety is worse than no note, because it is exactly where someone who
 * ticked "no" to the pregnancy question writes "36 weeks pregnant".
 *
 * The verdict is stored, not recomputed, so the generate route can re-check it
 * the way it re-checks red flags, and so a row screened while the classifier
 * was down stays findable - see ADR 0021. `screening` is one of:
 *
 *   not_needed   no note was written
 *   clear        screened, nothing found
 *   flagged      screened, a reason to see a doctor
 *   crisis       self-harm language, by the fixed patterns or the classifier
 *   unavailable  the classifier could not be reached; the note went through
 *                unscreened, by decision (ADR 0021)
 *
 * `free_text` is capped in the database as well as the controller, so nothing
 * that skips the controller can store an unbounded note.
 */

export const up = (pgm) => {
  pgm.addColumns("onboarding_responses", {
    free_text: { type: "text" },
    screening: { type: "text", notNull: true, default: "not_needed" },
    // Which of the classifier's categories it found, e.g. {pregnancy_related}.
    screening_categories: { type: "text[]", notNull: true, default: "{}" },
    // The words that triggered it, so a reviewer can see why without
    // re-running anything.
    screening_quote: { type: "text" },
    // Which model screened it - a verdict means less once the model changes.
    screening_model: { type: "text" },
  });

  pgm.addConstraint("onboarding_responses", "onboarding_free_text_length", {
    check: "char_length(free_text) <= 500",
  });

  pgm.addConstraint("onboarding_responses", "onboarding_screening_known", {
    check: "screening in ('not_needed', 'clear', 'flagged', 'crisis', 'unavailable')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint("onboarding_responses", "onboarding_screening_known");
  pgm.dropConstraint("onboarding_responses", "onboarding_free_text_length");
  pgm.dropColumns("onboarding_responses", [
    "free_text",
    "screening",
    "screening_categories",
    "screening_quote",
    "screening_model",
  ]);
};
