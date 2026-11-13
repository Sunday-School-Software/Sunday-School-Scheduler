import type { ErrorRequestHandler } from "express";

// express.json() rejects a body it can't read with a 400-range error. Express's
// default handler would log the error and send it back as HTML, and for bad
// JSON the message quotes part of the body, which can include a password.
// This answers with a fixed JSON message instead, and logs nothing.
export const bodyErrorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const { type, status } = (err ?? {}) as { type?: unknown; status?: unknown };
  if (typeof type !== "string" || typeof status !== "number" || status < 400 || status > 499) {
    next(err);
    return;
  }

  const error =
    type === "entity.parse.failed"
      ? "The request body isn't valid JSON."
      : "The request body couldn't be read.";
  res.status(status).json({ error });
};
