import express from "express";
import { healthRouter } from "./routes/health.js";

// Builds the Express app without starting a server, so tests can use it directly.
export function createApp() {
  const app = express();
  app.use(express.json());

  app.use("/api/health", healthRouter);

  return app;
}
