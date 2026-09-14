import type { Request, Response } from "express";

import { createSubmission } from "./contacts.service.js";
import { isValidationError, validateSubmission } from "./contacts.schema.js";
import type { ServerError, SubmissionRepository } from "./contacts.types.js";

export function createSubmissionController(repository: SubmissionRepository) {
  return async (request: Request, response: Response): Promise<void> => {
    const input = validateSubmission(request.body);
    if (isValidationError(input)) {
      response.status(400).json(input);
      return;
    }

    try {
      await createSubmission(repository, input);
      response.status(201).end();
    } catch (error) {
      console.error("Could not persist submission", error);
      const serverError: ServerError = { message: "Unable to process submission." };
      response.status(500).json(serverError);
    }
  };
}
