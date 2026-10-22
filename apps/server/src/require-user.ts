// The middleware every route that acts for an account sits behind. Reads the
// session token from `Authorization: Bearer <token>`, finds the account it
// belongs to, and refuses the request with a 401 when there is none.
//
// Handlers read the account with `userIdOf(res)`, never from the request:
// the token is the only thing that says who someone is.

import type { RequestHandler, Response } from "express";
import { userIdFor } from "./models/sessions.js";

/** The token a request carries, or null when it carries none. */
export function tokenOf(req: { header(name: string): string | undefined }): string | null {
  const match = /^Bearer (\S+)$/.exec(req.header("Authorization") ?? "");
  return match === null ? null : match[1];
}

export const requireUser: RequestHandler = async (req, res, next) => {
  const token = tokenOf(req);
  const userId = token === null ? null : await userIdFor(token);

  // One answer for no token, a made-up one and an expired one: the client
  // does the same thing for all three, which is to ask the person to log in.
  if (userId === null) {
    res.status(401).send({ error: "log in to do that" });
    return;
  }

  res.locals.userId = userId;
  next();
};

/** The logged-in account. Only valid behind `requireUser`. */
export function userIdOf(res: Response): string {
  return res.locals.userId as string;
}
