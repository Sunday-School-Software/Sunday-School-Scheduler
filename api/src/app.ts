import express from "express";
import { authRouter } from "./routes/auth.js";
import { requireCaller } from "./routes/caller.js";
import { bodyErrorHandler } from "./routes/errors.js";
import { healthRouter } from "./routes/health.js";
import type { AuthService } from "./services/auth.js";
import type { UserService } from "./services/users.js";

export interface Services {
  auth: AuthService;
  users: UserService;
}

// Builds the Express app without starting a server, so tests can use it directly.
export function createApp(services: Services) {
  const app = express();
  app.use(express.json());

  // Public: anyone can call these.
  app.use("/api/health", healthRouter);
  app.use("/api", authRouter(services.auth));

  // Every /api route mounted after this needs a signed-in caller, and can read
  // their Person with callerOf(req).
  app.use("/api", requireCaller(services.auth, services.users));

  app.use(bodyErrorHandler);

  return app;
}
