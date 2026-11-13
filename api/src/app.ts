import express from "express";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import type { AuthService } from "./services/auth.js";

export interface Services {
  auth: AuthService;
}

// Builds the Express app without starting a server, so tests can use it directly.
export function createApp(services: Services) {
  const app = express();
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api", authRouter(services.auth));

  return app;
}
