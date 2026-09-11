import { Router } from "express";

import { createContactSubmissionController } from "./contact-submissions.controller.js";
import type { ContactSubmissionRepository } from "./contact-submissions.repository.js";
import { ContactSubmissionService } from "./contact-submissions.service.js";

export function createContactSubmissionRouter(repository: ContactSubmissionRepository): Router {
  const router = Router();
  const service = new ContactSubmissionService(repository);

  router.post("/contact-submissions", createContactSubmissionController(service));
  return router;
}
