import type { Request, Response } from "express";

import { validateContactSubmission } from "./contact-submissions.schema.js";
import { ContactSubmissionService } from "./contact-submissions.service.js";

export function createContactSubmissionController(service: ContactSubmissionService) {
  return async (request: Request, response: Response): Promise<void> => {
    const result = validateContactSubmission(request.body);
    if (!result.valid) {
      response.status(422).json(result.errors);
      return;
    }

    try {
      await service.submit(result.data);
      response.status(201).end();
    } catch (error) {
      console.error("Contact submission persistence failed.", error);
      response.status(500).json({ message: "Unable to process submission." });
    }
  };
}
