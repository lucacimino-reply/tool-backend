import { Router } from "express";

import { createSubmissionController } from "./contacts.controller.js";
import type { SubmissionRepository } from "./contacts.types.js";

export function createContactsRouter(repository: SubmissionRepository): Router {
  const router = Router();
  router.post("/submissions", createSubmissionController(repository));
  return router;
}
