/**
 * The goal becomes the person's own words instead of one of four codes.
 *
 * The column was already `text`, so this only rewrites the rows saved as codes
 * into the words the questionnaire showed for each, so every row reads the
 * same way, and caps the length in the database as well as the controller, the
 * same way `free_text` is capped.
 *
 * `down` turns those four phrases back into codes, including any typed goal
 * that happens to match one exactly, which means the same thing either way.
 * Any other typed goal is left as it is.
 */

// Every value here is a literal this file wrote, never user input.
const CODES = [
  ["return_to_movement", "Get back to moving normally"],
  ["reduce_pain", "Reduce pain"],
  ["prevent_recurrence", "Stop it coming back"],
  ["general_mobility", "Move more freely in general"],
];

const quote = (value) => `'${value.replace(/'/g, "''")}'`;

const rewrite = (pairs) =>
  `update onboarding_responses
      set goal = case goal ${pairs.map(([from, to]) => `when ${quote(from)} then ${quote(to)}`).join(" ")} end
    where goal in (${pairs.map(([from]) => quote(from)).join(", ")})`;

export const up = (pgm) => {
  pgm.sql(rewrite(CODES));

  pgm.addConstraint("onboarding_responses", "onboarding_goal_length", {
    check: "char_length(btrim(goal)) between 1 and 200",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint("onboarding_responses", "onboarding_goal_length");
  pgm.sql(rewrite(CODES.map(([code, words]) => [words, code])));
};
