import type { RequestHandler } from "express";
import type { ZodError } from "zod";

import { submissionBodySchema } from "./submissions.schema.js";
import { submitContact } from "./submissions.service.js";
import type {
  SubmissionErrorBody,
  SubmissionStore,
  SubmissionSuccessBody,
  SubmissionValidationErrorBody,
} from "./submissions.types.js";

function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "request");
    if (fields[field] !== undefined) {
      continue;
    }
    if (field === "email") {
      fields[field] = "Enter a valid email address, like alex@example.com.";
    } else if (field === "name") {
      fields[field] = "Name must contain between 1 and 100 characters.";
    } else {
      fields[field] = "Request body must include a name and email.";
    }
  }
  return fields;
}

export function createSubmissionController(store: SubmissionStore): RequestHandler {
  return async (request, response) => {
    const parsed = submissionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const body: SubmissionValidationErrorBody = {
        error: { code: "VALIDATION_FAILED", fields: fieldErrors(parsed.error) },
      };
      response.status(400).json(body);
      return;
    }

    try {
      const submission = await submitContact(store, parsed.data);
      if (submission === null) {
        const body: SubmissionErrorBody = { error: { code: "CAPACITY_EXCEEDED" } };
        response.status(429).json(body);
        return;
      }

      const body: SubmissionSuccessBody = {
        submission: {
          id: submission.id,
          name: submission.name,
          email: submission.email,
          createdAt: submission.createdAt.toISOString(),
        },
      };
      response.status(201).json(body);
    } catch (error) {
      console.error("Submission persistence failed.", error);
      const body: SubmissionErrorBody = { error: { code: "SUBMISSION_FAILED" } };
      response.status(500).json(body);
    }
  };
}
