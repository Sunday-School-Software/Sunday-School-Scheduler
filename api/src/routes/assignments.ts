import { Router } from "express";
import { assignmentWindow } from "../dates.js";
import { DatabaseUnavailableError } from "../db/client.js";
import { isResponseStatus, RESPONSE_STATUSES, type ClassService } from "../services/classes.js";
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

  // The caller confirms their assignment or asks for a substitute (design §4,
  // steps 4-5 and 7). Only their own: the person comes from the token, and a
  // class they aren't assigned to gets 403 without anything being written.
  router.put("/:classId", async (req, res) => {
    const { status } = (req.body ?? {}) as { status?: unknown };
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : undefined;
    if (!isResponseStatus(normalized)) {
      res.status(400).json({
        error: `Status must be ${RESPONSE_STATUSES.map((s) => `"${s}"`).join(" or ")}.`,
      });
      return;
    }

    try {
      const assignment = await classService.update(req.params.classId, callerOf(req).personId, normalized);
      if (!assignment) {
        res.status(403).json({ error: "You're not assigned to that class." });
        return;
      }
      res.json({ assignment });
    } catch (err) {
      logFailure("Updating an assignment", err);
      res
        .status(err instanceof DatabaseUnavailableError ? 503 : 500)
        .json({ error: "Something went wrong. Please try again." });
    }
  });

  return router;
}
