import express, { type RequestHandler, Router } from "express";

import { createSubmissionController } from "./submissions.controller.js";
import type { SubmissionStore } from "./submissions.types.js";

const requireJsonContentType: RequestHandler = (request, response, next) => {
  if (!request.is("application/json")) {
    response.status(415).json({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
    return;
  }
  next();
};

export function createSubmissionRouter(store: SubmissionStore): Router {
  const router = Router();
  router.post(
    "/api/submissions",
    requireJsonContentType,
    express.json({ limit: "16kb", strict: true }),
    createSubmissionController(store),
  );
  return router;
}
