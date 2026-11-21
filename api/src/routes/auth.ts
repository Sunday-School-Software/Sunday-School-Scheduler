import { Router, type Request, type Response } from "express";
import {
  AccountError,
  InvalidCredentialsError,
  InvalidTokenError,
  type AccountProblem,
  type AuthService,
} from "../services/auth.js";

// The token from an `Authorization: Bearer <token>` header.
export function bearerToken(req: Request): string | undefined {
  const match = /^Bearer (\S+)$/i.exec(req.get("authorization")?.trim() ?? "");
  return match?.[1];
}

// Logs only the error's message. Never log the request: it holds the password,
// the verification code or the token.
export function logFailure(action: string, err: unknown): void {
  const message = err instanceof Error ? err.message || err.name : String(err);
  console.error(`${action} failed: ${message}`);
}

const ACCOUNT_STATUS: Record<AccountProblem, number> = {
  exists: 409,
  "weak-password": 400,
  "invalid-input": 400,
  "wrong-code": 400,
  "expired-code": 400,
  "already-verified": 409,
  // The password was right, but the account can't sign in yet.
  "not-verified": 403,
  "too-many-attempts": 429,
};

// Answers an AccountError with its message, and anything else with a generic
// 500, logging only the cause. `problem` lets the UI tell the cases apart.
function sendFailure(res: Response, action: string, err: unknown, fallback: string): void {
  if (err instanceof AccountError) {
    res.status(ACCOUNT_STATUS[err.problem]).json({ error: err.message, problem: err.problem });
    return;
  }
  logFailure(action, err);
  res.status(500).json({ error: fallback });
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

// Longer than any name on a class schedule, but short enough to fit on one.
const MAX_NAME_LENGTH = 100;

export function authRouter(auth: AuthService): Router {
  const router = Router();

  router.post("/register", async (req, res) => {
    const { name, email, password } = (req.body ?? {}) as Record<string, unknown>;
    if (!nonEmptyString(name) || !nonEmptyString(email) || typeof password !== "string" || !password) {
      res.status(400).json({ error: "Enter your name, email and password." });
      return;
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      res.status(400).json({ error: `Enter a name of ${MAX_NAME_LENGTH} characters or fewer.` });
      return;
    }

    try {
      await auth.register({ name: name.trim(), email: email.trim(), password });
      res.status(201).json({});
    } catch (err) {
      sendFailure(res, "Sign-up", err, "Couldn't create your account. Please try again.");
    }
  });

  router.post("/register/verify", async (req, res) => {
    const { email, code } = (req.body ?? {}) as Record<string, unknown>;
    if (!nonEmptyString(email) || !nonEmptyString(code)) {
      res.status(400).json({ error: "Enter your email and the code we emailed you." });
      return;
    }

    try {
      await auth.verifyEmail(email.trim(), code.trim());
      res.json({});
    } catch (err) {
      sendFailure(res, "Verifying an email", err, "Couldn't verify your email. Please try again.");
    }
  });

  router.post("/register/resend", async (req, res) => {
    const { email } = (req.body ?? {}) as Record<string, unknown>;
    if (!nonEmptyString(email)) {
      res.status(400).json({ error: "Enter your email." });
      return;
    }

    try {
      await auth.resendCode(email.trim());
      res.json({});
    } catch (err) {
      sendFailure(res, "Sending a new code", err, "Couldn't send a new code. Please try again.");
    }
  });

  router.post("/login", async (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
      res.status(400).json({ error: "Enter your email and password." });
      return;
    }

    try {
      res.json(await auth.login(email.trim(), password));
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        res.status(401).json({ error: err.message });
        return;
      }
      sendFailure(res, "Login", err, "Couldn't sign in. Please try again.");
    }
  });

  router.post("/logout", async (req, res) => {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: "You're not signed in." });
      return;
    }

    try {
      await auth.logout(token);
      res.json({});
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        res.status(401).json({ error: "You're not signed in." });
        return;
      }
      logFailure("Logout", err);
      res.status(500).json({ error: "Couldn't sign out. Please try again." });
    }
  });

  return router;
}
