import type { ContactSubmissionInput, SubmissionRepository } from "./contacts.types.js";

export async function createSubmission(
  repository: SubmissionRepository,
  input: ContactSubmissionInput,
): Promise<void> {
  await repository.create(input);
}
