/**
 * Stores what someone answered in the onboarding questionnaire, so a plan can
 * be built from it and rebuilt from it later.
 *
 * A column per answer rather than one jsonb blob, so `select *` shows what
 * someone said without needing a TypeScript type to read it. The cost is a
 * migration per question change.
 *
 * No free-text column: the classifier that would screen prose for red flags
 * answered "no" in the structured questions is Part 3, and a box nothing reads
 * for safety is worse than no box.
 *
 * RLS enabled with no policy, which denies everything to `anon` and
 * `authenticated`. These are health disclosures, and Supabase publishes every
 * table in `public` over its HTTP API.
 *
 * NOTE: this was applied to the shared database before the file reached the
 * repo, so it is already recorded in `pgmigrations`. Adding `user_id` is a
 * separate, later migration rather than an edit here.
 */

export const up = (pgm) => {
  pgm.createTable("onboarding_responses", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    goal: { type: "text", notNull: true },
    // What hurts, as typed. Resolved to a body region at generation time.
    region: { type: "text", notNull: true },
    onset: { type: "text", notNull: true },
    pain_now: { type: "integer", notNull: true },
    aggravators: { type: "text[]", notNull: true },
    // Non-empty means no plan was generated. Kept anyway, so it is possible
    // to see how often that happens.
    red_flags: { type: "text[]", notNull: true },
    age_band: { type: "text", notNull: true },
    conditions: { type: "text[]", notNull: true },
    equipment: { type: "text[]", notNull: true },
    activity_level: { type: "text", notNull: true },
    session_minutes: { type: "integer", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.sql(`alter table onboarding_responses enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("onboarding_responses");
};
