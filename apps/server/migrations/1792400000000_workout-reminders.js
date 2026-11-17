/**
 * Daily workout reminders, sent as Web Push notifications. Experimental: the
 * whole feature is these two tables, so dropping it is this migration's `down`.
 *
 * `workout_reminders` is the choice, one per account: which slot (morning
 * 6:00, noon 12:00, evening 18:00) and the time zone those hours are in, as
 * the browser reported it. `last_sent_on` is the person's own date of the last
 * reminder, so a day gets at most one even when the server restarts.
 *
 * `push_subscriptions` is where to send them: one row per browser that said
 * yes. Keyed on the endpoint, because one browser has one; logging into
 * another account in the same browser moves it over.
 *
 * RLS enabled with no policy, like every other table: Supabase serves `public`
 * over its HTTP API, and the API server connects as the owner.
 */

export const up = (pgm) => {
  pgm.createTable("workout_reminders", {
    user_id: {
      type: "uuid",
      primaryKey: true,
      references: "users",
      onDelete: "CASCADE",
    },
    slot: {
      type: "text",
      notNull: true,
      check: "slot in ('morning', 'noon', 'evening')",
    },
    time_zone: { type: "text", notNull: true },
    last_sent_on: { type: "date" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("push_subscriptions", {
    endpoint: { type: "text", primaryKey: true },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    p256dh: { type: "text", notNull: true },
    auth: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createIndex("push_subscriptions", "user_id");

  pgm.sql(`alter table workout_reminders enable row level security`);
  pgm.sql(`alter table push_subscriptions enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("push_subscriptions");
  pgm.dropTable("workout_reminders");
};
