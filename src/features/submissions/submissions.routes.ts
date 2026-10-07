import { Router } from "express";

import { createSubmissionController } from "./submissions.controller.js";
import type { SubmissionStore } from "./submissions.types.js";

export function createSubmissionRouter(store: SubmissionStore): Router {
  const router = Router();
  router.post("/api/submissions", createSubmissionController(store));
  return router;
}
