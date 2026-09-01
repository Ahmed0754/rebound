/**
 * Phase C, first slice: the 13 tables listed in IMPLEMENTATION_TODO.md's
 * "Phase C — Data layer" that don't depend on AscendAPI or the media-storage
 * decision (both still open). `exercises` already exists from Phase B and is
 * deliberately untouched here — its AscendAPI-native rework is a separate,
 * externally-blocked piece of Phase C.
 *
 * Column shapes are read off DATA_MODEL.md's field tables. Where that document
 * says "Enum" without listing values (goalType, riskTier, frequency), the values
 * below are inferred from USERFLOW.md/PRD.md prose (GENERAL_FITNESS and STRENGTH
 * are named explicitly; the three risk tiers come from the PRD's change-ceiling
 * table's row labels) and should be treated as provisional, not settled.
 *
 * Every table gets its RLS decision in this same migration, per DATA_MODEL.md's
 * own rule and the Phase C checklist — see db/rls-policies.md for the mirrored
 * human-readable record `check:rls` reads.
 */

export const up = (pgm) => {
  // ---- Enums --------------------------------------------------------------

  pgm.createType("goal_type", ["GENERAL_FITNESS", "STRENGTH", "INJURY_RECOVERY"]);
  pgm.createType("risk_tier", ["GENERAL", "LIGHT_INJURY", "HEAVIER_CHRONIC"]);
  pgm.createType("user_role", ["USER", "ADMIN"]);
  pgm.createType("signup_cohort", ["BETA", "PROD"]);

  pgm.createType("regime_status", ["DRAFT", "ACTIVE", "SUPERSEDED", "ENDED"]);
  pgm.createType("regime_created_by", ["AGENT", "USER_EDITED", "PRESET_FALLBACK"]);
  pgm.createType("session_slot", ["MORNING", "EVENING"]);
  pgm.createType("dosage_frequency", ["DAILY", "EVERY_OTHER_DAY", "TWICE_WEEK", "THREE_X_WEEK"]);

  pgm.createType("adjustment_trigger_type", ["SCHEDULED_ADJUSTMENT", "ESCALATION_ROLLBACK"]);
  pgm.createType("job_status", ["PENDING", "COMPLETE", "FAILED"]);

  pgm.createType("preset_kind", ["FALLBACK", "SKELETON"]);
  pgm.createType("preset_exercise_category", ["MOBILITY", "STRENGTH", "STRETCH"]);

  pgm.createType("llm_call_source", ["PRODUCTION", "ADMIN_TEST"]);

  // ---- User-owned entities --------------------------------------------------

  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    email: { type: "text", notNull: true, unique: true },
    goal_type: { type: "goal_type" },
    risk_tier: { type: "risk_tier" },
    condition_flags: { type: "text[]", notNull: true, default: "{}" },
    target_movements: { type: "text[]", notNull: true, default: "{}" },
    available_equipment: { type: "text[]", notNull: true, default: "{}" },
    wake_time_minutes: { type: "integer", notNull: true, default: 7 * 60 },
    evening_time_minutes: { type: "integer", notNull: true, default: 18 * 60 },
    manual_hold: { type: "boolean", notNull: true, default: false },
    manual_hold_reason: { type: "text" },
    role: { type: "user_role", notNull: true, default: "USER" },
    signup_cohort: { type: "signup_cohort", notNull: true, default: "BETA" },
    subscription_active: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("regimes", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    version_number: { type: "integer", notNull: true },
    status: { type: "regime_status", notNull: true, default: "DRAFT" },
    created_by: { type: "regime_created_by", notNull: true },
    end_reason: { type: "text" },
    parent_regime_id: { type: "uuid", references: "regimes" },
    source_preset_id: { type: "uuid" }, // FK added after `presets` exists, below
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  // versionNumber is unique per (userId, versionNumber) — always computed from
  // existing rows, never hardcoded. v1 hardcoded 1 and silently failed every
  // retry on a user's second onboarding.
  pgm.addConstraint("regimes", "regimes_user_version_unique", {
    unique: ["user_id", "version_number"],
  });

  pgm.createTable("regime_exercises", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    regime_id: { type: "uuid", notNull: true, references: "regimes", onDelete: "CASCADE" },
    exercise_id: { type: "uuid", notNull: true, references: "exercises" },
    sets: { type: "integer" },
    reps: { type: "integer" },
    duration_seconds: { type: "integer" },
    frequency: { type: "dosage_frequency" },
    session_slot: { type: "session_slot", notNull: true },
    order_index: { type: "integer", notNull: true, default: 0 },
  });

  pgm.createTable("workout_sessions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    regime_version_id: { type: "uuid", notNull: true, references: "regimes" },
    date: { type: "date", notNull: true },
    slot: { type: "session_slot", notNull: true },
    completed: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  // The regime version is in the constraint deliberately — v1 omitted it, so a
  // same-day regime change silently paired the new regime's exercises with the
  // old regime's completion timestamps.
  pgm.addConstraint("workout_sessions", "workout_sessions_unique_slot", {
    unique: ["user_id", "regime_version_id", "date", "slot"],
  });

  pgm.createTable("workout_session_exercises", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    workout_session_id: {
      type: "uuid",
      notNull: true,
      references: "workout_sessions",
      onDelete: "CASCADE",
    },
    exercise_id: { type: "uuid", notNull: true, references: "exercises" },
    completed: { type: "boolean", notNull: true, default: false },
  });

  pgm.createTable("session_logs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    date: { type: "date", notNull: true },
    pain_score: { type: "integer", notNull: true }, // 0-10, enforced below
    mobility_strength_indicator: { type: "jsonb" }, // shape varies by goal_type
    perceived_exertion: { type: "integer" },
    flag: { type: "boolean", notNull: true, default: false }, // "this made it worse"
    completed: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("session_logs", "session_logs_pain_score_range", {
    check: "pain_score >= 0 and pain_score <= 10",
  });
  // Keyed on a date, not a timestamp. v1's uniqueness constraint used a
  // timestamp that defaulted to the submission instant, so once-daily logging
  // was never actually enforced — two logs the same day never collided.
  pgm.addConstraint("session_logs", "session_logs_one_per_day", {
    unique: ["user_id", "date"],
  });

  pgm.createTable("adjustment_events", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    from_regime_version_id: { type: "uuid", references: "regimes" },
    to_regime_version_id: { type: "uuid", references: "regimes" },
    trigger_type: { type: "adjustment_trigger_type", notNull: true },
    trailing_window_used: { type: "integer" },
    rationale: { type: "text" },
    // Set retroactively once a later rollback lands the active regime back at
    // or before this event's starting version. v1's retro-marking included the
    // triggering row's own id and marked a rollback as reversing itself —
    // application code must exclude the new row's id when marking these.
    was_reversed: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("regime_generation_jobs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    status: { type: "job_status", notNull: true, default: "PENDING" },
    retry_count: { type: "integer", notNull: true, default: 0 },
    result_regime_id: { type: "uuid", references: "regimes" },
    fallback_preset_id: { type: "uuid" }, // FK added after `presets` exists, below
    // Never returned to the client — v1's error formatter leaked this straight
    // into the onboarding UI. Application-layer rule, not enforceable in SQL.
    error: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // ---- Shared library entities ----------------------------------------------

  pgm.createTable("presets", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    kind: { type: "preset_kind", notNull: true },
    risk_tier: { type: "risk_tier", notNull: true },
    goal_type: { type: "goal_type", notNull: true },
    body_region_tags: { type: "text[]", notNull: true, default: "{}" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // Now that `presets` exists, back-fill the two forward references left
  // dangling above.
  pgm.addConstraint("regimes", "regimes_source_preset_fkey", {
    foreignKeys: { columns: "source_preset_id", references: "presets" },
  });
  pgm.addConstraint("regime_generation_jobs", "regime_generation_jobs_fallback_preset_fkey", {
    foreignKeys: { columns: "fallback_preset_id", references: "presets" },
  });

  pgm.createTable("preset_exercises", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    preset_id: { type: "uuid", notNull: true, references: "presets", onDelete: "CASCADE" },
    exercise_id: { type: "uuid", notNull: true, references: "exercises" },
    sets: { type: "integer" },
    reps: { type: "integer" },
    duration_seconds: { type: "integer" },
    frequency: { type: "dosage_frequency" },
    session_slot: { type: "session_slot", notNull: true },
    order_index: { type: "integer", notNull: true, default: 0 },
  });

  pgm.createTable("preset_slots", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    preset_id: { type: "uuid", notNull: true, references: "presets", onDelete: "CASCADE" },
    label: { type: "text", notNull: true },
    exercise_category: { type: "preset_exercise_category", notNull: true },
    muscle_group_tags: { type: "text[]", notNull: true, default: "{}" },
    max_difficulty: { type: "text" },
    suggested_sets: { type: "integer" },
    suggested_reps: { type: "integer" },
    suggested_duration_seconds: { type: "integer" },
    suggested_frequency: { type: "dosage_frequency" },
    // The literature-grounding audit trail — what makes a skeleton reviewable
    // by a clinician. Populate it properly; this is not optional metadata.
    rationale: { type: "text", notNull: true },
  });

  // ---- System entities: RLS enabled, zero policies, default deny -----------

  pgm.createTable("llm_calls", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    flow: { type: "text", notNull: true },
    source: { type: "llm_call_source", notNull: true },
    model: { type: "text", notNull: true },
    group_id: { type: "uuid" },
    sequence_index: { type: "integer" },
    prompt_tokens: { type: "integer" },
    completion_tokens: { type: "integer" },
    latency_ms: { type: "integer" },
    // Serializes as a numeric *string* through JSON responses, not a number —
    // v1 hit this. Handle the cast client-side, not by changing the type.
    cost_usd: { type: "numeric(10,6)" },
    stop_reason: { type: "text" },
    request_json: { type: "jsonb" },
    response_json: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("rate_limits", {
    // "<scope>:<identity>", e.g. "onboarding:203.0.113.7"
    key: { type: "text", primaryKey: true },
    count: { type: "integer", notNull: true, default: 0 },
    window_start: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // ---- Two-tier roles --------------------------------------------------------
  //
  // Created before any policy below references it — Postgres requires the role
  // to exist first. Migrations and admin scripts run as the table-owning role,
  // which bypasses RLS entirely — correct for DDL and admin work, and exactly
  // wrong for live request traffic. `rebound_restricted` is the role the API's
  // per-request connection is meant to use once Phase F's `withSession` sets
  // `app.user_id` via `SET LOCAL` — see IMPLEMENTATION_TODO.md Phase F.
  //
  // No password is set here. This role cannot log in until one is, the same way
  // Phase B's leftover "rotate the Supabase database password" item is a manual,
  // out-of-band step rather than something scripted into a committed migration —
  // a password embedded in migration history is not a secret. Set one via the
  // Supabase SQL editor or `ALTER ROLE rebound_restricted WITH PASSWORD '...'`
  // run directly, then add RESTRICTED_DATABASE_URL to .env (see .env.example).
  pgm.sql(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'rebound_restricted') then
        create role rebound_restricted noinherit login;
      end if;
    end
    $$;
  `);

  // ---- RLS: enable on every table created here ------------------------------
  //
  // Supabase serves the public schema over PostgREST; RLS-disabled means
  // publicly readable via the anon key regardless of application code. v1
  // shipped seven tables exposed exactly this way. Enable RLS on all thirteen
  // now, then attach the policy that matches each table's bucket.

  const allTables = [
    "users",
    "regimes",
    "regime_exercises",
    "workout_sessions",
    "workout_session_exercises",
    "session_logs",
    "adjustment_events",
    "regime_generation_jobs",
    "presets",
    "preset_exercises",
    "preset_slots",
    "llm_calls",
    "rate_limits",
  ];
  for (const table of allTables) {
    pgm.sql(`alter table ${table} enable row level security`);
  }

  // User-owned bucket: row-ownership on app.user_id, set per-request by
  // withSession (Phase F — not built yet, so nothing connects as the
  // restricted role below until then). Direct-owner tables compare user_id;
  // child tables without their own user_id go through an EXISTS against the
  // parent, per DATA_MODEL.md.
  const directOwnerTables = [
    "users", // id is the subject itself
    "regimes",
    "workout_sessions",
    "session_logs",
    "adjustment_events",
    "regime_generation_jobs",
  ];
  for (const table of directOwnerTables) {
    const idColumn = table === "users" ? "id" : "user_id";
    pgm.sql(`
      create policy "${table}_owner_access"
        on ${table} for all
        to rebound_restricted
        using (${idColumn} = current_setting('app.user_id', true)::uuid)
        with check (${idColumn} = current_setting('app.user_id', true)::uuid)
    `);
  }

  pgm.sql(`
    create policy "regime_exercises_owner_access"
      on regime_exercises for all
      to rebound_restricted
      using (exists (
        select 1 from regimes
         where regimes.id = regime_exercises.regime_id
           and regimes.user_id = current_setting('app.user_id', true)::uuid
      ))
      with check (exists (
        select 1 from regimes
         where regimes.id = regime_exercises.regime_id
           and regimes.user_id = current_setting('app.user_id', true)::uuid
      ))
  `);

  pgm.sql(`
    create policy "workout_session_exercises_owner_access"
      on workout_session_exercises for all
      to rebound_restricted
      using (exists (
        select 1 from workout_sessions
         where workout_sessions.id = workout_session_exercises.workout_session_id
           and workout_sessions.user_id = current_setting('app.user_id', true)::uuid
      ))
      with check (exists (
        select 1 from workout_sessions
         where workout_sessions.id = workout_session_exercises.workout_session_id
           and workout_sessions.user_id = current_setting('app.user_id', true)::uuid
      ))
  `);

  // Shared library bucket: RLS enabled, permissive read, no write policy —
  // same pattern as `exercises` from the initial migration.
  for (const table of ["presets", "preset_exercises", "preset_slots"]) {
    pgm.sql(`
      create policy "${table}_public_read"
        on ${table} for select
        to anon, authenticated, rebound_restricted
        using (true)
    `);
  }

  // System bucket (llm_calls, rate_limits): RLS enabled above, deliberately
  // zero policies here — default deny for every non-owning role, including
  // rebound_restricted. Only the migration/admin connection (table owner,
  // bypasses RLS) can read or write these.

  // Grants for the restricted role created earlier in this migration.
  for (const table of directOwnerTables.concat(["regime_exercises", "workout_session_exercises"])) {
    pgm.sql(`grant select, insert, update, delete on ${table} to rebound_restricted`);
  }
  for (const table of ["presets", "preset_exercises", "preset_slots"]) {
    pgm.sql(`grant select on ${table} to rebound_restricted`);
  }
  // No grants on llm_calls or rate_limits: default deny is enforced by having
  // no policy at all, but withholding table privileges too means a future
  // accidental policy addition still can't leak these without a grant as well.
};

export const down = (pgm) => {
  const allTables = [
    "rate_limits",
    "llm_calls",
    "preset_slots",
    "preset_exercises",
    "presets",
    "regime_generation_jobs",
    "adjustment_events",
    "session_logs",
    "workout_session_exercises",
    "workout_sessions",
    "regime_exercises",
    "regimes",
    "users",
  ];

  for (const table of allTables) {
    pgm.dropTable(table, { cascade: true, ifExists: true });
  }

  pgm.sql(`drop role if exists rebound_restricted`);

  for (const type of [
    "llm_call_source",
    "preset_exercise_category",
    "preset_kind",
    "job_status",
    "adjustment_trigger_type",
    "dosage_frequency",
    "session_slot",
    "regime_created_by",
    "regime_status",
    "signup_cohort",
    "user_role",
    "risk_tier",
    "goal_type",
  ]) {
    pgm.dropType(type, { ifExists: true });
  }
};
