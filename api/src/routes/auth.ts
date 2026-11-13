import { Router, type Request } from "express";
import { InvalidCredentialsError, InvalidTokenError, type AuthService } from "../services/auth.js";

// The token from an `Authorization: Bearer <token>` header.
function bearerToken(req: Request): string | undefined {
  const match = /^Bearer (\S+)$/i.exec(req.get("authorization")?.trim() ?? "");
  return match?.[1];
}

// Logs only the error's message. Never log the request: it holds the password
// or the token.
function logFailure(action: string, err: unknown): void {
  const message = err instanceof Error ? err.message || err.name : String(err);
  console.error(`${action} failed: ${message}`);
}

export function authRouter(auth: AuthService): Router {
  const router = Router();

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
      logFailure("Login", err);
      res.status(500).json({ error: "Couldn't sign in. Please try again." });
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
