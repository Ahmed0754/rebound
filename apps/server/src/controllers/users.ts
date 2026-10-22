// The controller for accounts and logging in. Mounted at /api/users and
// /api/sessions in app.ts.
//
//   POST   /api/users         sign up: creates the account and logs it in
//   GET    /api/users/me      the logged-in account
//   DELETE /api/users/me      deletes it, with everything it owns
//   POST   /api/sessions      log in
//   DELETE /api/sessions      log out
//
// There is no list of accounts and no account by id: nobody needs to see
// anyone's account but their own.

import { Router } from "express";
import { PASSWORD, verifyNothing, verifyPassword } from "../auth.js";
import * as sessions from "../models/sessions.js";
import { create, DuplicateUsername, findForLogin, get, remove } from "../models/users.js";
import { requireUser, tokenOf, userIdOf } from "../require-user.js";

export const users = Router();
export const sessionsRouter = Router();

// Lowercased before testing, so "Sam" and "sam" are judged the way the
// unique index on lower(username) judges them.
const USERNAME = /^[a-z0-9_]{3,30}$/;

function readCredentials(body: unknown): { username: string; password: string } {
  const input = (body ?? {}) as { username?: unknown; password?: unknown };

  return {
    username: typeof input.username === "string" ? input.username.trim().toLowerCase() : "",
    // Not trimmed: a space is a character like any other in a password.
    password: typeof input.password === "string" ? input.password : "",
  };
}

users.post("/", async (req, res) => {
  const { username, password } = readCredentials(req.body);

  if (!USERNAME.test(username)) {
    res.status(400).send({
      error: "username must be 3-30 characters: lowercase letters, numbers, underscore",
    });
    return;
  }

  if (password.length < PASSWORD.min || password.length > PASSWORD.max) {
    res.status(400).send({
      error: `password must be ${PASSWORD.min}-${PASSWORD.max} characters`,
    });
    return;
  }

  try {
    const user = await create(username, password);
    const token = await sessions.create(user.id);

    res.status(201).send({ user, token });
  } catch (error) {
    if (error instanceof DuplicateUsername) {
      res.status(409).send({ error: error.message });
      return;
    }

    throw error;
  }
});

users.get("/me", requireUser, async (_req, res) => {
  const user = await get(userIdOf(res));

  // Deleted between the token check and here.
  if (user === null) {
    res.status(401).send({ error: "log in to do that" });
    return;
  }

  res.send(user);
});

users.delete("/me", requireUser, async (_req, res) => {
  await remove(userIdOf(res));
  res.sendStatus(204);
});

sessionsRouter.post("/", async (req, res) => {
  const { username, password } = readCredentials(req.body);

  // Too long to be anyone's password, and refused before hashing it: scrypt
  // on a megabyte of input is a way to tie the server up.
  if (password.length > PASSWORD.max) {
    res.status(401).send({ error: "wrong username or password" });
    return;
  }

  const found = await findForLogin(username);
  const ok = found === null ? await verifyNothing(password) : await verifyPassword(password, found.passwordHash);

  // One message for both, so a login form cannot be used to find out which
  // usernames exist.
  if (!ok || found === null) {
    res.status(401).send({ error: "wrong username or password" });
    return;
  }

  res.send({ user: found.user, token: await sessions.create(found.user.id) });
});

sessionsRouter.delete("/", requireUser, async (req, res) => {
  await sessions.remove(tokenOf(req)!);
  res.sendStatus(204);
});
