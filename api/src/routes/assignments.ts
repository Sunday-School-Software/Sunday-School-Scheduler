import { Router } from "express";
import { assignmentWindow } from "../dates.js";
import { DatabaseUnavailableError } from "../db/client.js";
import type { ClassService } from "../services/classes.js";
import { logFailure } from "./auth.js";
import { callerOf } from "./caller.js";

// Mount after requireCaller().
export function assignmentsRouter(classService: ClassService): Router {
  const router = Router();

  // The caller's own assignments for the next 4 Sundays (design §4, steps 2-3).
  // The person always comes from the verified token, never from the request.
  router.get("/", async (req, res) => {
    try {
      const assignments = await classService.listAssignments(
        callerOf(req).personId,
        assignmentWindow(new Date()),
      );
      res.json({ assignments });
    } catch (err) {
      logFailure("Listing assignments", err);
      res
        .status(err instanceof DatabaseUnavailableError ? 503 : 500)
        .json({ error: "Something went wrong. Please try again." });
    }
  });

  return router;
}
