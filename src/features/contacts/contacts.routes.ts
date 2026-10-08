import { Router } from "express";

import { createSubmissionController } from "./contacts.controller.js";
import { createSubmissionService } from "./contacts.service.js";
import type { SubmissionRepository } from "./contacts.types.js";

export function createContactRoutes(repository: SubmissionRepository): Router {
  const router = Router();
  router.post("/", createSubmissionController(createSubmissionService(repository)));
  return router;
}
