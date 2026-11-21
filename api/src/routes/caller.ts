import type { Request, RequestHandler } from "express";
import { DatabaseUnavailableError } from "../db/client.js";
import { InvalidTokenError, type AuthService } from "../services/auth.js";
import type { Person, UserService } from "../services/users.js";
import { bearerToken, logFailure } from "./auth.js";

declare module "express-serve-static-core" {
  interface Request {
    // The signed-in Person, set by requireCaller(). Read it with callerOf().
    caller?: Person;
  }
}

// Identifies the caller of every route mounted after it (design §4, step 2):
// verify(jwt) gives the user_id, and findByUserId(user_id) the Person and role.
// An account without a Person yet, such as one that just signed up, gets one
// from linkAccount(), using its email and name from Cognito, once that email is
// verified (403 until then). A missing or bad token gets 401. DynamoDB being
// unreachable gets 503, and any other failure 500.
export function requireCaller(
  authService: AuthService,
  userService: UserService,
): RequestHandler {
  return async (req, res, next) => {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: "You're not signed in." });
      return;
    }

    let person;
    try {
      const userId = await authService.verify(token);
      person = await userService.findByUserId(userId);
      if (!person) {
        const { email, emailVerified, name } = await authService.profile(token);
        if (!emailVerified) {
          res.status(403).json({ error: "Verify your email address before you continue." });
          return;
        }
        person = await userService.linkAccount(userId, { email, name: name ?? email });
      }
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        res.status(401).json({ error: "You're not signed in." });
        return;
      }
      logFailure("Identifying the caller", err);
      res
        .status(err instanceof DatabaseUnavailableError ? 503 : 500)
        .json({ error: "Something went wrong. Please try again." });
      return;
    }

    req.caller = person;
    next();
  };
}

// The signed-in Person, for routes mounted after requireCaller().
export function callerOf(req: Request): Person {
  if (!req.caller) {
    throw new Error("requireCaller() must run before this route.");
  }
  return req.caller;
}
