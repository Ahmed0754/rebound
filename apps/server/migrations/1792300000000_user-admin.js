/**
 * Marks the accounts that may use the admin page and run the judge.
 *
 * A column rather than a list of usernames in the environment: a username is
 * freed when its account is deleted, and whoever signs up with it next would
 * inherit the access.
 *
 * Every existing account starts as not an admin. Nothing in the app can set
 * this; it is set by hand in SQL, so no route exists for anyone to abuse.
 */

export const up = (pgm) => {
  pgm.addColumn("users", {
    is_admin: { type: "boolean", notNull: true, default: false },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("users", "is_admin");
};
