import type { ContactSubmissionRepository } from "./contact-submissions.repository.js";
import type { ContactSubmission } from "./contact-submissions.types.js";

export class ContactSubmissionService {
  public constructor(private readonly repository: ContactSubmissionRepository) {}

  public async submit(submission: ContactSubmission): Promise<void> {
    await this.repository.create(submission);
  }
}
