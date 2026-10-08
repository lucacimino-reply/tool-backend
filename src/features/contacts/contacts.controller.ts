import type { Request, Response } from "express";

import type { createSubmissionService } from "./contacts.service.js";
import type { NewSubmission } from "./contacts.types.js";

type SubmissionService = ReturnType<typeof createSubmissionService>;
type SubmissionRequest = Request<Record<string, never>, unknown, unknown>;

export function createSubmissionController(service: SubmissionService) {
  return async (request: SubmissionRequest, response: Response): Promise<void> => {
    const result = await service.submit(request.body);
    if (result.kind === "invalid") {
      response.status(400).json({ error: "validation_failed", fields: result.fields });
      return;
    }
    if (result.kind === "capacity") {
      response.status(429).json({ error: "capacity_unavailable" });
      return;
    }

    const accepted: NewSubmission = result.submission;
    response.status(201).json({ submission: accepted });
  };
}
