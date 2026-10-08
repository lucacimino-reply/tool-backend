import { submissionSchema } from "./contacts.schema.js";
import type { NewSubmission, SubmissionRepository, SubmissionResult, ValidationFields } from "./contacts.types.js";

export function createSubmissionService(repository: SubmissionRepository) {
  return {
    async submit(input: unknown): Promise<SubmissionResult> {
      const parsed = submissionSchema.safeParse(input);
      if (!parsed.success) {
        const fields: ValidationFields = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if ((field === "name" || field === "email") && fields[field] === undefined) {
            fields[field] = issue.message;
          }
          if (issue.path.length === 0) {
            fields.name ??= "Name is required.";
            fields.email ??= "Email is required.";
          }
        }
        return { kind: "invalid", fields };
      }

      const submission: NewSubmission = parsed.data;
      const stored = await repository.createWithinCapacity(submission);
      return stored ? { kind: "accepted", submission } : { kind: "capacity" };
    },
  };
}
